import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { t, getI18nLanguage } from '../utils/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level render-crash safety net.
 *
 * Without it, any uncaught render error unmounts the whole tree and leaves an
 * empty #root — the "white screen" a driver cannot recover from without
 * knowing to clear site data. This screen always offers a way back:
 *
 *  - "Try again" remounts the app in place (no reload). If the crash came
 *    from a specific screen, the fresh mount starts over cleanly.
 *  - "Reload app" performs a full page reload — this also re-runs the boot
 *    path (auth restore, service worker) and picks up any pending update.
 *
 * Local data is never touched: logs live in IndexedDB and survive both
 * actions, and neither action signs the driver out.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Render crashes currently have nowhere else to go. Keep this terse and
    // PII-free: message + stack only, never user data.
    console.error('[error-boundary] render crash', error, info.componentStack);
  }

  // Class component: no hook, so read the language straight from the store.
  // The crash screen is rendered once, so it does not need to be reactive.
  private tr = (key: Parameters<typeof t>[0]): string => t(key, getI18nLanguage());

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: 'var(--bg-primary, #0f172a)',
        }}
      >
        <div
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: 420,
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={40} color="var(--accent-orange)" style={{ alignSelf: 'center' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{this.tr('somethingWentWrong')}</h1>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {this.tr('errorBoundaryBody')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={this.handleRetry}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.25rem' }}
            >
              <RefreshCw size={15} />
              {this.tr('tryAgain')}
            </button>
            <button
              className="btn-secondary"
              onClick={this.handleReload}
              style={{ padding: '0.55rem 1.25rem' }}
            >
              {this.tr('reloadApp')}
            </button>
        </div>
        </div>
      </div>
    );
  }
}
