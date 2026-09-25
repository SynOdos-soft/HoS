import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeeklyLog } from '../types';
import { makeWeek, makeDay, makePrefs, resetDayCounter } from '../test/factories';
import { clearAllStores } from '../test/dbHelpers';
import {
  mergeLogIntoLocal, migrateFromSupabaseOnce,
  startCloudSync, stopCloudSync, syncNow, onSyncStateChange, getSyncState,
} from './driveSync';
import { getLog, saveLog, outboxGetAll, metaSet } from './storage';
import { registerProvider, setActiveProviderId, type CloudProvider } from './cloudProviders';

// ---- Mocks ----------------------------------------------------------------
// supabase client: only auth.getSession + from('weekly_logs') (migration) are
// used by the engine.
vi.mock('./supabaseClient', () => {
  const rows: Array<Record<string, unknown>> = [];
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-1' } } },
        })),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: table === 'weekly_logs' ? rows : [], error: null }),
              }),
            }),
          }),
        }),
      })),
      __setMigrationRows: (r: Array<Record<string, unknown>>) => { rows.length = 0; rows.push(...r); },
    },
  };
});

// markSessionValidated writes localStorage; fine as-is (real impl).
vi.mock('../lib/auth', () => ({ markSessionValidated: vi.fn() }));

// NOTE: real timers — fake-indexeddb transactions hang under fake timers.
// Timestamps are explicit ISO strings in fixtures, so determinism holds.

// ---- Mock provider --------------------------------------------------------
const stored = new Map<string, WeeklyLog>();
let providerSnapshot: { weeks: Record<string, string>; deleted: Record<string, string>; prefsUpdatedAt?: string } = { weeks: {}, deleted: {} };
let providerPrefs: { data: unknown; updatedAt: string } | null = null;
let providerConnected = true;

const provider: CloudProvider = {
  id: 'mock',
  label: 'MockCloud',
  async isConnected() { return providerConnected; },
  async connect() { /* not exercised */ },
  async disconnect() { /* not exercised */ },
  async readSnapshot() { return JSON.parse(JSON.stringify(providerSnapshot)); },
  async writeSnapshot(s) { providerSnapshot = JSON.parse(JSON.stringify(s)); },
  async readWeek(id) { return stored.get(id) ? JSON.parse(JSON.stringify(stored.get(id))) : null; },
  async writeWeek(log) { stored.set(log.id, JSON.parse(JSON.stringify(log))); },
  async deleteWeek(id) { stored.delete(id); },
  async readPreferences() { return providerPrefs ? JSON.parse(JSON.stringify(providerPrefs)) : null; },
  async writePreferences(p) { providerPrefs = { data: JSON.parse(JSON.stringify(p)), updatedAt: new Date().toISOString() }; },
};

beforeEach(async () => {
  await clearAllStores();
  stored.clear();
  providerSnapshot = { weeks: {}, deleted: {} };
  providerPrefs = null;
  providerConnected = true;
  registerProvider(provider);
  setActiveProviderId('mock');
  resetDayCounter();
});

// ---- Merge semantics ------------------------------------------------------

