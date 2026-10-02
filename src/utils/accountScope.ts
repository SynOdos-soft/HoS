import { Preferences, DEFAULT_PREFS } from '../types';
import { getAllLogsRaw, outboxClaimFor, putLogRaw, setActiveAccount } from './storage';

export { getActiveAccount, setActiveAccount } from './storage';

/**
 * Per-account scoping of everything this device keeps locally.
 *
 * The app is offline-first: IndexedDB is the working copy of the logs and
 * localStorage holds the preferences blob. Both used to be device-wide, which
 * meant a second account signing in on the same phone/tablet saw the first
 * driver's history — and the sync engine would then upload it into the new
 * account (seedAccountFromLocal).
 *
 * Fix:
 *  - every log row carries `ownerId` (the Supabase user id that owns it);
 *    reads and writes are filtered to the active account;
 *  - preferences, their savedAt stamp and any pending incoming pull live under
 *    per-account localStorage keys;
 *  - rows written by older versions have no ownerId. They are claimed ONCE, by
 *    the account the device actually belonged to — never by whichever account
 *    happens to sign in first after the update.
 */

/** Written on every sign-in by storage.setActiveAccount; the device's account. */
const ACTIVE_ACCOUNT_KEY = 'hos-active-account';
/** One-shot guard so the legacy migration can never run twice. */
const SCOPE_MIGRATED_KEY = 'hos-account-scope-v1';
/** Which account claimed this device's legacy (pre-namespacing) data. */
const DEVICE_OWNER_KEY = 'hos-legacy-device-owner';

const LEGACY_PREFS_KEY = 'hos-preferences';
const LEGACY_PREFS_AT_KEY = 'hos-preferences-saved-at';

/**
 * Best guess at which account the legacy, unscoped data on this device belongs
 * to. Evidence, strongest first:
 *   1. the account this device was last scoped to (written by this version);
 *   2. an account that has actually synced from / authenticated on this device
 *      (a fresh account that never got past the sign-in gate has neither key);
 * Returns null when there is no evidence at all — the caller then makes the
 * data visible to nobody rather than guessing wrong.
 */
const detectLegacyOwner = (): string | null => {
  const recorded = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (recorded) return recorded;

  const candidates = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const m = /^hos-(?:sync-cursor|last-auth):(.+)$/.exec(key);
    if (m && localStorage.getItem(key)) candidates.add(m[1]);
  }
  // Ambiguous (two accounts used this device before) — don't guess.
  return candidates.size === 1 ? [...candidates][0] : null;
};

/**
 * Idempotent, called whenever a session appears. Claims legacy rows for their
 * real owner and puts `userId` in scope. Never throws: a failed migration must
 * not block sign-in (worst case the rows stay unscoped and stay hidden).
 */
export const ensureAccountScope = async (userId: string): Promise<void> => {
  try {
    if (!localStorage.getItem(SCOPE_MIGRATED_KEY)) {
      const owner = detectLegacyOwner();
      if (owner) {
        const unowned = (await getAllLogsRaw()).filter(l => !l.ownerId);
        for (const log of unowned) await putLogRaw({ ...log, ownerId: owner });
        const queued = await outboxClaimFor(owner);
        if (!localStorage.getItem(DEVICE_OWNER_KEY)) {
          localStorage.setItem(DEVICE_OWNER_KEY, owner);
        }
        console.info(`[scope] claimed ${unowned.length} legacy log(s) and ${queued} queued change(s) for the account this device already used`);
      }
      localStorage.setItem(SCOPE_MIGRATED_KEY, new Date().toISOString());
    }
  } catch (e) {
    console.warn('[scope] legacy data could not be claimed; it stays hidden', e);
  }
  setActiveAccount(userId);
};

// ---- Per-account preferences ---------------------------------------------

export const prefsKey = (userId: string): string => `${LEGACY_PREFS_KEY}:${userId}`;
export const prefsAtKey = (userId: string): string => `${LEGACY_PREFS_AT_KEY}:${userId}`;
export const incomingPrefsKey = (userId: string): string => `hos-preferences-incoming:${userId}`;

