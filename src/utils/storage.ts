import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { WeeklyLog } from '../types';

interface HoSDB extends DBSchema {
  logs: {
    key: string;
    value: WeeklyLog;
  };
}

let dbPromise: Promise<IDBPDatabase<HoSDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HoSDB>('hos-ontario', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('logs', { keyPath: 'id' });
        } else if (oldVersion === 1) {
          db.deleteObjectStore('logs');
          db.createObjectStore('logs', { keyPath: 'id' });
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
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isClosedOrClosing = 
      errorMsg.includes('closing') || 
      errorMsg.includes('closed') || 
      errorMsg.includes('InvalidStateError') ||
      error.name === 'InvalidStateError';

    if (isClosedOrClosing) {
      console.warn('IndexedDB transaction failed due to closed/closing connection. Retrying with a new connection...', error);
      try {
        db.close();
      } catch (e) {
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
  });
};

