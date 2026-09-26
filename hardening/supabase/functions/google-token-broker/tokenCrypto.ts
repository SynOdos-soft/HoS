const ENCRYPTED_PREFIX = 'enc:v1:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const isEncryptedRefreshToken = (value: string): boolean => value.startsWith(ENCRYPTED_PREFIX);

async function importAesKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY Edge Function secret is required');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function encryptRefreshToken(token: string, secret: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `${ENCRYPTED_PREFIX}${encodeBase64Url(combined)}`;
}

export async function decryptRefreshToken(value: string, secret: string): Promise<string> {
  if (!isEncryptedRefreshToken(value)) return value;
  const key = await importAesKey(secret);
  const combined = decodeBase64Url(value.slice(ENCRYPTED_PREFIX.length));
  if (combined.length <= 12) throw new Error('Stored Google token ciphertext is invalid');
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return decoder.decode(plaintext);
}