/** Parse a stored blob and fill in anything a later version added. */
const mergePrefs = (raw: string | null): Preferences => {
  let parsed: Partial<Preferences> = {};
  if (raw) {
    try {
      const decoded = JSON.parse(raw);
      if (decoded && typeof decoded === 'object') parsed = decoded;
    } catch {
      // Corrupt blob: fall back to defaults rather than losing the app.
    }
  }
  return {
    ...DEFAULT_PREFS,
    ...parsed,
    userProfile: { ...DEFAULT_PREFS.userProfile, ...(parsed.userProfile || {}) },
  };
};

/**
 * The account entitled to the legacy blob: whoever claimed it during the
 * migration, or — on a device that never signed in before this version — the
 * first account to read preferences.
 */
const legacyPrefsClaimant = (userId: string): boolean => {
  const owner = localStorage.getItem(DEVICE_OWNER_KEY);
  return owner === userId;
};

/**
 * Read a small device-level value that belongs to a driver (last used plate,
 * metadata preset) for one account. The pre-namespacing key is claimed — moved,
 * not copied — by the account that owned this device, exactly like the
 * preferences blob, so a second driver never inherits the first one's details.
 */
export const getScopedItem = (base: string, userId: string | null): string | null => {
  if (userId) {
    const scoped = safeGet(`${base}:${userId}`);
    if (scoped !== null) return scoped;
  }
  const legacy = safeGet(base);
  if (legacy === null) return null;
  if (!userId) return legacy;
  if (!legacyPrefsClaimant(userId)) return null;
  localStorage.setItem(`${base}:${userId}`, legacy);
  localStorage.removeItem(base);
  return legacy;
};

/** Write a small driver-specific value under the account in scope. */
export const setScopedItem = (base: string, userId: string | null, value: string): void => {
  try {
    localStorage.setItem(userId ? `${base}:${userId}` : base, value);
  } catch { /* quota / private mode */ }
};

/**
 * Read preferences for an account, claiming the legacy blob on first use so a
 * driver who used the app before signing in keeps their name, vehicles and
 * defaults. With no account in scope (signed out) the legacy key is read.
 */
export const readPrefs = (userId: string | null): Preferences => {
  if (!userId) return mergePrefs(safeGet(LEGACY_PREFS_KEY));
  const raw = safeGet(prefsKey(userId));
  if (raw) return mergePrefs(raw);
  const legacy = safeGet(LEGACY_PREFS_KEY);
  if (!legacy || !legacyPrefsClaimant(userId)) return mergePrefs(null);
  // Move (not copy) so no second account can ever read it.
  localStorage.setItem(prefsKey(userId), legacy);
  const at = safeGet(LEGACY_PREFS_AT_KEY);
  if (at) localStorage.setItem(prefsAtKey(userId), at);
  localStorage.removeItem(LEGACY_PREFS_KEY);
  localStorage.removeItem(LEGACY_PREFS_AT_KEY);
  return mergePrefs(legacy);
};

/** Persist preferences for an account (or the device when signed out). */
export const writePrefs = (userId: string | null, preferences: Preferences): void => {
  try {
    localStorage.setItem(userId ? prefsKey(userId) : LEGACY_PREFS_KEY, JSON.stringify(preferences));
  } catch { /* quota / private mode */ }
};

/** ISO timestamp of the last local save for an account. */
export const readPrefsSavedAt = (userId: string | null): string =>
  safeGet(userId ? prefsAtKey(userId) : LEGACY_PREFS_AT_KEY) || '';

export const writePrefsSavedAt = (userId: string | null, iso: string): void => {
  try {
    localStorage.setItem(userId ? prefsAtKey(userId) : LEGACY_PREFS_AT_KEY, iso);
  } catch { /* quota / private mode */ }
};

/**
 * Stage a preferences blob pulled from the cloud for an account, to be adopted
 * by the UI. Namespaced so a pull for one account can never overwrite another.
 */
export const putIncomingPrefs = (userId: string, data: unknown): void => {
  try {
    localStorage.setItem(incomingPrefsKey(userId), JSON.stringify(data));
  } catch { /* quota / private mode */ }
};

/** Take (and clear) the pending pull for an account, if any. */
export const takeIncomingPrefs = (userId: string): Record<string, unknown> | null => {
  const raw = safeGet(incomingPrefsKey(userId));
  if (!raw) return null;
  localStorage.removeItem(incomingPrefsKey(userId));
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

