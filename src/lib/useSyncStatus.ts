import { useEffect, useState } from 'react';
import { onSyncStateChange, getSyncState } from '../utils/driveSync';

/** Live Drive-sync status for the small UI badge and the Account hub. */
export const useSyncStatus = () => {
  const [status, setStatus] = useState(() => getSyncState());
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('hos-last-sync-at') || '');
  const [driveConnected, setDriveConnected] = useState<boolean>(() => localStorage.getItem('hos-drive-connected') === 'true');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const off = onSyncStateChange((state, message) => {
      setStatus({ state, message });
      setLastSyncedAt(localStorage.getItem('hos-last-sync-at') || '');
    });
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const poll = window.setInterval(() => {
      setLastSyncedAt(localStorage.getItem('hos-last-sync-at') || '');
      setDriveConnected(localStorage.getItem('hos-drive-connected') === 'true');
    }, 2000);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      off();
      window.clearInterval(poll);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return { ...status, online, lastSyncedAt, driveConnected };
};
