import { describe, it, expect, beforeEach } from 'vitest';
import { makeWeek, makePrefs, resetDayCounter } from '../test/factories';
import { clearAllStores } from '../test/dbHelpers';
import {
  initDB, getActiveAccount, getAllLogs, getAllLogsRaw, getLog, saveLog, deleteLog,
  putLogRaw, setActiveAccount, outboxGetAll, outboxGetAllRaw,
} from './storage';
import {
  ensureAccountScope, readPrefs, writePrefs, writePrefsSavedAt, readPrefsSavedAt,
  putIncomingPrefs, takeIncomingPrefs, prefsKey, getScopedItem, setScopedItem,
} from './accountScope';
import { DEFAULT_PREFS } from '../types';

const OLD = 'user-old-driver';
const NEW = 'user-new-account';
const LAST_PLATE = 'hos-last-used-vehicle-plate';

/** Write a row straight into IndexedDB, bypassing ownership stamping. */
const putUnowned = async (id: string) => {
  const db = await initDB();
  await db.put('logs', makeWeek(id));
};

beforeEach(async () => {
  resetDayCounter();
  setActiveAccount(null);
  await clearAllStores();
});

describe('account scoping of local logs', () => {
  it('hides every row from a device with no account in scope', async () => {
    await putUnowned('2026-09-21');
    expect(await getAllLogs()).toEqual([]);
  });

  it('stamps new saves with the active account', async () => {
    setActiveAccount(OLD);
    await saveLog(makeWeek('2026-09-21'));
    const [row] = await getAllLogsRaw();
    expect(row.ownerId).toBe(OLD);
  });

  it('does not show one account another account\'s week', async () => {
    setActiveAccount(OLD);
    await saveLog(makeWeek('2026-09-21'));

    setActiveAccount(NEW);
    expect(await getAllLogs()).toEqual([]);
    expect(await getLog('2026-09-21')).toBeUndefined();
  });

  it('refuses to delete another account\'s week', async () => {
    setActiveAccount(OLD);
    await saveLog(makeWeek('2026-09-21'));

    setActiveAccount(NEW);
    await deleteLog('2026-09-21');
    expect((await getAllLogsRaw()).length).toBe(1);

    setActiveAccount(OLD);
    await deleteLog('2026-09-21');
    expect(await getAllLogsRaw()).toEqual([]);
  });

  it('pulled rows are stamped for the account that signed in', async () => {
    setActiveAccount(NEW);
    await putLogRaw(makeWeek('2026-09-21'));
    const logs = await getAllLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].ownerId).toBe(NEW);
  });
});

describe('one-time claim of pre-namespacing data', () => {
  it('gives legacy rows to the account the device already used, not the next one to sign in', async () => {
    // Evidence this device belonged to OLD: it synced and authenticated here.
    localStorage.setItem(`hos-sync-cursor:${OLD}`, '2026-09-25T00:00:00.000Z');
    await putUnowned('2026-09-21');

    // The new account signs in first after the update — it must see nothing.
    await ensureAccountScope(NEW);
    expect(await getAllLogs()).toEqual([]);

    setActiveAccount(OLD);
    expect((await getAllLogs()).map(l => l.id)).toEqual(['2026-09-21']);
  });

  it('does not re-run the claim on a later sign-in', async () => {
    localStorage.setItem(`hos-sync-cursor:${OLD}`, '2026-09-25T00:00:00.000Z');
    await putUnowned('2026-09-21');
    await ensureAccountScope(OLD);

    // A brand new, unscoped row must NOT be swept up by the old migration.
    await putUnowned('2026-09-28');
    await ensureAccountScope(NEW);

    setActiveAccount(OLD);
    expect((await getAllLogs()).map(l => l.id)).toEqual(['2026-09-21']);
  });

  it('leaves rows unowned and hidden when the device has no owner evidence', async () => {
    await putUnowned('2026-09-21');
    await ensureAccountScope(NEW);
    expect(await getAllLogs()).toEqual([]);
    // Still on disk — nothing was destroyed.
    expect((await getAllLogsRaw()).length).toBe(1);
  });

  it('does not guess when two accounts are both plausible owners', async () => {
    localStorage.setItem(`hos-last-auth:${OLD}`, '2026-09-25T00:00:00.000Z');
    localStorage.setItem(`hos-last-auth:${NEW}`, '2026-10-02T00:00:00.000Z');
    await putUnowned('2026-09-21');

    await ensureAccountScope(NEW);
    expect(await getAllLogs()).toEqual([]);
  });

  it('treats the recorded device account as the owner', async () => {
    localStorage.setItem('hos-active-account', OLD);
    await putUnowned('2026-09-21');
    await ensureAccountScope(NEW);
    setActiveAccount(OLD);
    expect((await getAllLogs()).length).toBe(1);
  });

  it('puts the signing-in account in scope even on an empty device', async () => {
    await ensureAccountScope(NEW);
    expect(getActiveAccount()).toBe(NEW);
    expect(await getAllLogs()).toEqual([]);
  });
});

