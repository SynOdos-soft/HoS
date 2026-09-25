import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, Save, Download, Menu, X, Shield, LayoutDashboard, FileText, User, Clock, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useSyncStatus } from '../lib/useSyncStatus';

interface HeaderProps {
  view: 'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences';
  onNavigate: (view: 'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences') => void;
  onSave?: () => void;
  onExportPDF?: () => void;
  isSaving?: boolean;
  onSavePreset?: () => void;
  onApplyPreset?: () => void;
  onRoadsidePDF?: () => void;
  accountEmail?: string;
  onSignOut?: () => void;
  /** Days left in the offline grace window; null while auth is resolving. */
  daysRemaining?: number | null;
}

/** Second line of the account card: offline window + cloud state (if any). */
const AccountSubline: React.FC<{ daysRemaining?: number | null }> = ({ daysRemaining }) => {
  const { state: syncState, online, driveConnected } = useSyncStatus();
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.72rem', opacity: 0.75, width: '100%', flexWrap: 'wrap' }}>
      {typeof daysRemaining === 'number' && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: daysRemaining <= 2 ? 'var(--accent-orange)' : undefined,
            fontWeight: daysRemaining <= 2 ? 600 : undefined,
          }}
          title="Days you can keep logging without reconnecting to the internet"
        >
          <Clock size={12} />
          {daysRemaining <= 0 ? 'Reconnect required' : daysRemaining === 1 ? '1 day offline left' : `${daysRemaining} days offline left`}
        </span>
      )}
      {driveConnected && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: !online ? 'var(--text-secondary)' : syncState === 'error' ? 'var(--accent-red)' : syncState === 'syncing' ? 'var(--accent-blue)' : 'var(--accent-green)',
          }}
          title={`Cloud sync: ${!online ? 'offline — edits will sync later' : syncState}`}
        >
          {!online ? <CloudOff size={12} /> : syncState === 'syncing' ? <RefreshCw size={12} className="spin" /> : syncState === 'error' ? <AlertCircle size={12} /> : <Cloud size={12} />}
          {!online ? 'Offline' : syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Sync error' : 'Synced'}
        </span>
      )}
    </span>
  );
};

export const Header: React.FC<HeaderProps> = ({
  view, onNavigate, onSave, onExportPDF, isSaving, onSavePreset, onApplyPreset, onRoadsidePDF, accountEmail, onSignOut, daysRemaining
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Ignore clicks on the toggle button itself: the button's own click
      // handler owns open/close. Closing here on mousedown would race the
      // click event and re-toggle the menu right back open.
      if (toggleRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Scroll lock that preserves the scrollbar: hiding overflow (the old
    // body.menu-open lock) destroys the viewport scroll container, which
    // removes the scrollbar and shifts the entire layout. Instead the page
    // stays scrollable but is pinned to its pre-open position — wheel,
    // keyboard and scrollbar drags all snap back. Zero shift, zero movement.
    const pinnedY = window.scrollY;
    const pinScroll = () => {
      if (window.scrollY !== pinnedY) window.scrollTo(0, pinnedY);
    };
    window.addEventListener('scroll', pinScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', pinScroll);
      window.scrollTo(0, pinnedY);
    };
  }, [isMenuOpen]);

  const getTitle = () => {
    switch (view) {
      case 'dashboard': return 'Dashboard';
      case 'editor': return 'Daily Logger';
      case 'audit': return 'Inspection';
      case 'profile': return 'User Preferences';
      case 'preferences': return 'System Settings';
      default: return 'SynOdos HOS';
    }
  };

  const handleAction = (cb?: () => void) => {
    if (cb) cb();
    setIsMenuOpen(false);
  };

  return (
    <header className="global-header no-print">
      <div className="header-content">
        <div className="header-left">
          <div className="brand-logo" onClick={() => onNavigate('dashboard')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">S</div>
          </div>
          <h1 className="header-title">{getTitle()}</h1>
        </div>

        <div className="header-right" style={{ position: 'relative', zIndex: 4000 }}>
          <button 
            ref={toggleRef}
            className="hamburger-btn" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
            aria-controls="global-side-menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Global Action & Nav Menu */}
        <div className={`side-menu ${isMenuOpen ? 'open' : ''}`} ref={menuRef} id="global-side-menu">
          <div className="menu-header">
            <div className="brand-logo">
              <div className="logo-icon">S</div>
            </div>
            {/* Close button removed - handled by persistent hamburger icon */}
          </div>

          <div className="menu-body">
            <div className="menu-section">
              <label>Navigation</label>
              <button className={`menu-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('dashboard'))}>
                <LayoutDashboard size={20} /> Dashboard
              </button>
              <button className={`menu-item ${view === 'editor' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('editor'))}>
                <FileText size={20} /> Daily Logger
              </button>
              <button className={`menu-item ${view === 'audit' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('audit'))}>
                <Shield size={20} /> Inspection
              </button>
            </div>

            {view !== 'dashboard' && (
              <div className="menu-section">
                <label>Actions</label>
                {view === 'editor' && (
                  <>
                    <button className="menu-item" onClick={() => handleAction(onSave)}>
                      <Save size={20} /> {isSaving ? 'Saving...' : 'Save Progress'}
                    </button>
                    <button className="menu-item" onClick={() => handleAction(onExportPDF)}>
                      <Download size={20} /> Export Log (PDF)
                    </button>
                    <button className="menu-item" onClick={() => handleAction(onSavePreset)}>
                      <Save size={20} /> Save Preset
                    </button>
                    <button className="menu-item" onClick={() => handleAction(onApplyPreset)}>
                      <Download size={20} /> Apply Preset
                    </button>
                  </>
                )}
                {view === 'audit' && (
                  <button className="menu-item" onClick={() => handleAction(onRoadsidePDF)}>
                    <Shield size={20} /> Generate Roadside PDF
                  </button>
                )}
              </div>
            )}

            <div className="menu-footer" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="menu-section" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                <label>Account & Config</label>
                {/* Everything account-related in one tappable summary card. */}
                <button
                  className={`menu-item ${view === 'profile' ? 'active' : ''}`}
                  onClick={() => handleAction(() => onNavigate('profile'))}
                  title="Open account hub"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%' }}>
                    <User size={20} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, wordBreak: 'break-all', textAlign: 'left' }}>
                      {accountEmail || 'My Account'}
                    </span>
                  </span>
                  <AccountSubline daysRemaining={daysRemaining} />
                </button>
                <button className={`menu-item ${view === 'preferences' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('preferences'))}>
                  <Settings size={20} /> System Settings
                </button>
              </div>
              <button
                className="menu-item logout"
                onClick={() => {
                  if (onSignOut) onSignOut();
                  setIsMenuOpen(false);
                }}
              >
                <LogOut size={20} /> Sign Out
              </button>
            </div>
          </div>
        </div>
        {isMenuOpen && <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      </div>
    </header>
  );
};
