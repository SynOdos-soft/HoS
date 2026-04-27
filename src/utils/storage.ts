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
    });
  }
  return dbPromise;
};

export const saveLog = async (log: WeeklyLog) => {
  const db = await initDB();
  await db.put('logs', log);
};

export const getLog = async (id: string): Promise<WeeklyLog | undefined> => {
  const db = await initDB();
  return await db.get('logs', id);
};

export const getAllLogs = async (): Promise<WeeklyLog[]> => {
  const db = await initDB();
  return await db.getAll('logs');
};
export const deleteLog = async (id: string) => {
  const db = await initDB();
  await db.delete('logs', id);
};
