import { WeeklyLog, Preferences } from '../types';
import { getGoogleAccessToken, invalidateGoogleToken } from './driveBroker';

/**
 * Google Drive AppData as the PRIMARY data store.
 *
 * Layout (appDataFolder, hidden app-private space on the driver's Drive):
 *  - synodos-index.json      { weeks: {weekId: updatedAt}, prefsUpdatedAt, deleted: {weekId: ts} }
 *  - synodos-week/<id>.json  one file per week (id = Monday date)
 *  - synodos-prefs.json      { data, updatedAt }
 *
 * All reads/writes go through small helpers that attach the broker access
 * token and transparently retry once after a 401 (token rotation).
 */

const INDEX_FILE = 'synodos-index.json';
const WEEK_PREFIX = 'synodos-week/';
const PREFS_FILE = 'synodos-prefs.json';

const LIST_URL = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files(id,name,modifiedTime)&q=";
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const META_URL = 'https://www.googleapis.com/drive/v3/files/';

export interface DriveFileRef { id: string; name: string; modifiedTime: string }

export interface DriveIndex {
  weeks: Record<string, string>;      // weekId -> updatedAt (ISO)
  deleted: Record<string, string>;    // weekId -> tombstone ts
  prefsUpdatedAt?: string;
  deviceId?: string;
  schema?: number;
}

const emptyIndex = (): DriveIndex => ({ weeks: {}, deleted: {}, schema: 1 });

/** Perform a Drive API call with the broker token; retries once on 401. */
const driveFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  let token = await getGoogleAccessToken();
  let res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    invalidateGoogleToken();
    token = await getGoogleAccessToken(true);
    res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  }
  return res;
};

const listAllFiles = async (): Promise<DriveFileRef[]> => {
  const files: DriveFileRef[] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent("name contains 'synodos-' and trashed = false");
    const url = LIST_URL + q + (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await driveFetch(url);
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
};

const downloadFile = async (fileId: string): Promise<unknown> => {
  const res = await driveFetch(`${META_URL}${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json();
};

const uploadFile = async (name: string, content: unknown): Promise<string> => {
  const boundary = `synodos_${Math.random().toString(36).slice(2)}`;
  const metadata = { name, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(content) +
    `\r\n--${boundary}--`;
  const res = await driveFetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  const data = await res.json();
  return data.id;
};

const patchFile = async (fileId: string, content: unknown): Promise<void> => {
  // Media PATCH on the upload endpoint replaces file content in place.
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
  if (!res.ok) throw new Error(`Drive patch failed: ${res.status}`);
};

const deleteFile = async (fileId: string): Promise<void> => {
  const res = await driveFetch(`${META_URL}${fileId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
};

const findByName = (files: DriveFileRef[], name: string): DriveFileRef | null =>
  files.find(f => f.name === name) || null;

const weekFileName = (weekId: string) => `${WEEK_PREFIX}${weekId}.json`;

// ---- Index ----

export const readIndex = async (): Promise<{ index: DriveIndex; fileId: string | null }> => {
  const files = await listAllFiles();
  const ref = findByName(files, INDEX_FILE);
  if (!ref) return { index: emptyIndex(), fileId: null };
  const index = await downloadFile(ref.id) as DriveIndex;
  return { index: { ...emptyIndex(), ...index }, fileId: ref.id };
};

export const writeIndex = async (index: DriveIndex, existingFileId: string | null): Promise<string> => {
  if (existingFileId) {
    await patchFile(existingFileId, index);
    return existingFileId;
  }
  return uploadFile(INDEX_FILE, index);
};

// ---- Weeks ----

export const readWeek = async (weekId: string, files?: DriveFileRef[]): Promise<WeeklyLog | null> => {
  const refs = files || await listAllFiles();
  const ref = findByName(refs, weekFileName(weekId));
  if (!ref) return null;
  return (await downloadFile(ref.id)) as WeeklyLog;
};

export const writeWeek = async (log: WeeklyLog, files?: DriveFileRef[]): Promise<string> => {
  const refs = files || await listAllFiles();
  const name = weekFileName(log.id);
  const ref = findByName(refs, name);
  if (ref) {
    await patchFile(ref.id, log);
    return ref.id;
  }
  return uploadFile(name, log);
};

export const deleteWeekFile = async (weekId: string, files?: DriveFileRef[]): Promise<boolean> => {
  const refs = files || await listAllFiles();
  const ref = findByName(refs, weekFileName(weekId));
  if (!ref) return false;
  await deleteFile(ref.id);
  return true;
};

// ---- Preferences ----

export const readPrefs = async (files?: DriveFileRef[]): Promise<{ data: Partial<Preferences>; updatedAt: string } | null> => {
  const refs = files || await listAllFiles();
  const ref = findByName(refs, PREFS_FILE);
  if (!ref) return null;
  return (await downloadFile(ref.id)) as { data: Partial<Preferences>; updatedAt: string };
};

export const writePrefs = async (preferences: Preferences, existingFileId?: string | null): Promise<string> => {
  if (existingFileId) {
    await patchFile(existingFileId, { data: preferences, updatedAt: new Date().toISOString() });
    return existingFileId;
  }
  return uploadFile(PREFS_FILE, { data: preferences, updatedAt: new Date().toISOString() });
};

export const DRIVE_FILES = { INDEX_FILE, WEEK_PREFIX, PREFS_FILE };

// ---- Connection health ----

export interface DriveHealth {
  connected: boolean;
  weeksStored: number;
  /** Bytes used by SynOdos files in AppData, as reported by Drive. */
  bytesUsed: number;
  indexOk: boolean;
  prefsOk: boolean;
}

/** Gather a health snapshot from the about endpoint plus a listing pass. */
export const getDriveHealth = async (): Promise<DriveHealth> => {
  const token = await getGoogleAccessToken();
  const aboutRes = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const about = aboutRes.ok ? await aboutRes.json() : {};
  // AppData bytes come from the quota bucket "limit"-independent field
  // drive.appdata scope exposes via files.list size fields.
  const q = encodeURIComponent("name contains 'synodos-' and trashed = false");
  const listRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files(id,name,size)&q=${q}`
  );
  let weeksStored = 0;
  let bytesUsed = 0;
  let indexOk = false;
  let prefsOk = false;
  if (listRes.ok) {
    const data = await listRes.json();
    const files: { name: string; size?: string }[] = data.files || [];
    for (const f of files) {
      bytesUsed += Number(f.size || 0);
      if (f.name.startsWith(WEEK_PREFIX)) weeksStored += 1;
      if (f.name === INDEX_FILE) indexOk = true;
      if (f.name === PREFS_FILE) prefsOk = true;
    }
  }
  const quota = (about as { storageQuota?: { limit?: string; usageInDrive?: string } }).storageQuota;
  return {
    connected: true,
    weeksStored,
    bytesUsed: bytesUsed || Number(quota?.usageInDrive || 0),
    indexOk,
    prefsOk,
  };
};
