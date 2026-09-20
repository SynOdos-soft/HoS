import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, Save, Download, Menu, X, Shield, LayoutDashboard, FileText, User } from 'lucide-react';

interface HeaderProps {
  view: 'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences';
  onNavigate: (view: 'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences') => void;
  onSave?: () => void;
  onExportPDF?: () => void;
  isSaving?: boolean;
  onSavePreset?: () => void;
  onApplyPreset?: () => void;
  onRoadsidePDF?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  view, onNavigate, onSave, onExportPDF, isSaving, onSavePreset, onApplyPreset, onRoadsidePDF
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
            <span className="brand-name hide-mobile">SynOdos</span>
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
              <span className="brand-name">SynOdos</span>
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
                <button className={`menu-item ${view === 'profile' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('profile'))}>
                  <User size={20} /> User Preferences
                </button>
                <button className={`menu-item ${view === 'preferences' ? 'active' : ''}`} onClick={() => handleAction(() => onNavigate('preferences'))}>
                  <Settings size={20} /> System Settings
                </button>
              </div>
              <button className="menu-item logout" onClick={() => setIsMenuOpen(false)}>
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
