import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { WeeklyLog } from '../types';

interface HoSDB extends DBSchema {
  logs: {
    key: string;
    value: WeeklyLog;
  };
  /** Pending sync work, drained by the sync engine. Additive in DB v3. */
  outbox: {
    key: number;
    value: OutboxEntry;
  };
  /** Small sync metadata (Drive cursors, connection state). Additive in DB v4. */
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

export interface OutboxEntry {
  seq?: number;
  kind: 'log-updated' | 'log-deleted';
  logId: string;
  ts: string;
  /**
   * Account the queued work belongs to. Without this, an edit made by one
   * driver but not yet flushed would be uploaded into whichever account signs
   * in next.
   */
  ownerId?: string;
}

export type LogMutation =
  | { type: 'log-updated'; logId: string }
  | { type: 'log-deleted'; logId: string };

type MutationListener = (mutation: LogMutation) => void;
const mutationListeners = new Set<MutationListener>();

/**
 * Subscribe to local log mutations. Used by the sync engine to schedule a
 * push whenever anything changes, without coupling storage to sync.
 */
export const onLogMutation = (listener: MutationListener): (() => void) => {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
};

const notifyMutations = (mutation: LogMutation) => {
  mutationListeners.forEach(l => {
    try { l(mutation); } catch (e) { console.error('[storage] mutation listener failed', e); }
  });
};

let dbPromise: Promise<IDBPDatabase<HoSDB>> | null = null;

const DB_VERSION = 4;

/** localStorage key naming the account this device currently holds data for. */
const ACTIVE_ACCOUNT_KEY = 'hos-active-account';

let activeAccount: string | null = null;

/**
 * Account whose rows are in scope. Every read and write of a log is filtered by
 * it, so two accounts sharing one phone never see each other's history.
 * The signed-in session is the only thing allowed to set this.
 */
export const getActiveAccount = (): string | null => activeAccount;

export const setActiveAccount = (userId: string | null): void => {
  activeAccount = userId || null;
  if (!userId) return;
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  } catch { /* private mode: the in-memory scope still works */ }
};

/** Whether a stored row may be touched by the account currently in scope. */
export const isOwnedByActiveAccount = (ownerId?: string): boolean =>
  !!activeAccount && ownerId === activeAccount;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HoSDB>('hos-ontario', DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('logs', { keyPath: 'id' });
        } else if (oldVersion === 1) {
          db.deleteObjectStore('logs');
          db.createObjectStore('logs', { keyPath: 'id' });
        }
        // v3: additive outbox store only — existing logs data is untouched.
        if (oldVersion < 3) {
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        }
        // v4: additive meta store for sync metadata.
        if (oldVersion < 4) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
      blocked() {
        console.warn('IndexedDB upgrade blocked by another active connection.');
      },
      blocking() {
        console.warn('This database connection is blocking a version upgrade. Closing connection...');
        if (dbPromise) {
          dbPromise.then(db => db.close());
          dbPromise = null;
        }
      },
      terminated() {
        console.warn('IndexedDB connection abnormally terminated. Clearing cache.');
        dbPromise = null;
      }
    });
  }
  return dbPromise;
};

/**
 * Executes a database operation with a fallback/retry mechanism.
 * If the connection is closed or closing, it discards the cached connection promise,
 * establishes a fresh connection, and retries the operation exactly once.
 */
const executeWithRetry = async <T>(operation: (db: IDBPDatabase<HoSDB>) => Promise<T>): Promise<T> => {
  let db = await initDB();
  try {
    return await operation(db);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.name : '';
    const isClosedOrClosing = 
      errorMsg.includes('closing') || 
      errorMsg.includes('closed') || 
      errorMsg.includes('InvalidStateError') ||
      errName === 'InvalidStateError';

    if (isClosedOrClosing) {
      console.warn('IndexedDB transaction failed due to closed/closing connection. Retrying with a new connection...', error);
      try {
        db.close();
      } catch {
        // Safe to ignore if already closed
      }
      dbPromise = null;
      db = await initDB();
      return await operation(db);
    }
    throw error;
  }
};

export const saveLog = async (log: WeeklyLog) => {
  const record: WeeklyLog = {
    ...log,
    updatedAt: new Date().toISOString(),
    ownerId: activeAccount || undefined,
  };
  await executeWithRetry(async (db) => {
    await db.put('logs', record);
    const tx = db.transaction('outbox', 'readwrite');
    await tx.store.put({ kind: 'log-updated', logId: record.id, ts: record.updatedAt as string, ownerId: activeAccount ?? undefined });
    await tx.done;
  });
  notifyMutations({ type: 'log-updated', logId: record.id });
};

