type OAuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STATE_KEY = 'hos-google-drive-oauth-state';
const VERIFIER_KEY = 'hos-google-drive-pkce-verifier';

/** Create an independent 256-bit, base64url-encoded CSRF state nonce. */
export const createGoogleOAuthState = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Store the transaction only in this browser tab; neither value goes in the URL. */
export const storeGoogleOAuthTransaction = (
  state: string,
  verifier: string,
  storage: OAuthStorage = window.sessionStorage,
): void => {
  storage.setItem(STATE_KEY, state);
  storage.setItem(VERIFIER_KEY, verifier);
};

/** Return the saved verifier only when Google's state matches this tab's nonce. */
export const getGoogleOAuthVerifier = (
  returnedState: string | null,
  storage: OAuthStorage = window.sessionStorage,
): string | null => {
  if (!returnedState || storage.getItem(STATE_KEY) !== returnedState) return null;
  const verifier = storage.getItem(VERIFIER_KEY);
  return verifier && verifier.trim() ? verifier : null;
};

/** Clear a completed/failed transaction without erasing a newer pending one. */
export const clearGoogleOAuthTransaction = (
  expectedState: string,
  storage: OAuthStorage = window.sessionStorage,
): void => {
  if (storage.getItem(STATE_KEY) !== expectedState) return;
  storage.removeItem(STATE_KEY);
  storage.removeItem(VERIFIER_KEY);
};
