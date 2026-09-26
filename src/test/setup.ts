import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';

// --- localStorage polyfill ------------------------------------------------
// Node >= 22 exposes an experimental global `localStorage` that is DISABLED
// unless --localstorage-file is passed; its presence (undefined but
// declared) shadows jsdom's working implementation. Detect and fill it.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
}

// --- Deterministic crypto for PKCE-independent code paths -----------------
// jsdom lacks crypto.subtle in some versions; tests of merge logic don't
// need it, so provide a tiny stub only if missing.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
      subtle: {
        digest: async () => new ArrayBuffer(32),
      },
    },
  });
}

// --- localStorage: cleared between tests -----------------------------------
beforeEach(() => {
  globalThis.localStorage.clear();
});

// --- Network: tests must never hit Supabase or Google ----------------------
// Each test file that exercises network-dependent code registers its own
// fetch mock; default to a hard failure so accidental calls surface loudly.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`Unexpected network call in test: ${String(input)}`);
  }));
});

// NOTE: do NOT use vi.useFakeTimers in this suite — fake timers freeze the
// macrotask queue that fake-indexeddb transactions rely on, hanging every
// IndexedDB write. Timestamps are controlled via factory arguments instead.
