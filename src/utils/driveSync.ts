import { markSessionValidated } from '../lib/auth';
import { WeeklyLog, Preferences } from '../types';
import { supabase } from './supabaseClient';
import { getActiveProvider } from './cloudProviders';
import {
  getAllLogs, getLog, putLogRaw, outboxGetAll, outboxClear, metaGet, metaSet,
  onLogMutation,
} from './storage';

/**
 * Cloud backup & device sync engine.
 *
 * Data always lives locally. When the user connects an optional cloud
 * provider (Google Drive today; S3/DropBox tomorrow), this engine layers
 * backup + device-to-device merging through that provider using the same
 * no-data-loss semantics: per-day last-write-wins, tombstone deletes,
 * outbox push, seed-on-first-connect.
 *
 * With no provider connected the engine is idle and the app remains fully
 * functional offline — exactly as it was before clouds existed.
 */

const SYNC_STATE_KEY = 'drive-sync-state';
const PREFS_LOCAL_AT_KEY = 'hos-preferences-saved-at'; // shared with App.tsx
const MIGRATED_KEY = 'drive-migrated-from-supabase';

type SyncState = 'idle' | 'syncing' | 'error';
type SyncListener = (state: SyncState, message: string) => void;

let state: SyncState = 'idle';
let message = '';
const listeners = new Set<SyncListener>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let syncing = false;
let pendingResync = false;
/** Resolves when the in-flight round settles (for syncNow + tests). */
let currentRound: Promise<void> = Promise.resolve();
let lastPreferencesRef: Preferences | null = null;

const setState = (s: SyncState, msg = '') => {
  state = s; message = msg;
  listeners.forEach(l => { try { l(state, message); } catch { /* ignore */ } });
};

export const onSyncStateChange = (l: SyncListener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getSyncState = () => ({ state, message });

const setLastSyncedAt = (iso: string) => localStorage.setItem('hos-last-sync-at', iso);

export const schedulePush = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void runSync(); }, 3000);
};

export const syncNow = async (): Promise<{ ok: boolean; error: string | null }> => {
  if (!started) return { ok: false, error: 'Sync is not running (connect Google Drive first).' };
  await currentRound; // await the in-flight round (startCloudSync fires one)
  const { state: s, message: msg } = getSyncState();
  return s === 'error' ? { ok: false, error: msg || 'Sync failed.' } : { ok: true, error: null };
};

// ---- Merge helpers (identical semantics to the previous engine) ----

export const mergeLogIntoLocal = async (remote: WeeklyLog, remoteUpdatedAt: string): Promise<boolean> => {
  const local = await getLog(remote.id);
  if (!local) {
    const tombstones = (await metaGet('deleted')) as Record<string, string> | undefined;
    if (tombstones?.[remote.id] && tombstones[remote.id] > (remote.updatedAt || remoteUpdatedAt)) return false;
    await putLogRaw(remote);
    return true;
  }
  const localStamp = local.updatedAt;
  if (localStamp === (remote.updatedAt || remoteUpdatedAt)) return false;

  const byDate = new Map(local.days.map(d => [d.date, d]));
  let changed = false;
  const merged = local.days.map(d => ({ ...d }));
  for (const rDay of remote.days) {
    const lDay = byDate.get(rDay.date);
    if (!lDay) { merged.push(rDay); changed = true; continue; }
    const lStamp = lDay.lastEdited || '';
    const rStamp = rDay.lastEdited || '';
    // Address by DATE: `merged` holds shallow copies, so indexOf(lDay) would
    // always miss. (Bug caught by unit tests — newer remote days were being
    // silently dropped.)
    const idx = merged.findIndex(d => d.date === rDay.date);
    if (rStamp && lStamp && rStamp > lStamp) {
      if (idx >= 0) merged[idx] = rDay;
      changed = true;
    } else if (!lStamp && (!rStamp || rStamp > (localStamp || ''))) {
      if (idx >= 0) merged[idx] = rDay;
      changed = true;
    }
  }
  const mergedLog: WeeklyLog = {
    ...local,
    metadata: (remote.updatedAt || remoteUpdatedAt) > (localStamp || '') ? remote.metadata : local.metadata,
    days: merged.sort((a, b) => a.date.localeCompare(b.date)),
    auditLog: ((remote.auditLog?.length || 0) > (local.auditLog?.length || 0)) ? remote.auditLog : local.auditLog,
    updatedAt: remote.updatedAt || remoteUpdatedAt,
  };
  await putLogRaw(mergedLog);
  return changed;
};

