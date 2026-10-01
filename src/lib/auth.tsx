import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../utils/supabaseClient';
import { fetchEntitlement, type Entitlement } from '../utils/entitlements';

interface AuthContextValue {
  /** undefined while the persisted session is being restored; null once known signed-out. */
  session: Session | null | undefined;
  user: User | null | undefined;
  loading: boolean;
  /** False once the offline grace window has lapsed — the app must show the reconnect gate. */
  authFresh: boolean;
  /** Whole days left before the grace window lapses (null while session is restoring). */
  daysRemaining: number | null;
  /** Reach the server to re-validate the session and extend the offline window. */
  validateSession: () => Promise<{ ok: boolean; error: string | null }>;
  /** Subscription entitlement as of the last validation. */
  subscription: Entitlement;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * How long a session stays usable without contacting the server. After this
 * many days the app requires one online re-validation (now: a token refresh;
 * later, the subscription check) before editing continues.
 *
 * Dev/test override: localStorage['hos-auth-grace-days'] (e.g. '0' to force
 * the gate immediately). Not read in any privileged path.
 */
const DEFAULT_GRACE_DAYS = 7;
const graceDays = (): number => {
  const raw = localStorage.getItem('hos-auth-grace-days');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GRACE_DAYS;
};

const lastAuthKey = (userId: string) => `hos-last-auth:${userId}`;

/** Current offline grace window in days (dev/test overridable). */
export const getGraceDays = (): number => graceDays();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Record that the server was positively reached — extends the offline window. */
export const markSessionValidated = (userId: string) => {
  localStorage.setItem(lastAuthKey(userId), new Date().toISOString());
};

const friendlyAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('user already registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Please enter a valid email address.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No connection. Sign-in requires internet — your logs stay safe on this device.';
  return message;
};

/** Error returned by auth paths when the build itself lacks Supabase config. */
const NOT_CONFIGURED_ERROR =
  'Sign-in is not configured in this deployment. Your logs are safe on this device — the app was built without the server connection settings.';

/**
 * Cached Supabase session shape. Only the fields needed to present a usable
 * offline session are read; `expires_at` is a seconds-epoch per auth-js.
 */
interface CachedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user?: User;
}

const AUTH_STORAGE_KEY = 'hos-supabase-auth';

/**
 * Restore a session from storage without touching the network.
 *
 * Why this exists: auth-js `getSession()` cannot resolve offline whenever the
 * cached access token is inside its 90 s refresh margin — it awaits the
 * token refresh (with exponential-backoff retries capped by a 30 s tick,
 * plus a post-failure storage re-check) before returning. During an outage
 * that keeps the app on the "restoring" gate for many seconds, and if a
 * second caller serializes behind that refresh with its own long-failed
 * fetches, boot can block indefinitely: the offline white screen.
 *
 * Reading the persisted blob directly gives an instant, dependency-free
 * restore path. A refresh token is a long-lived bearer credential, so
 * trusting it offline is exactly what the refresh flow itself does. This is
 * a last-resort fallback: it is only consulted when offline (or when
 * `getSession()` stalls), and the normal refresh runs as soon as the network
 * returns, firing TOKEN_REFRESHED and extending the grace window.
 */
const readCachedSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    // No separate userStorage is configured, so auth-js persists the plain
    // session object; accept a { currentSession } wrapper defensively.
    const wrapper = parsed as { currentSession?: CachedSession | null };
    const candidate = (wrapper.currentSession ?? parsed) as Partial<CachedSession> | null;
    if (!candidate) return null;
    const c = candidate as CachedSession;
    if (!c.access_token || !c.refresh_token || typeof c.expires_at !== 'number') return null;
    // NOTE: a hard-expired access token is still restored. Offline, the stored
    // token is usually already expired (last refresh happened at last signal),
    // and identity + local data do not depend on it: logs are read/written in
    // IndexedDB and cloud writes queue in the outbox until reconnect. Access is
    // bounded by the offline grace window (hos-last-auth → authFresh → Paywall),
    // and on reconnect auth-js refreshes the token (TOKEN_REFRESHED extends the
    // window) or signs the dead session out (SIGNED_OUT). Rejecting expired
    // tokens here would put the driver back on the sign-in screen — the exact
    // offline failure this fallback exists to prevent.
    // Structural user check — the session must identify its user.
    let user = c.user as User | undefined;
    if (!user || typeof (user as { id?: unknown }).id !== 'string' || !(user as { id: string }).id) {
      // Companion -user blob (only if userStorage were ever configured).
      try {
        const userRaw = localStorage.getItem(`${AUTH_STORAGE_KEY}-user`);
        const parsedUser = userRaw ? (JSON.parse(userRaw) as { user?: User }).user : undefined;
        if (parsedUser && typeof parsedUser.id === 'string') user = parsedUser;
      } catch { /* ignore malformed companion blob */ }
    }
    if (!user || typeof user.id !== 'string' || !user.id) return null;
    return {
      access_token: c.access_token,
      token_type: 'bearer',
      refresh_token: c.refresh_token,
      expires_in: Math.max(1, Math.floor((c.expires_at * 1000 - Date.now()) / 1000)),
      expires_at: c.expires_at,
      user,
    } as unknown as Session;
  } catch {
    return null;
  }
};

/** Resolve within `ms`, or return `fallback` (never rejects). */
const withDeadline = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => { window.clearTimeout(timer); resolve(value); })
      .catch(() => { window.clearTimeout(timer); resolve(fallback); });
  });

