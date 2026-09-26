// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptRefreshToken,
  encryptRefreshToken,
  isEncryptedRefreshToken,
} from '../../supabase/functions/google-token-broker/tokenCrypto';

const KEY = 'test-encryption-key-with-at-least-32-characters';

describe('Google refresh-token encryption', () => {
  it('encrypts tokens so plaintext is not stored and decrypts them again', async () => {
    const plaintext = 'google-refresh-token-value';
    const encrypted = await encryptRefreshToken(plaintext, KEY);

    expect(isEncryptedRefreshToken(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plaintext);
    expect(await decryptRefreshToken(encrypted, KEY)).toBe(plaintext);
  });

  it('uses a unique nonce for each encryption', async () => {
    const first = await encryptRefreshToken('same-token', KEY);
    const second = await encryptRefreshToken('same-token', KEY);

    expect(second).not.toBe(first);
    expect(await decryptRefreshToken(first, KEY)).toBe('same-token');
    expect(await decryptRefreshToken(second, KEY)).toBe('same-token');
  });

  it('passes through legacy plaintext so existing rows can be migrated', async () => {
    expect(isEncryptedRefreshToken('legacy-refresh-token')).toBe(false);
    expect(await decryptRefreshToken('legacy-refresh-token', '')).toBe('legacy-refresh-token');
  });

  it('fails closed for missing keys, wrong keys, and tampered ciphertext', async () => {
    const encrypted = await encryptRefreshToken('sensitive-token', KEY);

    await expect(encryptRefreshToken('token', '')).rejects.toThrow(/GOOGLE_TOKEN_ENCRYPTION_KEY/);
    await expect(decryptRefreshToken(encrypted, '')).rejects.toThrow(/GOOGLE_TOKEN_ENCRYPTION_KEY/);
    await expect(decryptRefreshToken(encrypted, 'wrong-encryption-key-'.padEnd(48, 'x'))).rejects.toThrow();
    await expect(decryptRefreshToken(`${encrypted}x`, KEY)).rejects.toThrow();
  });
});