describe('per-account preferences', () => {
  it('keeps each account\'s preferences to itself', () => {
    writePrefs(OLD, makePrefs({ defaultDriverName: 'Jade' }));
    writePrefs(NEW, makePrefs({ defaultDriverName: 'Someone else' }));

    expect(readPrefs(OLD).defaultDriverName).toBe('Jade');
    expect(readPrefs(NEW).defaultDriverName).toBe('Someone else');
  });

  it('claims the legacy blob for the account that owned the device', () => {
    localStorage.setItem('hos-legacy-device-owner', OLD);
    localStorage.setItem('hos-preferences', JSON.stringify(makePrefs({ defaultDriverName: 'Jade' })));

    expect(readPrefs(OLD).defaultDriverName).toBe('Jade');
    // The blob moved rather than copied: no second account can inherit it.
    expect(localStorage.getItem('hos-preferences')).toBeNull();
    expect(readPrefs(NEW)).toEqual(DEFAULT_PREFS);
  });

  it('does not hand the legacy blob to an account with no claim', () => {
    localStorage.setItem('hos-legacy-device-owner', OLD);
    localStorage.setItem('hos-preferences', JSON.stringify(makePrefs({ defaultDriverName: 'Jade' })));
    expect(readPrefs(NEW)).toEqual(DEFAULT_PREFS);
    expect(localStorage.getItem('hos-preferences')).not.toBeNull();
  });

  it('falls back to defaults when there is no stored blob', () => {
    expect(readPrefs(NEW)).toEqual(DEFAULT_PREFS);
  });

  it('stamps savedAt per account', () => {
    writePrefsSavedAt(OLD, '2026-09-25T00:00:00.000Z');
    expect(readPrefsSavedAt(OLD)).toBe('2026-09-25T00:00:00.000Z');
    expect(readPrefsSavedAt(NEW)).toBe('');
  });

  it('moves the legacy savedAt stamp with the blob it belongs to', () => {
    localStorage.setItem('hos-legacy-device-owner', OLD);
    localStorage.setItem('hos-preferences', JSON.stringify(makePrefs()));
    localStorage.setItem('hos-preferences-saved-at', '2026-09-25T00:00:00.000Z');
    readPrefs(OLD);
    expect(readPrefsSavedAt(OLD)).toBe('2026-09-25T00:00:00.000Z');
  });

  it('namespaces the stored key by account', () => {
    writePrefs(OLD, makePrefs());
    expect(localStorage.getItem(prefsKey(OLD))).toBeTruthy();
    expect(localStorage.getItem(prefsKey(NEW))).toBeNull();
  });
});

describe('per-account driver details (plate, metadata preset)', () => {
  it('keeps each account\'s value to itself', () => {
    setScopedItem(LAST_PLATE, OLD, 'AAA111');
    setScopedItem(LAST_PLATE, NEW, 'BBB222');
    expect(getScopedItem(LAST_PLATE, OLD)).toBe('AAA111');
    expect(getScopedItem(LAST_PLATE, NEW)).toBe('BBB222');
  });

  it('hands the legacy value to the owning account only', () => {
    localStorage.setItem('hos-legacy-device-owner', OLD);
    localStorage.setItem(LAST_PLATE, 'AAA111');
    expect(getScopedItem(LAST_PLATE, OLD)).toBe('AAA111');
    expect(getScopedItem(LAST_PLATE, NEW)).toBeNull();
    // Moved, not copied.
    expect(localStorage.getItem(LAST_PLATE)).toBeNull();
  });

  it('returns nothing for an account that never saved one', () => {
    setScopedItem(LAST_PLATE, OLD, 'AAA111');
    expect(getScopedItem(LAST_PLATE, NEW)).toBeNull();
  });

  it('falls back to the device value when no account is in scope', () => {
    setScopedItem(LAST_PLATE, null, 'DEVICE');
    expect(getScopedItem(LAST_PLATE, null)).toBe('DEVICE');
  });
});

describe('queued sync work (outbox)', () => {
  it('queues work per account so one driver cannot upload another\'s edits', async () => {
    setActiveAccount(OLD);
    await saveLog(makeWeek('2026-09-21'));
    setActiveAccount(NEW);
    await saveLog(makeWeek('2026-09-28'));

    // Each account only ever sees its own pending upload.
    expect((await outboxGetAll()).map(e => e.logId)).toEqual(['2026-09-28']);
    setActiveAccount(OLD);
    expect((await outboxGetAll()).map(e => e.logId)).toEqual(['2026-09-21']);
    expect((await outboxGetAllRaw()).length).toBe(2);
  });

  it('claims the legacy queue for the account that owned the device', async () => {
    localStorage.setItem(`hos-sync-cursor:${OLD}`, '2026-09-25T00:00:00.000Z');
    const db = await initDB();
    await db.put('outbox', { kind: 'log-updated', logId: '2026-09-21', ts: '2026-09-24T00:00:00Z' });

    await ensureAccountScope(NEW);
    expect(await outboxGetAll()).toEqual([]);

    setActiveAccount(OLD);
    expect((await outboxGetAll()).map(e => e.logId)).toEqual(['2026-09-21']);
  });
});

describe('incoming preferences pulls', () => {
  it('is taken by its own account only, and only once', () => {
    putIncomingPrefs(NEW, { defaultDriverName: 'Pulled' });
    expect(takeIncomingPrefs(OLD)).toBeNull();
    expect(takeIncomingPrefs(NEW)).toEqual({ defaultDriverName: 'Pulled' });
    expect(takeIncomingPrefs(NEW)).toBeNull();
  });

  it('discards damaged payloads instead of throwing', () => {
    localStorage.setItem('hos-preferences-incoming:user-old-driver', '{not json');
    expect(takeIncomingPrefs(OLD)).toBeNull();
    // Consumed either way — a broken blob must not wedge every later pull.
    expect(takeIncomingPrefs(OLD)).toBeNull();
  });
});