/**
 * Write logs coming FROM the cloud without re-enqueuing them (a pull must not
 * schedule a push of the data it just received). Used only by the sync engine.
 * Stamped with the active account: a pulled row belongs to whoever signed in.
 */
export const putLogRaw = async (log: WeeklyLog) => {
  await executeWithRetry(async (db) => {
    await db.put('logs', { ...log, ownerId: activeAccount || log.ownerId });
  });
};

/**
 * Saves multiple logs within a single highly efficient transaction.
 * Drastically reduces CPU overhead and avoids sequential transaction connection closures.
 */
export const saveLogsBulk = async (logs: WeeklyLog[]) => {
  const owned = logs.map(log => ({ ...log, ownerId: activeAccount || log.ownerId }));
  await executeWithRetry(async (db) => {
    const tx = db.transaction('logs', 'readwrite');
    const operations = owned.map(log => tx.store.put(log));
    await Promise.all([...operations, tx.done]);
  });
};

export const getLog = async (id: string): Promise<WeeklyLog | undefined> => {
  const log = await executeWithRetry(async (db) => {
    return await db.get('logs', id);
  });
  // A week belonging to another account must look like it does not exist.
  return log && isOwnedByActiveAccount(log.ownerId) ? log : undefined;
};

/** Every row, owner ignored. Migration and maintenance only. */
export const getAllLogsRaw = async (): Promise<WeeklyLog[]> => {
  return await executeWithRetry(async (db) => {
    return await db.getAll('logs');
  });
};

export const getAllLogs = async (): Promise<WeeklyLog[]> => {
  const logs = await getAllLogsRaw();
  return logs.filter(log => isOwnedByActiveAccount(log.ownerId));
};

export const deleteLog = async (id: string) => {
  const existing = await executeWithRetry(async (db) => db.get('logs', id));
  if (!existing || !isOwnedByActiveAccount(existing.ownerId)) return;
  await executeWithRetry(async (db) => {
    await db.delete('logs', id);
    const tx = db.transaction('outbox', 'readwrite');
    await tx.store.put({ kind: 'log-deleted', logId: id, ts: new Date().toISOString(), ownerId: activeAccount ?? undefined });
    await tx.done;
  });
  notifyMutations({ type: 'log-deleted', logId: id });
};

// ---- Outbox (pending sync work) ----

export const outboxAdd = async (entry: Omit<OutboxEntry, 'seq'>) => {
  await executeWithRetry(async (db) => {
    await db.put('outbox', { ownerId: activeAccount ?? undefined, ...entry });
  });
};

/** Every queue entry, owner ignored. Migration only. */
export const outboxGetAllRaw = async (): Promise<OutboxEntry[]> => {
  return await executeWithRetry(async (db) => {
    return await db.getAll('outbox');
  });
};

/** Queue entries belonging to the account in scope. */
export const outboxGetAll = async (): Promise<OutboxEntry[]> => {
  const entries = await outboxGetAllRaw();
  return entries.filter(e => isOwnedByActiveAccount(e.ownerId));
};

/** Stamp queue entries that predate account scoping (migration only). */
export const outboxClaimFor = async (ownerId: string): Promise<number> => {
  const unowned = (await outboxGetAllRaw()).filter(e => !e.ownerId);
  for (const entry of unowned) {
    await executeWithRetry(async (db) => { await db.put('outbox', { ...entry, ownerId }); });
  }
  return unowned.length;
};

/**
 * Drop flushed entries. With no argument the whole queue is cleared; with
 * entries, only those — so a flush by one account never discards another
 * account's still-pending work.
 */
export const outboxClear = async (flushed?: OutboxEntry[]) => {
  await executeWithRetry(async (db) => {
    if (!flushed) {
      await db.clear('outbox');
      return;
    }
    const tx = db.transaction('outbox', 'readwrite');
    await Promise.all(flushed.map(e => tx.store.delete(e.seq as number)));
    await tx.done;
  });
};

// ---- Meta store (sync metadata) ----

export const metaSet = async (key: string, value: unknown) => {
  await executeWithRetry(async (db) => {
    await db.put('meta', { key, value });
  });
};

export const metaGet = async (key: string): Promise<unknown> => {
  return await executeWithRetry(async (db) => {
    const row = await db.get('meta', key);
    return row ? row.value : undefined;
  });
};

