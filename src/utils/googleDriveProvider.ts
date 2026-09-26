import type { CloudProvider, CloudProviderSnapshot } from './cloudProviders';
import { registerProvider, ACTIVE_PROVIDER_KEY } from './cloudProviders';
import type { WeeklyLog, Preferences } from '../types';
import {
  readIndex, writeIndex, readWeek as storeReadWeek, writeWeek as storeWriteWeek,
  deleteWeekFile, readPrefs, writePrefs,
} from './driveStore';
import {
  buildGoogleConsentUrl, exchangeCodeWithBroker, getGoogleAccessToken,
  isDriveConnected, revokeDriveConnection,
} from './driveBroker';

/**
 * Google Drive (AppData folder) provider.
 * Authorization lives server-side in the token broker; file IO in driveStore.
 */

const CONNECTED_FLAG = 'hos-drive-connected';
/** Last OAuth-return failure, shown once in the Account tab (read-and-clear). */
export const DRIVE_HANDSHAKE_ERROR_KEY = 'hos-drive-handshake-error';

const provider: CloudProvider = {
  id: 'google-drive',
  label: 'Google Drive',

  async isConnected() {
    if (localStorage.getItem(CONNECTED_FLAG) !== 'true') return false;
    // Server is authoritative; localStorage is just a fast path.
    try {
      return await isDriveConnected();
    } catch {
      return false;
    }
  },

  async connect() {
    const { url } = await buildGoogleConsentUrl();
    window.location.href = url; // returns with ?code=...&state=<verifier>
  },

  async disconnect() {
    await revokeDriveConnection();
    localStorage.setItem(CONNECTED_FLAG, 'false');
  },

  async readSnapshot(): Promise<CloudProviderSnapshot | null> {
    await getGoogleAccessToken(); // prove/refresh access; throws if revoked
    const { index } = await readIndex();
    return { weeks: index.weeks || {}, deleted: index.deleted || {}, prefsUpdatedAt: index.prefsUpdatedAt };
  },

  async writeSnapshot(s: CloudProviderSnapshot) {
    const { fileId } = await readIndex();
    await writeIndex(
      {
        weeks: s.weeks,
        deleted: s.deleted,
        prefsUpdatedAt: s.prefsUpdatedAt,
        schema: 1,
      },
      fileId
    );
  },

  async readWeek(weekId) {
    return storeReadWeek(weekId);
  },

  async writeWeek(log: WeeklyLog) {
    await storeWriteWeek(log);
  },

  async deleteWeek(weekId) {
    await deleteWeekFile(weekId);
  },

  async readPreferences() {
    return readPrefs();
  },

  async writePreferences(p: Preferences) {
    await writePrefs(p);
  },
};

registerProvider(provider);

/** Complete the OAuth return (?code=...&state=<verifier>) if present. Returns true when a handshake finished. */
export const completeGoogleDriveHandshake = async (): Promise<boolean> => {
  const url = new URL(window.location.href);
  // Google redirects back with ?error=... when consent is declined or the
  // OAuth client is misconfigured. Record the reason for the Account tab
  // instead of failing silently; an existing server-side connection (if any)
  // is left untouched — the UI verifies against the broker.
  const consentError = url.searchParams.get('error');
  if (consentError && !url.searchParams.get('code')) {
    localStorage.setItem(
      DRIVE_HANDSHAKE_ERROR_KEY,
      consentError === 'access_denied'
        ? 'Consent was declined. To back up your logs, allow access when Google asks.'
        : `Google rejected the sign-in (${consentError}).`
    );
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }
  const code = url.searchParams.get('code');
  const verifier = url.searchParams.get('state');
  if (!code || !verifier || !url.searchParams.get('scope')) return false;
  try {
    await exchangeCodeWithBroker(code, verifier);
    localStorage.setItem(CONNECTED_FLAG, 'true');
    // Selection is now earned: only a completed broker exchange marks this
    // provider active, so the Account card can never show a phantom "On".
    localStorage.setItem(ACTIVE_PROVIDER_KEY, provider.id);
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  } catch (e) {
    console.error('[google-drive] handshake failed', e);
    localStorage.setItem(
      DRIVE_HANDSHAKE_ERROR_KEY,
      e instanceof Error ? e.message : 'Google authorization failed. Please try connecting again.'
    );
    // Roll back the pre-redirect selection: the server holds no tokens, so
    // the Account card must return to "Connect Google Drive" instead of
    // claiming a connection that was never established.
    localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    localStorage.setItem(CONNECTED_FLAG, 'false');
    return false;
  }
};

export const googleDriveProvider = provider;
