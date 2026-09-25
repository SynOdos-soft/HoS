import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabaseClient';
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

    // Restore the persisted session first so a returning driver (especially
    // offline) lands straight in the app instead of at the sign-in screen.
    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted.current) return;
        setSession(data.session ?? null);
        const userId = data.session?.user?.id;
        if (userId && !localStorage.getItem(lastAuthKey(userId))) {
          markSessionValidated(userId);
        }
      })
      .catch(() => {
        // Corrupt/expired stored session: treat as signed out, keep local data.
        if (!mounted.current) return;
        setSession(null);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted.current) return;
      setSession(nextSession ?? null);
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error.message), needsConfirmation: false };
    // If the project requires email confirmation, no session comes back.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
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
