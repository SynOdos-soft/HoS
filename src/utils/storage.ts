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
  const record: WeeklyLog = { ...log, updatedAt: new Date().toISOString() };
  await executeWithRetry(async (db) => {
    await db.put('logs', record);
    const tx = db.transaction('outbox', 'readwrite');
    await tx.store.put({ kind: 'log-updated', logId: record.id, ts: record.updatedAt as string });
    await tx.done;
  });
  notifyMutations({ type: 'log-updated', logId: record.id });
};

/**
 * Write logs coming FROM the cloud without re-enqueuing them (a pull must not
 * schedule a push of the data it just received). Used only by the sync engine.
 */
export const putLogRaw = async (log: WeeklyLog) => {
  await executeWithRetry(async (db) => {
    await db.put('logs', log);
  });
};

/**
 * Saves multiple logs within a single highly efficient transaction.
 * Drastically reduces CPU overhead and avoids sequential transaction connection closures.
 */
export const saveLogsBulk = async (logs: WeeklyLog[]) => {
  await executeWithRetry(async (db) => {
    const tx = db.transaction('logs', 'readwrite');
    const operations = logs.map(log => tx.store.put(log));
    await Promise.all([...operations, tx.done]);
  });
};

export const getLog = async (id: string): Promise<WeeklyLog | undefined> => {
  return await executeWithRetry(async (db) => {
    return await db.get('logs', id);
  });
};

export const getAllLogs = async (): Promise<WeeklyLog[]> => {
  return await executeWithRetry(async (db) => {
    return await db.getAll('logs');
  });
};

export const deleteLog = async (id: string) => {
  await executeWithRetry(async (db) => {
    await db.delete('logs', id);
    const tx = db.transaction('outbox', 'readwrite');
    await tx.store.put({ kind: 'log-deleted', logId: id, ts: new Date().toISOString() });
    await tx.done;
  });
  notifyMutations({ type: 'log-deleted', logId: id });
};

// ---- Outbox (pending sync work) ----

export const outboxAdd = async (entry: Omit<OutboxEntry, 'seq'>) => {
  await executeWithRetry(async (db) => {
    await db.put('outbox', entry);
  });
};

export const outboxGetAll = async (): Promise<OutboxEntry[]> => {
  return await executeWithRetry(async (db) => {
    return await db.getAll('outbox');
  });
};

export const outboxClear = async () => {
  await executeWithRetry(async (db) => {
    await db.clear('outbox');
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

