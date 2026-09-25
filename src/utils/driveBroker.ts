import { supabase } from './supabaseClient';

/**
 * Client for the google-token-broker Edge Function.
 *
 * The browser never sees a Google refresh token: the broker exchanges the
 * PKCE authorization code server-side and later mints short-lived access
 * tokens for Drive. This is what makes Drive sync fully automatic.
 */

const BROKER_URL = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/google-token-broker`;

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

interface CachedToken {
  accessToken: string;
  /** ms epoch when the token stops being trusted (with safety margin). */
  expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * Guards against double-consuming a single-use authorization code: React
 * StrictMode and duplicated handshake callers must not race the exchange.
 * Maps state(verifier) -> in-flight exchange promise.
 */
const inFlightExchanges = new Map<string, Promise<{ accessToken: string; expiresInSeconds: number }>>();

/** Base64url helpers for PKCE. */
const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const createPkcePair = async (): Promise<{ verifier: string; challenge: string }> => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = b64url(bytes);
  // S256: challenge = base64url(SHA-256(ASCII(verifier))). Hashing the
  // verifier is mandatory — a plain base64 of it fails Google's check with
  // "Invalid code verifier".
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
};

const brokerCall = async (payload: Record<string, unknown>): Promise<Response> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return fetch(BROKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
};

/**
 * Build the Google OAuth consent URL (code flow + PKCE). The verifier is
 * returned to the caller, which must keep it until the redirect comes back.
 */
export const buildGoogleConsentUrl = async (): Promise<{ url: string; verifier: string }> => {
  const { verifier, challenge } = await createPkcePair();
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',          // we need a refresh token for automation
    prompt: 'consent',               // force refresh_token issuance
    include_granted_scopes: 'true',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier,                 // round-trip the verifier safely
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, verifier };
};

/**
 * Complete the handshake: send the authorization code (and the verifier that
 * traveled as `state`) to the broker. Returns the first access token.
 */
export const exchangeCodeWithBroker = async (code: string, verifier: string): Promise<{ accessToken: string; expiresInSeconds: number }> => {
  const existing = inFlightExchanges.get(verifier);
  if (existing) return existing;
  const run = (async () => {
  const res = await brokerCall({
    action: 'exchange',
    code,
    codeVerifier: verifier,
    redirectUri: `${window.location.origin}/`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface Google's raw rejection — it names the exact policy violation
    // (invalid_grant, redirect_uri_mismatch, …) when debugging the handshake.
    console.error('[drive-broker] exchange failed', res.status, JSON.stringify(data));
    throw new Error(data?.error || 'Token exchange failed');
  }
  cached = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + Math.max(60, (data.expiresInSeconds || 3600) - 120) * 1000,
  };
  return { accessToken: data.accessToken, expiresInSeconds: data.expiresInSeconds };
  })();
  inFlightExchanges.set(verifier, run);
  try {
    return await run;
  } finally {
    inFlightExchanges.delete(verifier);
  }
};

/** Get a fresh Google access token via the broker (cached while valid). */
export const getGoogleAccessToken = async (forceRefresh = false): Promise<string> => {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  const res = await brokerCall({ action: 'token' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) throw Object.assign(new Error('Google Drive not connected'), { reconnect: true });
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Token refresh failed'), { reconnect: !!data?.reconnect });
  cached = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + Math.max(60, (data.expiresInSeconds || 3600) - 120) * 1000,
  };
  return cached.accessToken;
};

/** Ask the broker whether Google Drive is connected for this user. */
export const isDriveConnected = async (): Promise<boolean> => {
  try {
    const res = await brokerCall({ action: 'status' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.connected;
  } catch {
    return false;
  }
};

/** Revoke Google authorization server-side and clear the local cache. */
export const revokeDriveConnection = async (): Promise<void> => {
  try { await brokerCall({ action: 'revoke' }); } catch { /* best effort */ }
  cached = null;
};

/** Drop the cached access token (e.g. after a 401 from Drive). */
export const invalidateGoogleToken = () => {
  cached = null;
};
