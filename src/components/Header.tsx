import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, Save, Download, Menu, X, Shield, LayoutDashboard, FileText } from 'lucide-react';

interface HeaderProps {
  view: 'dashboard' | 'editor' | 'audit';
  onNavigate: (view: 'dashboard' | 'editor' | 'audit') => void;
  onOpenPrefs: () => void;
  onSave?: () => void;
  onExportPDF?: () => void;
  isSaving?: boolean;
  onSavePreset?: () => void;
  onApplyPreset?: () => void;
  onRoadsidePDF?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  view, onNavigate, onOpenPrefs, onSave, onExportPDF, isSaving, onSavePreset, onApplyPreset, onRoadsidePDF
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.classList.remove('menu-open');
    };
  }, [isMenuOpen]);

  const getTitle = () => {
    switch (view) {
      case 'dashboard': return 'Dashboard';
      case 'editor': return 'Daily Logger';
      case 'audit': return 'Inspection';
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
          <button className="hamburger-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Global Action & Nav Menu */}
        <div className={`side-menu ${isMenuOpen ? 'open' : ''}`} ref={menuRef}>
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

            <div className="menu-footer">
              <button className="menu-item" onClick={() => handleAction(onOpenPrefs)}>
                <Settings size={20} /> System Settings
              </button>
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
