import { describe, expect, it } from 'vitest';
import {
  clearGoogleOAuthTransaction,
  createGoogleOAuthState,
  getGoogleOAuthVerifier,
  storeGoogleOAuthTransaction,
} from './googleOAuthState';

const makeStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
};

describe('Google OAuth state binding', () => {
  it('creates independent opaque state values', () => {
    const first = createGoogleOAuthState();
    const second = createGoogleOAuthState();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('returns the verifier only for the nonce saved in this tab', () => {
    const storage = makeStorage();
    storeGoogleOAuthTransaction('expected-state', 'secret-pkce-verifier', storage);

    expect(getGoogleOAuthVerifier('expected-state', storage)).toBe('secret-pkce-verifier');
    expect(getGoogleOAuthVerifier('attacker-state', storage)).toBeNull();
    expect(getGoogleOAuthVerifier(null, storage)).toBeNull();
  });

  it('rejects a valid state when the verifier is absent', () => {
    const storage = makeStorage();
    storeGoogleOAuthTransaction('expected-state', '   ', storage);
    storage.removeItem('hos-google-drive-pkce-verifier');

    expect(getGoogleOAuthVerifier('expected-state', storage)).toBeNull();
  });

  it('clears only the transaction matching the returned state', () => {
    const storage = makeStorage();
    storeGoogleOAuthTransaction('pending-state', 'pending-verifier', storage);

    clearGoogleOAuthTransaction('different-state', storage);
    expect(getGoogleOAuthVerifier('pending-state', storage)).toBe('pending-verifier');

    clearGoogleOAuthTransaction('pending-state', storage);
    expect(getGoogleOAuthVerifier('pending-state', storage)).toBeNull();
  });
});