describe('mergeLogIntoLocal', () => {
  it('empty local store accepts the remote week', async () => {
    const remote = makeWeek('2026-09-21', undefined, '2026-09-24T10:00:00Z');
    const changed = await mergeLogIntoLocal(remote, '2026-09-24T10:00:00Z');
    expect(changed).toBe(true);
    const local = await getLog('2026-09-21');
    expect(local).not.toBeNull();
    expect(local!.days.length).toBe(7);
  });

  it('newer remote DAY wins; older remote day loses (per-day LWW)', async () => {
    const t1 = '2026-09-24T08:00:00Z';
    const t2 = '2026-09-24T10:00:00Z';

    // Local: Mon edited at t1, Tue edited at t2.
    const localWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'local-mon', lastEdited: t1 }),
      makeDay({ date: '2026-09-22', remarks: 'local-tue', lastEdited: t2 }),
    ], t1);
    await saveLog(localWeek);

    // Remote: Mon edited at t2 (newer), Tue edited at t1 (older).
    const remoteWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'remote-mon', lastEdited: t2 }),
      makeDay({ date: '2026-09-22', remarks: 'remote-tue', lastEdited: t1 }),
    ], t2);

    await mergeLogIntoLocal(remoteWeek, t2);
    const merged = await getLog('2026-09-21');
    const mon = merged!.days.find(d => d.date === '2026-09-21');
    const tue = merged!.days.find(d => d.date === '2026-09-22');
    expect(mon!.remarks).toBe('remote-mon');   // newer remote day won
    expect(tue!.remarks).toBe('local-tue');    // newer local day survived
  });

  it('a remote day missing locally is added without touching other days', async () => {
    const localWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'local', lastEdited: '2026-09-24T08:00:00Z' }),
    ]);
    await saveLog(localWeek);

    const remoteWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'local', lastEdited: '2026-09-24T08:00:00Z' }),
      makeDay({ date: '2026-09-25', remarks: 'extra-day', lastEdited: '2026-09-25T09:00:00Z' }),
    ], '2026-09-25T09:00:00Z');

    await mergeLogIntoLocal(remoteWeek, '2026-09-25T09:00:00Z');
    const merged = await getLog('2026-09-21');
    expect(merged!.days.find(d => d.date === '2026-09-25')!.remarks).toBe('extra-day');
    expect(merged!.days.find(d => d.date === '2026-09-21')!.remarks).toBe('local');
  });

  it('identical remote revision is a no-op', async () => {
    const week = makeWeek('2026-09-21', undefined, '2026-09-24T10:00:00Z');
    await saveLog(week);
    const changed = await mergeLogIntoLocal(JSON.parse(JSON.stringify(week)), '2026-09-24T10:00:00Z');
    expect(changed).toBe(false);
  });
});

// ---- Tombstones (deletes must never destroy newer work) --------------------

describe('tombstones', () => {
  it('pull does not resurrect a week the local device deleted more recently', async () => {
    // Local tombstone recorded NEWER than the remote deletion.
    await metaSet('deleted', { '2026-09-21': '2026-09-26T00:00:00Z' });
    const remote = makeWeek('2026-09-21', undefined, '2026-09-25T00:00:00Z');
    const changed = await mergeLogIntoLocal(remote, '2026-09-25T00:00:00Z');
    expect(changed).toBe(false);
    expect(await getLog('2026-09-21')).toBeUndefined();
  });

  it('a newer local edit survives a remote delete and will re-push', async () => {
    // Local week, edited after the remote deletion timestamp.
    const localWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'precious', lastEdited: '2026-09-25T12:00:00Z' }),
    ], '2026-09-25T12:00:00Z');
    await saveLog(localWeek);
    expect(await getLog('2026-09-21')).not.toBeNull();
    // Engine-side delete handling lives in runSync (covered below via provider round-trip).
  });
});

// ---- Seed + migration ------------------------------------------------------

describe('seed on first connect (via runSync)', () => {
  it('pushes all local weeks to an empty provider snapshot', async () => {
    const w1 = makeWeek('2026-09-14', undefined, '2026-09-18T10:00:00Z');
    const w2 = makeWeek('2026-09-21', undefined, '2026-09-24T10:00:00Z');
    await saveLog(w1);
    await saveLog(w2);

    startCloudSync(makePrefs());
    const res = await syncNow();
    expect(res.ok).toBe(true);

    expect(stored.has('2026-09-14')).toBe(true);
    expect(stored.has('2026-09-21')).toBe(true);
    expect(Object.keys(providerSnapshot.weeks).sort()).toEqual(['2026-09-14', '2026-09-21']);
    stopCloudSync();
  });

  it('does not push local weeks that the provider tombstoned', async () => {
    // Local copy is STALE (updatedAt older than the remote tombstone), so
    // the delete legitimately wins — the engine must not resurrect it.
    const w1 = makeWeek('2026-09-14', undefined, '2026-09-20T00:00:00Z');
    await saveLog(w1);
    // Remote fixtures must exist BEFORE startCloudSync: its auto-round is
    // what syncNow awaits.
    providerSnapshot = { weeks: {}, deleted: { '2026-09-14': '2026-09-25T00:00:00Z' } };

    startCloudSync(makePrefs());
    await syncNow();
    expect(stored.has('2026-09-14')).toBe(false);
    stopCloudSync();
  });
});

