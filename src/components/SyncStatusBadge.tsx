import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useSyncStatus } from '../lib/useSyncStatus';

/** Compact cloud-sync indicator shown in the header menu footer. */
export const SyncStatusBadge: React.FC = () => {
  const { state, message, online } = useSyncStatus();

  const label =
    !online ? 'Offline — edits will sync' :
    state === 'syncing' ? 'Syncing…' :
    state === 'error' ? 'Sync error' : 'Synced';

  const color =
    !online ? 'var(--text-secondary)' :
    state === 'error' ? 'var(--accent-red)' :
    state === 'syncing' ? 'var(--accent-blue)' : 'var(--accent-green)';

  return (
    <div
      className="menu-item"
      role="status"
      title={state === 'error' ? message : label}
      style={{ cursor: 'default', color, fontSize: '0.8rem', opacity: 0.85 }}
    >
      {!online ? <CloudOff size={16} />
        : state === 'syncing' ? <RefreshCw size={16} className="spin" />
        : state === 'error' ? <AlertCircle size={16} />
        : <Cloud size={16} />}
      <span>{label}</span>
    </div>
  );
};
