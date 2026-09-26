import React, { useState } from 'react';
import { CreditCard, RefreshCw, Loader2, ShieldCheck, Cloud, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';

/**
 * Shown when the session-renewal entitlement check denies extension: the
 * subscription lapsed or never existed. Data stays safe locally; the driver
 * can retry (billing may have updated), or sign out.
 *
 * The "Choose plan" action is a placeholder for the billing flow (Stripe
 * Checkout / provider portal) — wire `onChoosePlan` when billing exists.
 */
export const Paywall: React.FC = () => {
  const { user, subscription, validateSession, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const res = await validateSession();
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  const expired = subscription.reason === 'expired';

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
        width: '100%', maxWidth: 440, padding: '2rem',
        display: 'flex', flexDirection: 'column', gap: '1.1rem', textAlign: 'center',
      }}>
        <CreditCard size={40} color="var(--accent-orange)" style={{ alignSelf: 'center' }} />

        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>
            {expired ? 'Subscription ended' : 'Subscription required'}
          </h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {expired
              ? 'Your plan has expired, so offline access can no longer be extended. Everything you logged is saved on this device.'
              : 'Choose a plan to keep logging after the offline window closes. Everything you logged so far is saved on this device.'}
          </p>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
          padding: '0.7rem', borderRadius: 8, fontSize: '0.8rem',
          background: 'var(--bg-secondary, rgba(255,255,255,0.05))', color: 'var(--text-secondary)',
        }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          <span>{user?.email} · plan: {subscription.plan}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
          {[
            'Unlimited weekly logs with full audit trail',
            'Automatic cloud backup & multi-device sync',
            'Roadside inspection & PDF exports',
          ].map(f => (
            <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Check size={15} color="var(--accent-green)" style={{ flexShrink: 0 }} /> {f}
            </span>
          ))}
        </div>

        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', gap: '0.6rem', padding: '0.8rem' }}
          onClick={() => {/* TODO: redirect to billing/checkout */}}>
          <Cloud size={18} /> Choose plan
        </button>

        {error && (
          <div style={{
            padding: '0.7rem', borderRadius: 8, fontSize: '0.85rem',
            background: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn-secondary" onClick={retry} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', fontSize: '0.85rem' }}>
            {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            I've subscribed — retry
          </button>
          <button onClick={() => signOut()}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
