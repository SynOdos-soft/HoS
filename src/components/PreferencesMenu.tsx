import React from 'react';
import { Preferences } from '../types';
import { t } from '../utils/i18n';
import { Settings, X } from 'lucide-react';

interface PreferencesMenuProps {
  preferences: Preferences;
  setPreferences: (prefs: Preferences) => void;
  isOpen: boolean;
  onClose: () => void;
  installPrompt?: any;
  isStandalone?: boolean;
  onInstall?: () => void;
}

export const PreferencesMenu: React.FC<PreferencesMenuProps> = ({ 
  preferences, setPreferences, isOpen, onClose, 
  installPrompt, isStandalone, onInstall 
}) => {
  if (!isOpen) return null;

  const toggleBoolean = (key: keyof Preferences) => {
    setPreferences({ ...preferences, [key]: !preferences[key] });
  };

  const setString = (key: keyof Preferences, value: string) => {
    setPreferences({ ...preferences, [key]: value });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', 
      display: 'flex', justifyContent: 'flex-end'
    }}>
      <div className="glass-panel" style={{
        width: '320px', height: '100%', borderRadius: '16px 0 0 16px',
        animation: 'slideIn 0.3s ease forwards', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={20} /> Preferences</h2>
          <button className="tool-btn" onClick={onClose} style={{ padding: '0.5rem' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="input-group">
            <label>Language / Langue</label>
            <select value={preferences.language} onChange={(e) => setString('language', e.target.value)}>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="el">Ελληνικά</option>
            </select>
          </div>

          <div className="input-group">
            <label>Theme</label>
            <select value={preferences.theme} onChange={(e) => setString('theme', e.target.value)}>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </div>

          <div className="input-group">
            <label>Time Format (Grid)</label>
            <select value={preferences.timeFormat} onChange={(e) => setString('timeFormat', e.target.value)}>
              <option value="12h">12-Hour (AM/PM)</option>
              <option value="24h">24-Hour</option>
            </select>
          </div>

          <div className="input-group">
            <label>Weekly View Mode</label>
            <select value={preferences.viewMode} onChange={(e) => setString('viewMode', e.target.value)}>
              <option value="tabs">Tabbed Days</option>
              <option value="stacked">Stacked Days</option>
            </select>
          </div>

          <hr style={{ borderColor: 'var(--border-color)', margin: '0.5rem 0' }} />
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Toggle Fields</h3>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.showCoDrivers} onChange={() => toggleBoolean('showCoDrivers')} />
            Show Co-Driver(s)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.showTrailerPlate} onChange={() => toggleBoolean('showTrailerPlate')} />
            Show Trailer Plate
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.showExempt} onChange={() => toggleBoolean('showExempt')} />
            Show Exempt Hrs
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.showSleeper} onChange={() => toggleBoolean('showSleeper')} />
            Show Sleeper Row
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.showTimestamps} onChange={() => toggleBoolean('showTimestamps')} />
            {t('showTimestamps', preferences.language) || 'Show Timestamps in Cells'}
          </label>

          <hr style={{ borderColor: 'var(--border-color)', margin: '0.5rem 0' }} />
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>System</h3>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preferences.autoSave} onChange={() => toggleBoolean('autoSave')} />
            Enable Auto-Save
          </label>

          {!isStandalone && (
            <>
              <hr style={{ borderColor: 'var(--border-color)', margin: '0.5rem 0' }} />
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Installation</h3>
              {installPrompt ? (
                <button className="btn-primary" onClick={onInstall} style={{ width: '100%', justifyContent: 'center' }}>
                  Install App
                </button>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <p style={{ marginBottom: '0.5rem' }}>To install for offline use:</p>
                  <ol style={{ paddingLeft: '1rem', marginBottom: '0.5rem' }}>
                    <li>Open browser menu</li>
                    <li>Select <b>"Add to Home Screen"</b> or <b>"Install App"</b></li>
                  </ol>
                  <p style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                    Note: Installation requires a secure connection (HTTPS) or localhost.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};
