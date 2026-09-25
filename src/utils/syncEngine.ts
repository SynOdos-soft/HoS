import { supabase, getDeviceId } from './supabaseClient';
import { markSessionValidated } from '../lib/auth';
import { WeeklyLog, Preferences } from '../types';
import {
  getAllLogs, getLog, putLogRaw, outboxGetAll, outboxClear,
  onLogMutation, type LogMutation,
} from './storage';

/**
 * Cloud sync engine — the "no data loss" core.
 *
 * Model:
 *  - Local IndexedDB is always the working copy; the cloud is the durable mirror.
 *  - PUSH: local edits enqueue outbox entries (storage.ts) and are flushed to
 *    Supabase as idempotent upserts keyed by (user_id, week id).
 *  - PULL: rows changed remotely since our lastSyncedAt cursor are merged in.
 *  - MERGE: per-DAY last-write-wins on the day's `lastEdited` timestamp, so two
 *    devices editing different days of the same week both keep their work.
 *    Deletes are tombstones — a pull never deletes local data unless the remote
 *    tombstone is newer than the local copy's last edit.
 *  - SEED: on first sign-in (server has zero rows for the user), every local
 *    log is uploaded so years of existing device data join the account.
 *
 * Everything is offline-safe: any failure leaves the outbox intact and retries
 * happen on the next trigger (mutation, online event, focus, timer).
 */

const SYNC_CURSOR_KEY = 'hos-sync-cursor';       // per-user ISO timestamp
const SYNC_PREFS_AT_KEY = 'hos-sync-prefs-at';   // per-user ISO timestamp

type SyncState = 'idle' | 'syncing' | 'error';
type SyncListener = (state: SyncState, message: string) => void;

const LAST_SYNC_KEY = 'hos-last-sync-at';

/** ISO timestamp of the last completed sync this device performed. */
export const getLastSyncedAt = (): string => localStorage.getItem(LAST_SYNC_KEY) || '';

let state: SyncState = 'idle';
let message = '';
const listeners = new Set<SyncListener>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let syncing = false;
let pendingResync = false;

const cursorFor = (userId: string) => `${SYNC_CURSOR_KEY}:${userId}`;
const prefsAtFor = (userId: string) => `${SYNC_PREFS_AT_KEY}:${userId}`;

export const onSyncStateChange = (l: SyncListener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const setState = (s: SyncState, msg = '') => {
  state = s;
  message = msg;
  listeners.forEach(l => {
    try { l(state, message); } catch { /* listener errors must not break sync */ }
  });
};

export const getSyncState = () => ({ state, message });

const getCursor = (userId: string) => localStorage.getItem(cursorFor(userId)) || '';
const setCursor = (userId: string, iso: string) => localStorage.setItem(cursorFor(userId), iso);
const getPrefsAt = (userId: string) => localStorage.getItem(prefsAtFor(userId)) || '';
const setPrefsAt = (userId: string, iso: string) => localStorage.setItem(prefsAtFor(userId), iso);

/** Fire-and-forget: schedule a push flush shortly after a local mutation. */
export const schedulePush = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void runSync(); }, 3000);
};

/** Manual full sync round (pull + push), e.g. from a "Sync now" button. */
export const syncNow = async (): Promise<{ ok: boolean; error: string | null }> => {
  if (!started) return { ok: false, error: 'Sync is not running (sign in first).' };
  await runSync();
  const { state: s, message: msg } = getSyncState();
  return s === 'error' ? { ok: false, error: msg || 'Sync failed.' } : { ok: true, error: null };
};

const rowFromLog = (log: WeeklyLog, userId: string) => ({
  id: log.id,
  user_id: userId,
  metadata: log.metadata ?? {},
  days: log.days ?? [],
  audit_log: log.auditLog ?? null,
  deleted: false,
  device_id: getDeviceId(),
});

interface SyncLogRow {
  id: string;
  metadata: WeeklyLog['metadata'] | null;
  days: WeeklyLog['days'] | null;
  audit_log: WeeklyLog['auditLog'] | null;
  deleted: boolean;
  updated_at: string;
}

const logFromRow = (row: SyncLogRow): WeeklyLog => ({
  id: row.id,
  metadata: row.metadata ?? ({} as WeeklyLog['metadata']),
  days: row.days ?? [],
  auditLog: row.audit_log ?? undefined,
  updatedAt: row.updated_at,
});

