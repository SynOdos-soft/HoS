import React, { useState } from 'react';
import { CloudOff, RefreshCw, Loader2, ShieldCheck, Cloud } from 'lucide-react';
import { useAuth, getGraceDays } from '../lib/auth';

/**
 * Shown when the offline grace window has lapsed: the session may still be
 * technically present, but the app requires one successful online check with
 * the server before editing continues. This is the extension point where a
 * subscription entitlement check will slot in later.
 */
export const SessionExpired: React.FC = () => {
  const { user, validateSession, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = navigator.onLine;

  const reconnect = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const res = await validateSession();
    setBusy(false);
    if (!res.ok) setError(res.error);
    // On success, authFresh flips and App renders the real app again.
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--bg-primary, #0f172a)',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: 420,
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        textAlign: 'center',
      }}>
        <CloudOff size={40} color="var(--accent-orange)" style={{ alignSelf: 'center' }} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>Session needs renewal</h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You've been offline for more than {getGraceDays()} {getGraceDays() === 1 ? 'day' : 'days'}. Reconnect once to keep
            logging — everything you've recorded while offline is saved on this
            device and will sync the moment you're back.
          </p>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
          padding: '0.7rem', borderRadius: 8, fontSize: '0.8rem',
          background: 'var(--bg-secondary, rgba(255,255,255,0.05))', color: 'var(--text-secondary)',
        }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          <span>{user?.email}</span>
        </div>

        {!online && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
            padding: '0.7rem', borderRadius: 8, fontSize: '0.85rem',
            background: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)',
          }}>
            <CloudOff size={15} /> You're offline right now. Connect and retry.
          </div>
        )}

        {error && (
          <div style={{
            padding: '0.7rem', borderRadius: 8, fontSize: '0.85rem',
            background: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)',
          }}>{error}</div>
        )}

        <button
          className="btn-primary"
          onClick={reconnect}
          disabled={busy}
          style={{ width: '100%', justifyContent: 'center', gap: '0.6rem', padding: '0.8rem' }}
        >
          {busy ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
          {busy ? 'Checking with server…' : 'Reconnect & Continue'}
        </button>

        <button
          onClick={() => signOut()}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
          disabled={busy}
        >
          Sign in with a different account
        </button>

        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Cloud size={11} /> Your log book is safe on this device either way.
        </p>
      </div>
    </div>
  );
};
