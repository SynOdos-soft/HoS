import { initDB } from '../utils/storage';

/**
 * Wipe every object store. fake-indexeddb persists databases across tests in
 * the same file, and the storage module caches its connection — clearing the
 * stores (rather than deleting the DB) keeps the cached connection valid.
 */
export const clearAllStores = async (): Promise<void> => {
  const db = await initDB();
  await Promise.all([
    db.clear('logs'),
    db.clear('outbox'),
    db.clear('meta'),
  ]);
};