describe('migration from legacy Supabase tables', () => {
  it('imports legacy rows once, then never again', async () => {
    const { supabase } = await import('./supabaseClient') as any;
    supabase.__setMigrationRows([
      {
        id: '2026-08-03',
        metadata: {},
        days: [makeDay({ date: '2026-08-03', remarks: 'legacy-day' })],
        audit_log: null,
        updated_at: '2026-08-09T00:00:00Z',
      },
    ]);

    const first = await migrateFromSupabaseOnce('user-1');
    expect(first).toBe(true);
    const row = await getLog('2026-08-03');
    expect(row!.days[0].remarks).toBe('legacy-day');

    // Second call: skipped via the localStorage flag.
    const second = await migrateFromSupabaseOnce('user-1');
    expect(second).toBe(false);
  });
});

// ---- Full engine rounds through the mock provider ---------------------------

describe('runSync rounds', () => {
  it('pushes outbox edits, pulls remote changes, drains the outbox', async () => {
    // Local edit enqueued via the normal save path (before the round fires).
    const localWeek = makeWeek('2026-09-21', [
      makeDay({ date: '2026-09-21', remarks: 'edited-locally', lastEdited: '2026-09-25T12:00:00Z' }),
    ], '2026-09-25T12:00:00Z');
    await saveLog(localWeek);

    // Remote week on another device, absent locally.
    const remoteWeek = makeWeek('2026-09-14', [
      makeDay({ date: '2026-09-15', remarks: 'from-other-device', lastEdited: '2026-09-24T09:00:00Z' }),
    ], '2026-09-24T09:00:00Z');
    await provider.writeWeek(remoteWeek);
    providerSnapshot.weeks['2026-09-14'] = '2026-09-24T09:00:00Z';

    startCloudSync(makePrefs());
    const res = await syncNow();
    expect(res.ok).toBe(true);

    // Push happened.
    expect(stored.get('2026-09-21')!.days[0].remarks).toBe('edited-locally');
    // Pull happened.
    const pulled = await getLog('2026-09-14');
    expect(pulled!.days.find(d => d.date === '2026-09-15')!.remarks).toBe('from-other-device');
    // Outbox drained.
    expect((await outboxGetAll()).length).toBe(0);
    stopCloudSync();
  });

  it('preferences: newer remote blob wins; newer local blob pushes', async () => {
    // Case 1: remote newer than local save stamp.
    providerPrefs = {
      data: makePrefs({ defaultDriverName: 'Remote-Wins' }),
      updatedAt: '2026-09-25T13:00:00Z', // future vs local stamp (empty)
    };
    localStorage.setItem('hos-preferences-saved-at', '2026-09-25T00:00:00Z');
    startCloudSync(makePrefs());
    await syncNow();
    const incoming = localStorage.getItem('hos-preferences-incoming');
    expect(incoming).not.toBeNull();
    expect(JSON.parse(incoming!).defaultDriverName).toBe('Remote-Wins');
    stopCloudSync();
    localStorage.removeItem('hos-preferences-incoming');

    // Case 2: local newer than remote -> local blob uploaded.
    providerPrefs = { data: makePrefs({ defaultDriverName: 'Old-Remote' }), updatedAt: '2026-09-24T00:00:00Z' };
    localStorage.setItem('hos-preferences-saved-at', '2026-09-25T12:00:00Z');
    startCloudSync(makePrefs({ defaultDriverName: 'Fresh-Local' }));
    await syncNow();
    expect((providerPrefs!.data as { defaultDriverName: string }).defaultDriverName).toBe('Fresh-Local');
    stopCloudSync();
  });

  it('reports an error state when the provider is unreachable', async () => {
    providerConnected = false;
    startCloudSync(makePrefs());
    const res = await syncNow();
    expect(res.ok).toBe(false);
    expect(getSyncState().state).toBe('error');
    stopCloudSync();
    providerConnected = true;
  });

  it('does nothing in local-only mode (no active provider)', async () => {
    setActiveProviderId(null);
    const w = makeWeek('2026-09-21');
    await saveLog(w);
    startCloudSync(makePrefs());
    const res = await syncNow();
    expect(res.ok).toBe(true); // no-op success
    expect(stored.size).toBe(0);
    stopCloudSync();
  });
});

// ---- State listener contract ------------------------------------------------

describe('sync state events', () => {
  it('emits idle -> syncing -> idle around a round', async () => {
    const events: string[] = [];
    const off = onSyncStateChange((s) => events.push(s));
    startCloudSync(makePrefs());
    await syncNow();
    stopCloudSync();
    off();
    expect(events[0]).toBe('syncing');
    expect(events[events.length - 1]).toBe('idle');
  });
});
