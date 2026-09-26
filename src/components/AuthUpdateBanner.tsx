import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION } from '../types';

/**
 * PWA update banner for the signed-out auth screens (SignIn, Paywall).
 *
 * The in-app banner only ever rendered inside the signed-in app, so a client
 * stranded on a stale bundle while signed out could never reach the update
 * action — a deadlock this component breaks. "prompt" registration means the
 * new service worker waits until the user accepts.
 */
export const AuthUpdateBanner: React.FC = () => {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [newVersion, setNewVersion] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!needRefresh) return;
    let cancelled = false;
    fetch('version.json', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.version) setNewVersion(String(data.version)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print"
      style={{
        position: 'fixed', top: '0.75rem', left: '50%', transform: 'translateX(-50%)',
        zIndex: 5000, width: 'min(440px, calc(100vw - 2rem))',
        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem',
        borderRadius: 12, backgroundColor: 'var(--bg-secondary, #16213a)',
        border: '1px solid var(--accent-blue)', color: 'var(--text-primary)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)', fontSize: '0.85rem',
      }}
    >
      <RefreshCw size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {isUpdating ? 'Updating…'
          : newVersion && newVersion !== APP_VERSION
            ? `Update to v${newVersion} available`
            : 'A new version is available'}
      </span>
      <button
        className="btn-primary btn-compact"
        onClick={() => { setIsUpdating(true); updateServiceWorker(true); }}
        disabled={isUpdating}
      >
        {isUpdating ? 'Updating…' : 'Update now'}
      </button>
      <button
        className="close-btn"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        style={{ flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
};
