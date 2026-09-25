import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';

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

// --- localStorage: real impl, cleared between tests ------------------------
beforeEach(() => {
  localStorage.clear();
});

// --- Network: tests must never hit Supabase or Google ----------------------
// Each test file that exercises network-dependent code registers its own
// fetch mock; default to a hard failure so accidental calls surface loudly.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`Unexpected network call in test: ${String(input)}`);
  }));
});