// ---- Migration from the legacy Supabase tables ----

/**
 * One-time per device: pull every weekly_logs row down into local IndexedDB.
 * A later sync round then pushes everything to Drive. Legacy tables are never
 * written and never deleted — they stay frozen as a read-only archive.
 */
export const migrateFromSupabaseOnce = async (userId: string): Promise<boolean> => {
  const migrated = localStorage.getItem(MIGRATED_KEY);
  if (migrated === userId) return false;
  localStorage.setItem(MIGRATED_KEY, userId); // set first: even a partial run must not loop

  const { data, error } = await supabase
    .from('weekly_logs')
    .select('id, metadata, days, audit_log, updated_at')
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (error) { console.error('[drive-sync] migration read failed', error); return false; }
  if (!data || data.length === 0) return false;

  for (const row of data) {
    const log: WeeklyLog = {
      id: row.id,
      metadata: row.metadata ?? ({} as WeeklyLog['metadata']),
      days: row.days ?? [],
      auditLog: row.audit_log ?? undefined,
      updatedAt: row.updated_at,
    };
    await mergeLogIntoLocal(log, row.updated_at);
  }
  console.info(`[drive-sync] migrated ${data.length} week(s) from legacy Supabase tables`);
  return true;
};

// ---- Core sync round ----

