import { supabase, supabaseConfigured } from './supabaseClient';
import { decodeOfficerPayload, type OfficerReport } from './officerReport';

/**
 * Short-lived roadside report links.
 *
 * The inline-token format in `officerReport.ts` embeds the whole 15-day record
 * in the URL, which measured ~1,000 characters for a typical week and overflowed
 * the QR budget entirely on fragmented duty-status grids. This module stores the
 * report server-side instead, so the shared URL carries only a 192-bit token:
 *
 *     https://hos.synodos.app/?o=<43 chars>
 *
 * The token is the credential — the officer is not signed in — so it is random,
 * never derived from driver data, and only its SHA-256 digest is sent to the
 * server. Reports expire after {@link OFFICER_LINK_TTL_DAYS} days and the server
 * refuses to serve them afterwards.
 *
 * When the publish RPC cannot be reached (the common case: a roadside stop with
 * no signal) the caller falls back to the inline token, and the printed PDF
 * remains available regardless.
 */

/** Share links live for 7 days, matching the server's hard TTL clamp. */
export const OFFICER_LINK_TTL_DAYS = 7;

const TTL_SECONDS = OFFICER_LINK_TTL_DAYS * 24 * 60 * 60;

/** Query parameter carrying the short token. Shared with the inline format. */
const TOKEN_PARAM = 'o';

/**
 * 192 bits of randomness, base64url-encoded (43 chars, no padding).
 *
 * crypto.getRandomValues is the only source used: Math.random is not a CSPRNG
 * and this value is the sole authorization for an unauthenticated read.
 */
const generateToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Lowercase hex SHA-256, matching the server's `^[0-9a-f]{64}$` check. */
export const hashToken = async (token: string): Promise<string> => {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export interface OfficerShareResult {
  /** Short share URL, or '' when publishing was not possible. */
  url: string;
  /** ISO expiry the server assigned. */
  expiresAt: string | null;
  /** Why there is no link — the caller should fall back to PDF/inline. */
  error: string | null;
}

const isShareableToken = (token: string): boolean => /^[A-Za-z0-9_-]{20,64}$/.test(token);

/**
 * Publish the report and return the short URL the officer scans.
 *
 * The payload sent is the same serialized form the inline format uses, so the
 * decode path is shared and a link that falls back mid-handoff still opens.
 */
export const publishOfficerReport = async (
  payload: string,
  base?: string,
): Promise<OfficerShareResult> => {
  const root = base ?? (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '');

  if (!supabaseConfigured) {
    return { url: '', expiresAt: null, error: 'Report sharing is not configured.' };
  }

  let token: string;
  try {
    token = generateToken();
  } catch {
    return { url: '', expiresAt: null, error: 'This device cannot generate a secure share link.' };
  }
  if (!isShareableToken(token)) {
    return { url: '', expiresAt: null, error: 'This device cannot generate a secure share link.' };
  }

  try {
    const tokenHash = await hashToken(token);
    const { data, error } = await supabase.rpc('publish_officer_report', {
      p_token_hash: tokenHash,
      p_payload: payload,
      p_ttl_seconds: TTL_SECONDS,
    });
    if (error) throw new Error(error.message);
    return {
      url: `${root}?${TOKEN_PARAM}=${token}`,
      expiresAt: typeof data === 'string' ? data : null,
      error: null,
    };
  } catch (e) {
    return {
      url: '',
      expiresAt: null,
      error: e instanceof Error ? e.message : 'Could not share the report.',
    };
  }
};

export type ResolvedOfficerLink =
  | { kind: 'report'; report: OfficerReport; expiresAt: string | null }
  | { kind: 'expired' }
  | { kind: 'unavailable'; error: string };

/** Short tokens issued by this module. Inline (legacy/long) tokens are excluded. */
export const isShortToken = (token: string): boolean =>
  isShareableToken(token) && !token.includes('.') && token.length <= 64;

/**
 * Resolve a short share token into a report.
 *
 * Returns `kind: 'expired'` for a token the server knows but will no longer
 * serve, which the UI shows as "this link has expired" rather than the
 * generic failure — an expired link is a normal outcome after 7 days, not a bug
 * the officer should report.
 */
export const resolveOfficerToken = async (
  token: string,
): Promise<ResolvedOfficerLink> => {
  if (!supabaseConfigured) {
    return { kind: 'unavailable', error: 'Report sharing is not configured.' };
  }
  try {
    const tokenHash = await hashToken(token);
    const { data, error } = await supabase.rpc('read_officer_report', {
      p_token_hash: tokenHash,
    });
    if (error) {
      // P0002 is the server's deliberate "expired or unknown" answer.
      if (error.code === 'P0002') return { kind: 'expired' };
      throw new Error(error.message);
    }
    const row = (data ?? {}) as { payload?: unknown; expiresAt?: unknown };
    if (typeof row.payload !== 'string') return { kind: 'expired' };
    return {
      kind: 'report',
      report: decodeOfficerPayload(row.payload),
      expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
    };
  } catch (e) {
    return {
      kind: 'unavailable',
      error: e instanceof Error ? e.message : 'This inspection link could not be opened.',
    };
  }
};

/** Pull the short token out of a URL, or '' when it carries none. */
export const readShortToken = (location: string): string => {
  if (!location) return '';
  try {
    const url = new URL(location, 'https://placeholder.invalid');
    const token = url.searchParams.get(TOKEN_PARAM);
    return token && isShortToken(token) ? token : '';
  } catch {
    return '';
  }
};

/** Whole days left before expiry, floored at 0. Used for the "expires in" note. */
export const daysUntilExpiry = (expiresAt: string | null, now = Date.now()): number | null => {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - now) / (24 * 60 * 60 * 1000)));
};