/**
 * Per-day merge: for each week, keep whichever copy of each DAY is newer by
 * its `lastEdited` timestamp. Falls back to whole-row updated_at when a day
 * has no stamp (defensive against legacy rows). Guarantees neither device's
 * work on different days is ever discarded.
 */
const mergeLogIntoLocal = async (remote: WeeklyLog, remoteUpdatedAt: string) => {
  const local = await getLog(remote.id);

  if (!local) {
    // New week from another device — but never resurrect a week the local
    // device tombstoned more recently than the remote copy's last edit.
    const tombstone = localStorage.getItem(`hos-deleted:${remote.id}`);
    if (tombstone && tombstone > (remote.updatedAt || remoteUpdatedAt)) return false;
    await putLogRaw(remote);
    return true;
  }

  const localStamp = local.updatedAt as string | undefined;
  // Fast path: we already have this exact remote revision.
  if (localStamp === (remote.updatedAt || remoteUpdatedAt)) return false;

  const remoteDays = remote.days ?? [];
  const localDays = local.days ?? [];
  const byDate = new Map(localDays.map(d => [d.date, d]));

  let changed = false;
  const merged = localDays.map(d => ({ ...d }));
  const mergedByDate = new Map(merged.map(d => [d.date, d]));

  for (const rDay of remoteDays) {
    const lDay = byDate.get(rDay.date);
    if (!lDay) {
      // Day exists remotely but not locally: accept it (it was created on
      // another device or is a schema addition) — never a data loss: local
      // days are preserved untouched below.
      merged.push(rDay);
      mergedByDate.set(rDay.date, rDay);
      changed = true;
      continue;
    }
    const lStamp = lDay.lastEdited || '';
    const rStamp = rDay.lastEdited || '';
    if (rStamp && lStamp && rStamp > lStamp) {
      const idx = merged.indexOf(lDay);
      if (idx >= 0) merged[idx] = rDay;
      mergedByDate.set(rDay.date, rDay);
      changed = true;
    } else if (!lStamp && (!rStamp || rStamp > (localStamp || ''))) {
      // Legacy local day without a stamp; remote is authoritative only if
      // the whole remote row is newer than anything we have locally.
      const idx = merged.indexOf(lDay);
      if (idx >= 0) merged[idx] = rDay;
      mergedByDate.set(rDay.date, rDay);
      changed = true;
    }
    // else: local copy of the day is equal or newer — keep it. The pending
    // outbox entry (if any) will push this newer local day up.
  }

  // Metadata + audit: row-level LWW as a coarse fallback for non-day fields.
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

/** First sign-in: upload every local log so existing device history joins the account. */
const seedAccountFromLocal = async (userId: string): Promise<boolean> => {
  const { count, error } = await supabase
    .from('weekly_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  if ((count ?? 0) > 0) return false; // account already has data — nothing to seed

  const localLogs = await getAllLogs();
  if (localLogs.length === 0) return false;

  const rows = localLogs.map(l => rowFromLog(l, userId));
  const { error: upsertErr } = await supabase
    .from('weekly_logs')
    .upsert(rows, { onConflict: 'user_id,id' });
  if (upsertErr) throw upsertErr;
  return true;
};

const pushOutbox = async (userId: string): Promise<void> => {
  const entries = await outboxGetAll();
  if (entries.length === 0) return;

  // Compact: keep only the latest entry per log id, preserving delete semantics.
  const latest = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    const prev = latest.get(e.logId);
    if (!prev || e.ts >= prev.ts) latest.set(e.logId, e);
  }

  for (const entry of latest.values()) {
    if (entry.kind === 'log-deleted') {
      // Tombstone: never hard-delete; other devices learn via deleted=true.
      const { error } = await supabase
        .from('weekly_logs')
        .upsert({
          id: entry.logId,
          user_id: userId,
          deleted: true,
          device_id: getDeviceId(),
          metadata: {},
          days: [],
        }, { onConflict: 'user_id,id' });
      if (error) throw error;
      localStorage.setItem(`hos-deleted:${entry.logId}`, entry.ts);
    } else {
      const log = await getLog(entry.logId);
      if (!log) continue; // edited then deleted before flush; delete entry remains
      const { error } = await supabase
        .from('weekly_logs')
        .upsert(rowFromLog(log, userId), { onConflict: 'user_id,id' });
      if (error) throw error;
    }
  }

  // Clear only after every entry in this batch uploaded successfully.
  await outboxClear();
};

const pullRemote = async (userId: string): Promise<void> => {
  const since = getCursor(userId);
  let query = supabase
    .from('weekly_logs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
    .limit(500);
  if (since) query = query.gt('updated_at', since);

  const { data, error } = await query;
  if (error) throw error;

  let maxUpdated = since;
  for (const row of data ?? []) {
    if (!row.updated_at || row.updated_at > maxUpdated) maxUpdated = row.updated_at;
    if (row.deleted) {
      const tombstone = localStorage.getItem(`hos-deleted:${row.id}`);
      const local = await getLog(row.id);
      const newestDayEdit = (local?.days ?? []).reduce(
        (acc, d) => (d.lastEdited && d.lastEdited > acc ? d.lastEdited : acc), ''
      );
      const localStamp = local?.updatedAt || newestDayEdit || '';
      // Delete only if the tombstone is newer than anything local. A newer
      // local edit survives and will be pushed back up (delete loses).
      if (!local || (row.updated_at > localStamp && (!tombstone || row.updated_at > tombstone))) {
        if (local) await putLogRaw({ ...local, days: [], updatedAt: row.updated_at, deleted: true });
        localStorage.setItem(`hos-deleted:${row.id}`, row.updated_at);
      }
      continue;
    }
    await mergeLogIntoLocal(logFromRow(row), row.updated_at);
  }
  if (maxUpdated) setCursor(userId, maxUpdated);

  // Preferences: whole-blob LWW guarded against overwriting newer local edits.
  const { data: prefRow, error: prefErr } = await supabase
    .from('user_preferences')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (prefErr) throw prefErr;
  if (prefRow?.updated_at && prefRow.updated_at > getPrefsAt(userId)) {
    const localSavedAt = localStorage.getItem('hos-preferences-saved-at') || '';
    if (prefRow.updated_at > localSavedAt) {
      const incoming = prefRow.data as Partial<Preferences>;
      localStorage.setItem('hos-preferences-incoming', JSON.stringify(incoming));
      setPrefsAt(userId, prefRow.updated_at);
      window.dispatchEvent(new CustomEvent('hos-prefs-incoming'));
    } else {
      setPrefsAt(userId, prefRow.updated_at);
    }
  }
};

const pushPreferences = async (userId: string, preferences: Preferences) => {
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      { user_id: userId, data: JSON.parse(JSON.stringify(preferences)) as Record<string, unknown> },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
  const now = new Date().toISOString();
  setPrefsAt(userId, now);
  localStorage.setItem('hos-preferences-saved-at', now);
};

let lastPreferencesRef: Preferences | null = null;
let prefsDirty = false;

/**
 * Feed the engine the latest preferences blob. Called by the app whenever
 * preferences change, so pushes always carry fresh data (never a stale boot
 * snapshot).
 */
export const setSyncPreferences = (preferences: Preferences) => {
  lastPreferencesRef = preferences;
  prefsDirty = true;
  if (started) schedulePush();
};

export const runSync = async (preferences?: Preferences): Promise<void> => {
  if (preferences) lastPreferencesRef = preferences;
  if (!started) return;
  if (syncing) { pendingResync = true; return; }

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return; // signed out — nothing to do

  syncing = true;
  setState('syncing');
  try {
    const seeded = await seedAccountFromLocal(user.id);
    await pushOutbox(user.id);
    await pullRemote(user.id);
    if ((seeded || prefsDirty) && lastPreferencesRef) {
      await pushPreferences(user.id, lastPreferencesRef);
      prefsDirty = false;
    }
    // A completed sync is positive proof the server was reached: extend the
    // offline grace window (same anchor the auth token-refresh path uses).
    markSessionValidated(user.id);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    setState('idle');
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[sync] failed (will retry on next trigger)', e);
    setState('error', errMsg);
  } finally {
    syncing = false;
    if (pendingResync) {
      pendingResync = false;
      schedulePush();
    }
  }
};

const handleVisibility = () => {
  if (document.visibilityState === 'visible') void runSync();
};

const handleOnline = () => void runSync();

/** Start the engine once a session exists. Safe to call repeatedly. */
export const startSyncEngine = (preferences: Preferences) => {
  started = true;
  lastPreferencesRef = preferences;

  if (started && !periodicTimer) {
    periodicTimer = setInterval(() => void runSync(), 60 * 1000);
  }

  const onMutation: (m: LogMutation) => void = () => schedulePush();
  onLogMutation(onMutation);

  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  void runSync();
};

export const stopSyncEngine = () => {
  started = false;
  if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('focus', handleOnline);
  document.removeEventListener('visibilitychange', handleVisibility);
  setState('idle');
};