const runSync = async (): Promise<void> => {
  if (!started) return;
  if (syncing) { pendingResync = true; return; }
  const provider = getActiveProvider();
  if (!provider) return; // local-only mode: nothing to do, stay idle
  syncing = true;
  const round = (async () => {
  setState('syncing');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setState('idle');
      return;
    }

    if (!(await provider.isConnected())) {
      setState('error', `${provider.label} is not connected.`);
      return;
    }

    await migrateFromSupabaseOnce(user.id);

    // ---- Read provider snapshot ----
    const remoteIndex = (await provider.readSnapshot()) || { weeks: {}, deleted: {}, prefsUpdatedAt: undefined };

    // ---- First-connect seed: local weeks absent from the snapshot ----
    const localLogs = await getAllLogs();
    const indexWeeks = remoteIndex.weeks || {};
    const newLocalWeeks = localLogs.filter(l => !indexWeeks[l.id] && !(remoteIndex.deleted || {})[l.id]);

    // ---- Push outbox (compacted: one op per week) ----
    const entries = await outboxGetAll();
    const latest = new Map<string, { kind: string; ts: string }>();
    for (const e of entries) {
      const prev = latest.get(e.logId);
      if (!prev || e.ts >= prev.ts) latest.set(e.logId, { kind: e.kind, ts: e.ts });
    }

    const nextIndex = {
      weeks: { ...indexWeeks },
      deleted: { ...(remoteIndex.deleted || {}) },
      prefsUpdatedAt: remoteIndex.prefsUpdatedAt,
    };

    for (const [logId, op] of latest) {
      if (op.kind === 'log-deleted') {
        await provider.deleteWeek(logId);
        delete nextIndex.weeks[logId];
        nextIndex.deleted[logId] = op.ts;
        // Record the local tombstone so a later pull never resurrects this
        // week from a stale remote copy (guarded by timestamp in the merge).
        const localTombstones = { ...((await metaGet('deleted')) as Record<string, string> | undefined || {}) };
        localTombstones[logId] = op.ts;
        await metaSet('deleted', localTombstones);
      } else {
        const log = await getLog(logId);
        if (!log) continue;
        // A provider tombstone suppresses one push round: the local device
        // just learned the week was deleted elsewhere. If the local copy is
        // genuinely newer, the NEXT local edit re-enqueues and wins; if not,
        // the delete stands and the stale copy stays only on this device.
        if (nextIndex.deleted[logId]) continue;
        await provider.writeWeek(log);
        nextIndex.weeks[logId] = log.updatedAt || op.ts;
        delete nextIndex.deleted[logId];
      }
    }

    for (const log of newLocalWeeks) {
      await provider.writeWeek(log);
      nextIndex.weeks[log.id] = log.updatedAt || new Date().toISOString();
    }

    // ---- Pull remote weeks changed since our last look ----
    const lastSeen = (await metaGet(`${SYNC_STATE_KEY}:${provider.id}`)) as Record<string, string> | undefined;
    const seen = lastSeen || {};
    for (const [weekId, remoteUpdated] of Object.entries(nextIndex.weeks)) {
      if (seen[weekId] === remoteUpdated) continue;
      const remote = await provider.readWeek(weekId);
      if (remote) await mergeLogIntoLocal(remote, remoteUpdated);
      seen[weekId] = remoteUpdated;
    }

    // ---- Preferences ----
    const localPrefs = lastPreferencesRef;
    const remotePrefs = await provider.readPreferences();
    let wrotePrefs = false;
    const remotePrefsAt = remotePrefs?.updatedAt || '';
    const localSavedAt = localStorage.getItem(PREFS_LOCAL_AT_KEY) || '';
    if (!remotePrefs && localPrefs) {
      await provider.writePreferences(localPrefs);
      nextIndex.prefsUpdatedAt = new Date().toISOString();
      wrotePrefs = true;
    } else if (remotePrefsAt && remotePrefsAt > localSavedAt && remotePrefs) {
      // Remote wins only if genuinely newer — same guard as before.
      const incoming = remotePrefs.data;
      localStorage.setItem('hos-preferences-incoming', JSON.stringify({ ...incoming, savedAt: remotePrefsAt }));
      window.dispatchEvent(new CustomEvent('hos-prefs-incoming'));
    } else if (localPrefs && (!remotePrefsAt || localSavedAt > remotePrefsAt)) {
      await provider.writePreferences(localPrefs);
      nextIndex.prefsUpdatedAt = new Date().toISOString();
      wrotePrefs = true;
    }

    await provider.writeSnapshot(nextIndex);
    await metaSet(`${SYNC_STATE_KEY}:${provider.id}`, seen);
    await outboxClear();
    setLastSyncedAt(new Date().toISOString());
    markSessionValidated(user.id);
    if (wrotePrefs) localStorage.setItem(PREFS_LOCAL_AT_KEY, new Date().toISOString());
    setState('idle');
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[cloud-sync] failed (will retry on next trigger)', e);
    setState('error', errMsg);
  } finally {
    syncing = false;
    if (pendingResync) {
      pendingResync = false;
      schedulePush();
    }
  }
  })();
  currentRound = round;
  try { await round; } finally { if (currentRound === round) currentRound = Promise.resolve(); }
};

const handleOnline = () => void runSync();
const handleVisibility = () => {
  if (document.visibilityState === 'visible') void runSync();
};

export const startCloudSync = (preferences: Preferences) => {
  started = true;
  lastPreferencesRef = preferences;
  if (!periodicTimer) periodicTimer = setInterval(() => void runSync(), 60 * 1000);
  onLogMutation(() => schedulePush());
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);
  void runSync();
};

export const stopCloudSync = () => {
  started = false;
  if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('focus', handleOnline);
  document.removeEventListener('visibilitychange', handleVisibility);
  setState('idle');
};

export const setCloudSyncPreferences = (preferences: Preferences) => {
  lastPreferencesRef = preferences;
  if (started) schedulePush();
};

export const isCloudSyncRunning = () => started;
