import React, { useState } from 'react';
import { Truck, Mail, Loader2, WifiOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

/**
 * Full-screen gate shown whenever there is no authenticated session.
 * Google SSO first, email + password below, per product decision.
 */
export const SignIn: React.FC = () => {
  const { signInWithPassword, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const online = navigator.onLine;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await signUp(email.trim(), password);
        if (res.error) setError(res.error);
        else if (res.needsConfirmation) {
          setNotice('Account created! Check your email for a confirmation link, then sign in.');
        } else {
          // Session created immediately (confirmation disabled) — auth state
          // change flips the app into the editor automatically.
        }
      } else {
        const res = await signInWithPassword(email.trim(), password);
        if (res.error) setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    const res = await signInWithGoogle();
    if (res.error) {
      setError(res.error);
      setBusy(false);
    }
    // On success the browser redirects to Google; no further UI happens here.
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
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="logo-icon" style={{ width: 42, height: 42, fontSize: '1.3rem' }}>S</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>SynOdos HOS</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Sign in to sync your log book
            </p>
          </div>
        </div>

        {!online && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem', borderRadius: 8, fontSize: '0.85rem',
            background: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)',
          }}>
            <WifiOff size={16} />
            <span>You're offline. Reconnect to sign in — logs already on this device are safe.</span>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={google}
          disabled={busy || !online}
          style={{ width: '100%', justifyContent: 'center', gap: '0.6rem', padding: '0.8rem' }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
          or with email
          <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="driver@example.com"
              disabled={busy}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={busy}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.7rem', borderRadius: 8, fontSize: '0.85rem',
              background: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)',
            }}>{error}</div>
          )}
          {notice && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.7rem', borderRadius: 8, fontSize: '0.85rem',
              background: 'rgba(16, 185, 129, 0.12)', color: 'var(--status-on-duty)',
            }}>
              <CheckCircle2 size={16} /> {notice}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={busy || !online} style={{ justifyContent: 'center', padding: '0.8rem' }}>
            {busy ? <Loader2 size={18} className="spin" /> : <Mail size={18} />}
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setError(null); setNotice(null); }}
          style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', alignSelf: 'center' }}
          disabled={busy}
        >
          {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
        </button>

        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
          <Truck size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Your log book stays on this device even without internet. Signing in from a
          second device merges both copies — nothing is ever overwritten or lost.
        </p>
      </div>
    </div>
  );
};