/** Max time the online boot path may spend in getSession() before falling back to the cached session. */
const BOOT_DEADLINE_MS = 3000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Entitlement>({ plan: 'free', active: false, periodEnd: null, reason: 'no-subscription' });
  // Millisecond clock bumped on validation and once a minute so the
  // countdown stays live while the app sits open in the cab.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const tick = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(tick);
    };
  }, []);

  const markValidatedFor = useCallback((userId: string | undefined) => {
    if (userId) markSessionValidated(userId);
    setNowMs(Date.now());
  }, []);

  // NOTE: the Google Drive OAuth-return handshake lives in App.tsx via
  // completeGoogleDriveHandshake() (the provider owns its own flow). This
  // provider previously duplicated it here and raced the single-use code.

  useEffect(() => {
    mounted.current = true;

    /**
     * Resolve the boot session with an offline guarantee:
     *  - Offline: restore the cached session directly. Never await the
     *    network — a margin-expired token makes getSession() block on a
     *    dead refresh, which is the offline white screen.
     *  - Online: bound getSession() by a deadline; if it stalls (flaky
     *    captive-portal network), fall back to the cached session.
     */
    const restoreSession = async () => {
      const offline = !navigator.onLine;
      if (offline) {
        const cached = readCachedSession();
        if (!mounted.current) return;
        setSession(cached);
        const userId = cached?.user?.id;
        if (userId && !localStorage.getItem(lastAuthKey(userId))) {
          // First restore on this device: seed the grace window so an
          // offline boot is never mistaken for a lapsed one.
          markSessionValidated(userId);
        }
        setLoading(false);
        return;
      }

      const restored = await withDeadline(
        supabase.auth.getSession().then(({ data }) => data.session ?? null),
        BOOT_DEADLINE_MS,
        null,
      );
      if (!mounted.current) return;
      const session = restored ?? readCachedSession();
      setSession(session);
      const userId = session?.user?.id;
      if (userId && !localStorage.getItem(lastAuthKey(userId))) {
        markSessionValidated(userId);
      }
      setLoading(false);
    };

    void restoreSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted.current) return;
      setSession(prev => {
        // initialize() flushes a buffered INITIAL_SESSION after its (possibly
        // long) startup settles. If that event carries no session while we
        // already restored one (offline boot), don't clobber the restore —
        // the driver would flash to the sign-in screen. Real sign-outs
        // (SIGNED_OUT) always clear.
        if (event === 'INITIAL_SESSION' && !nextSession && prev) return prev;
        return nextSession ?? null;
      });
      // Only server-proven events extend the window: SIGNED_IN (fresh auth,
      // incl. OAuth return) and TOKEN_REFRESHED (network refresh succeeded).
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession?.user) {
        markSessionValidated(nextSession.user.id);
        setNowMs(Date.now());
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: NOT_CONFIGURED_ERROR, needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error.message), needsConfirmation: false };
    // If the project requires email confirmation, no session comes back.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: false },
    });
    // On success the browser navigates away to Google, so an error here is
    // the only path that returns to the caller.
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const validateSession = useCallback(async (): Promise<{ ok: boolean; error: string | null }> => {
    // An unconfigured build has no server to validate against: treat the
    // session as stale and surface the deployment problem honestly.
    if (!supabaseConfigured) {
      return { ok: false, error: NOT_CONFIGURED_ERROR };
    }
    // Offline: fail fast. refreshSession() would block on dead-network token
    // refresh retries (tens of seconds of a spinning "Checking with server…"
    // button) before surfacing the same message.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, error: 'No connection. Reconnect to the internet and try again.' };
    }
    // Forces a network round-trip to Supabase Auth; requires internet.
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      const msg = error?.message || '';
      if (msg.includes('refresh_token') || msg.includes('Invalid Refresh Token') || msg.includes('session')) {
        // The refresh token itself is no longer acceptable: force a clean
        // sign-in. Local logs are preserved and re-merge on next sign-in.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setSession(null);
        return { ok: false, error: 'Session no longer valid — please sign in again.' };
      }
      return { ok: false, error: 'No connection. Reconnect to the internet and try again.' };
    }

    const userId = data.session.user?.id;
    if (!userId) return { ok: false, error: 'Session is missing a user.' };

    // ---- Subscription entitlement gate ----
    // The offline grace window only extends when the account's plan is
    // active. This is the single point where a billing system grants (or
    // denies) continued access.
    const entitlement = await fetchEntitlement(userId);
    setSubscription(entitlement);
    if (!entitlement.active) {
      const msg =
        entitlement.reason === 'expired'
          ? 'Your subscription has ended. Renew to continue logging — your data is safe on this device.'
          : entitlement.reason === 'error'
            ? 'Could not verify your plan. Try again in a moment.'
            : 'This account is not subscribed. Choose a plan to keep logging.';
      return { ok: false, error: msg };
    }
    markValidatedFor(userId);
    return { ok: true, error: null };
  }, [markValidatedFor]);

  const signOut = useCallback(async () => {
    // Local sign-out only: preserve the server user, wipe the on-device
    // session so shared/loaned devices are safe. Local logs stay in IndexedDB
    // (they belong to the account and will merge on next sign-in).
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setSession(null);
  }, []);

  // Derived freshness state, recomputed as `nowMs` ticks.
  const userId = session?.user?.id;
  let authFresh = true;
  let daysRemaining: number | null = null;
  if (userId) {
    const last = localStorage.getItem(lastAuthKey(userId));
    const lastMs = last ? Date.parse(last) : Date.now();
    const graceMs = graceDays() * MS_PER_DAY;
    daysRemaining = Math.ceil((lastMs + graceMs - nowMs) / MS_PER_DAY);
    authFresh = nowMs - lastMs <= graceMs;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        authFresh,
        daysRemaining,
        validateSession,
        subscription,
        signInWithPassword,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
