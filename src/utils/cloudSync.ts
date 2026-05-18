import { Preferences, WeeklyLog } from '../types';

// Constants for encryption
const ENCRYPTION_ITERATIONS = 100000;
const SALT = new TextEncoder().encode("SynOdos-HoS-Salt");

// Web Crypto API helpers
async function getCryptoKey(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: ENCRYPTION_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data: string, pin: string): Promise<string> {
  const key = await getCryptoKey(pin);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(data)
  );

  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv, 0);
  combined.set(encryptedArray, iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptData(encryptedBase64: string, pin: string): Promise<string> {
  const key = await getCryptoKey(pin);
  const combined = new Uint8Array(
    atob(encryptedBase64).split("").map(c => c.charCodeAt(0))
  );
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

// Google Drive AppData Sync API
export interface SyncPayload {
  logs: WeeklyLog[];
  preferences: Preferences;
  timestamp: string;
}

const FILE_NAME = 'synodos_hos_backup.enc';

export async function uploadToGoogleDrive(token: string, encryptedPayload: string): Promise<void> {
  // 1. Find if file exists in appDataFolder
  const query = encodeURIComponent(`name='${FILE_NAME}'`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    console.error('Google Drive Search Error:', errorText);
    let errMsg = 'Failed to search Drive';
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error && parsed.error.message) {
        errMsg = parsed.error.message;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }
  const searchData = await searchRes.json();
  const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: FILE_NAME,
    parents: ['appDataFolder']
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/plain\r\n\r\n' +
    encryptedPayload +
    closeDelimiter;

  let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  let method = 'POST';

  if (existingFile) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
    method = 'PATCH';
  }

  const uploadRes = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    console.error('Google Drive Upload Error:', errorText);
    throw new Error(`Failed to upload backup: ${uploadRes.statusText}`);
  }
}

export async function downloadFromGoogleDrive(token: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${FILE_NAME}'`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    console.error('Google Drive Search Error:', errorText);
    let errMsg = 'Failed to search Drive';
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error && parsed.error.message) {
        errMsg = parsed.error.message;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }
  const searchData = await searchRes.json();
  const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

  if (!existingFile) return null;

  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!downloadRes.ok) throw new Error('Failed to download backup');
  return await downloadRes.text();
}
