import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';

/**
 * Regression tests for the offline-safe boot path in lib/auth.
 *
 * The offline white screen happened because boot awaited supabase.auth
 * getSession(), which goes to the network whenever the cached access token is
 * inside its refresh margin. These tests pin the contract:
 *
 *  1. Offline boot restores the cached session instantly — no getSession, no
 *     network (the suite-wide fetch stub hard-fails on any real fetch), and
 *     the grace window is seeded on first restore.
 *  2. A hard-expired cached access token is still restored: identity and the
 *     grace window (hos-last-auth) govern access, not token expiry.
 *  3. A buffered INITIAL_SESSION(null) (emitted when auth-js startup errors,
 *     e.g. offline refresh failure) must not clobber the restored session;
 *     SIGNED_OUT still clears and a session-bearing INITIAL_SESSION adopts.
 *  4. Online boot bounds getSession by a deadline and falls back to the cache.
 */

// ---- supabaseClient mock ---------------------------------------------------
// The whole module is replaced so no real GoTrueClient (and therefore no
// createClient/autoRefresh timers/network) exists in this suite. `__emit`
// drives onAuthStateChange subscribers, mirroring auth-js events.
const supabaseMock = vi.hoisted(() => {
  type Listener = (event: string, session: unknown) => void;
  const listeners = new Set<Listener>();
  const onAuthStateChange = vi.fn((cb: Listener) => {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  });
  return {
    getSession: vi.fn(),
    onAuthStateChange,
    refreshSession: vi.fn(),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOAuth: vi.fn(),
    __emit: (event: string, session: unknown) => {
      listeners.forEach(l => l(event, session));
    },
    __resetListeners: () => listeners.clear(),
  };
});

vi.mock('../utils/supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: { auth: supabaseMock },
  getDeviceId: () => 'test-device-id',
  SUPABASE_URL: 'https://test.supabase.co',
}));

const AUTH_STORAGE_KEY = 'hos-supabase-auth';
const USER_ID = 'user-123';

const buildSessionBlob = (opts?: { expiresAt?: number; wrapper?: boolean }): string => {
  const session = {
    access_token: 'cached-access-token',
    refresh_token: 'cached-refresh-token',
    expires_at: opts?.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, email: 'driver@example.com', aud: 'authenticated' },
  };
  return JSON.stringify(opts?.wrapper ? { currentSession: session } : session);
};

/** Force jsdom's navigator.onLine; jsdom defaults to true. */
const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

// Renders the provider and exposes the auth state as JSON for assertions.
const Probe: React.FC = () => {
  const { session, loading, authFresh, daysRemaining } = useAuth();
  return (
    <div data-testid="probe">
      {JSON.stringify({
        loading,
        session: session === undefined ? 'undefined' : session ? 'present' : 'null',
        userId: session?.user?.id ?? null,
        authFresh,
        daysRemaining,
      })}
    </div>
  );
};

interface ProbeState {
  loading: boolean;
  session: 'undefined' | 'present' | 'null';
  userId: string | null;
  authFresh: boolean;
  daysRemaining: number | null;
}

const readProbe = (): ProbeState => {
  const el = container.querySelector('[data-testid="probe"]');
  return JSON.parse(el?.textContent || '{}') as ProbeState;
};

const silenceConsole = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  silenceConsole();
  supabaseMock.getSession.mockReset();
  supabaseMock.refreshSession.mockReset();
  supabaseMock.signOut.mockReset();
  supabaseMock.__resetListeners();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setOnline(true);
  vi.restoreAllMocks();
});

const renderAuth = async () => {
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
};

describe('auth offline boot', () => {
  it('restores the cached session instantly when offline — no getSession, no network, grace window seeded', async () => {
    setOnline(false);
    localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob());
    const fetchSpy = vi.mocked(globalThis.fetch);

    await renderAuth();

    const state = readProbe();
    expect(state.loading).toBe(false);
    expect(state.session).toBe('present');
    expect(state.userId).toBe(USER_ID);
    // The offline path must not even attempt getSession (that call is what
    // blocked boot on a dead refresh). Any stray fetch would already have
    // thrown via the suite-wide network guard.
    expect(supabaseMock.getSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    // First restore on the device seeds the grace window so an offline boot
    // is never mistaken for a lapsed one.
    expect(localStorage.getItem(`hos-last-auth:${USER_ID}`)).toBeTruthy();
    expect(state.authFresh).toBe(true);
  });

  it('still restores a hard-expired cached access token offline (grace window governs, not token expiry)', async () => {
    setOnline(false);
    localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob({ expiresAt: Math.floor(Date.now() / 1000) - 3600 }));

    await renderAuth();

    const state = readProbe();
    expect(state.session).toBe('present');
    expect(state.userId).toBe(USER_ID);
    expect(supabaseMock.getSession).not.toHaveBeenCalled();
  });

  it('accepts the { currentSession } storage wrapper shape too', async () => {
    setOnline(false);
    localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob({ wrapper: true }));

    await renderAuth();

    expect(readProbe().userId).toBe(USER_ID);
  });

  it('lands signed-out when offline with no cached session — and still never touches the network', async () => {
    setOnline(false);

    await renderAuth();

    const state = readProbe();
    expect(state.loading).toBe(false);
    expect(state.session).toBe('null');
    expect(supabaseMock.getSession).not.toHaveBeenCalled();
  });

  it('a null INITIAL_SESSION cannot clobber the restored session; real sign-out clears, server session adopts', async () => {
    setOnline(false);
    localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob());
    await renderAuth();
    expect(readProbe().session).toBe('present');

    // auth-js flushes a buffered INITIAL_SESSION after its (possibly failing)
    // startup settles. The null variant must not flash the driver to sign-in.
    act(() => supabaseMock.__emit('INITIAL_SESSION', null));
    expect(readProbe().session).toBe('present');

    // A session-bearing INITIAL_SESSION (real server-confirmed state) adopts.
    act(() => supabaseMock.__emit('INITIAL_SESSION', {
      access_token: 'fresh', refresh_token: 'fresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'server-user' },
    }));
    expect(readProbe().userId).toBe('server-user');

    // Real sign-out always clears.
    act(() => supabaseMock.__emit('SIGNED_OUT', null));
    expect(readProbe().session).toBe('null');
  });

  it('online boot with a stalled getSession falls back to the cached session at the deadline', async () => {
    vi.useFakeTimers();
    try {
      setOnline(true);
      localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob());
      supabaseMock.getSession.mockImplementation(() => new Promise(() => { /* never resolves */ }));

      // Phase 1: mount and let the boot effect run (act flushes effects),
      // registering the deadline timer on the fake clock. Still restoring.
      await act(async () => {
        root.render(
          <AuthProvider>
            <Probe />
          </AuthProvider>,
        );
      });
      expect(readProbe().loading).toBe(true);

      // Phase 2: cross the deadline — getSession never resolved, so the
      // cached session must take over and the gate must open.
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      await act(async () => { /* flush the post-deadline state updates */ });

      const state = readProbe();
      expect(state.loading).toBe(false);
      expect(state.session).toBe('present');
      expect(state.userId).toBe(USER_ID);
    } finally {
      vi.useRealTimers();
    }
  });

  it('online boot prefers the live getSession result over the cache', async () => {
    setOnline(true);
    localStorage.setItem(AUTH_STORAGE_KEY, buildSessionBlob());
    supabaseMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'live', refresh_token: 'live', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'live-user' } } },
      error: null,
    });

    await renderAuth();

    expect(readProbe().userId).toBe('live-user');
  });
});
