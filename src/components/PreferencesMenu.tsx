import React, { useState } from 'react';
import { Preferences } from '../types';
import { t } from '../utils/i18n';
import { Settings, X, FileText, Download, Info, Truck } from 'lucide-react';

interface PreferencesMenuProps {
  preferences: Preferences;
  setPreferences: (prefs: Preferences) => void;
  isOpen: boolean;
  onClose: () => void;
  installPrompt?: any;
  isStandalone?: boolean;
  onInstall?: () => void;
  onExportJSON?: () => void;
  onImportJSON?: () => void;
  onClearData?: () => void;
}

const VERSIONS = [
  {
    version: '0.9.9',
    date: '2026-05-17',
    features: [
      'Added a collapsible "Show Details" area in the Inspection View for remarks, odometer, and metadata.',
      'Integrated mini-totals into the expandable "Verbose Log Details" button for improved UX.',
      'Added a tappable "Cycle" pill (e.g., C1, C2) next to the date in the Inspection View to explain cycle rules.',
      'Streamlined Header menu by removing unused actions.'
    ],
    fixes: [
      'Fixed Cycle popover overflow on small screens by anchoring to the right.',
      'Highlighted "Today" card with a dynamic blue border.'
    ]
  },
  {
    version: '0.9.8',
    date: '2026-05-16',
    features: [
      'Added global Week Starts On setting (Sunday or Monday).',
      'Improved date calculation logic to respect localized week boundaries.'
    ],
    fixes: [
      'Refined navigation variable names for better maintainability.'
    ]
  },
  {
    version: '0.9.7',
    date: '2026-05-16',
    features: [
      'New 2-step deletion workflow with 5-second safety timeout.',
      'Unified Compliance Modal combining justification and navigation safety.',
      'Custom Unlock Confirmation modal for historical records.',
      'Refined Dashboard layout with prioritized action hierarchy.'
    ],
    fixes: [
      'Removed redundant buttons and improved mobile button spacing.',
      'Neutralized modal styling for a more professional compliance experience.'
    ]
  },
  {
    version: '0.9.6',
    date: '2026-05-14',
    features: [
      'New Roadside Inspection mode with 15-day compliance grid.',
      'SVG Graphical LogGrid with continuous duty status lines.',
      'Forensic Audit Trail with field-level diffs and justifications.',
      'Optimized mobile layout for inspection cards and audit tables.'
    ],
    fixes: [
      'Fixed horizontal overflow issues on narrow viewports.',
      'Improved touch-scrolling physics for large data grids.'
    ]
  },
  {
    version: '0.9.5',
    date: '2026-05-12',
    features: [
      'Icon-driven compact totals footer.',
      'Dashboard current week highlighting.',
      'New "Show Daily Totals Cards" toggle in settings.',
      'Optimized HOS limit warnings for single-line display.'
    ],
    fixes: [
      'Fixed state desync in sequential day navigation.',
      'Resolved duplication issues in render logic.'
    ]
  },
  {
    version: '0.9.4',
    date: '2026-05-11',
    features: [
      'Focused Daily Architecture: removed collapsible day cards.',
      'Fixed-bottom dashboard panel with real-time totals.',
      'Premium glassmorphism dashboard aesthetics.',
      'Persistent compliance feedback during scrolling.'
    ],
    fixes: []
  },
  {
    version: '0.9.0',
    date: '2026-05-09',
    features: [
      'Sequential daily navigation with cross-week capability.',
      'Automatic background saving during transitions.',
      'High-visibility current day highlighting.'
    ],
    fixes: [
      'Fixed mobile sticky header z-index issues.'
    ]
  },
  {
    version: '0.8.5',
    date: '2026-05-08',
    features: [
      'Strict Historical Auto-Locking for regulatory compliance.',
      'Forensic Audit Log tracking every modification.',
      'Mandatory reason codes for retrospective edits.'
    ],
    fixes: []
  },
  {
    version: '0.7.0',
    date: '2026-05-10',
    features: [
      'New Audit Log system for non-repudiation and compliance.',
      'Side-by-side comparison (diff) for all edited records.',
      'Mandatory Reason Codes for modifying historical/locked data.',
      'Visual highlights (red/green) for original vs. new values in Audit View.',
      'Inspection entry point separate from daily inputs.'
    ],
    fixes: [
      'Hard validation for historical edits to prevent accidental overwrites.',
      'Improved data integrity for HOS regulatory readiness.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-05-07',
    features: [
      'New Roadside Inspection PDF Export with 15-day history.',
      'Added solid vertical marker and graph cutoff for inspection reports.',
      'Detailed "Last edited" timestamps with seconds and timezone.',
      'Auto-lock past days with a warning system for manual overrides.',
      'Multi-page PDF support for long logs.',
      'Current hour highlighting in light blue on the grid.',
      'Moved Roadside Inspection trigger to General settings.'
    ],
    fixes: [
      'Improved PDF generation for large 15-day reports.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-05-02',
    features: [
      'Refactored Settings into a Tabbed Modal.',
      'Grouped Trucking features together.',
      'Added Version History tab.',
      'Export PDF directly from dashboard.'
    ],
    fixes: []
  },
  {
    version: '0.4.0',
    date: '2026-04-15',
    features: [
      'Added Tabbed and Stacked Weekly View.'
    ],
    fixes: [
      'Fixed grid layout overlapping issues on mobile.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-03-20',
    features: [
      'Added multilingual support (French, Greek).',
      'Added PDF Export functionality.'
    ],
    fixes: [
      'Improved offline support.'
    ]
  },
  {
    version: '0.0.1',
    date: '2026-03-01',
    features: [
      'Initial release of SynOdos Log HoS.',
      'Basic weekly log tracking.',
      'Support for 7-Day and 14-Day cycles.'
    ],
    fixes: []
  }
];

export const PreferencesMenu: React.FC<PreferencesMenuProps> = ({
  preferences, setPreferences, isOpen, onClose,
  installPrompt, isStandalone, onInstall
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'defaults' | 'trucking' | 'install' | 'version'>('general');

  if (!isOpen) return null;

  const toggleBoolean = (key: keyof Preferences) => {
    setPreferences({ ...preferences, [key]: !preferences[key] });
  };

  const setString = (key: keyof Preferences, value: string) => {
    setPreferences({ ...preferences, [key]: value });
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'defaults', label: 'Defaults', icon: FileText },
    { id: 'trucking', label: 'Trucking', icon: Truck },
    ...(!isStandalone ? [{ id: 'install', label: 'Install', icon: Download }] : []),
    { id: 'version', label: 'Version', icon: Info },
  ] as const;

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-container">
        {/* Modal Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.5rem', borderBottom: '1px solid var(--glass-border)'
        }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Settings size={24} /> Preferences</h2>
          <button className="tool-btn" onClick={onClose} style={{ padding: '0.5rem', margin: 0 }}><X size={24} /></button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Sidebar Navigation */}
          <div className="modal-sidebar">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`tab-btn ${isActive ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Area */}
          <div className="modal-content">
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>General Settings</h3>
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
                  <label>Week Starts On</label>
                  <select value={preferences.weekStartsOn} onChange={(e) => setPreferences({ ...preferences, weekStartsOn: Number(e.target.value) as 0 | 1 })}>
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
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

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.autoSave} onChange={() => toggleBoolean('autoSave')} />
                  Enable Auto-Save
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showSameVehicle} onChange={() => toggleBoolean('showSameVehicle')} />
                  Show Same Vehicle Checkbox
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showTimestamps} onChange={() => toggleBoolean('showTimestamps')} />
                  {t('showTimestamps', preferences.language) || 'Show Timestamps in Cells'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showDailyTotals} onChange={() => toggleBoolean('showDailyTotals')} />
                  Show Daily Totals Cards
                </label>
              </div>
            )}

            {activeTab === 'defaults' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Default Log Details</h3>
                <div className="input-group">
                  <label>Default Cycle</label>
                  <select value={preferences.defaultCycle || '7-Day'} onChange={(e) => setString('defaultCycle', e.target.value)}>
                    <option value="7-Day">7-Day</option>
                    <option value="14-Day">14-Day</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Driver's Name</label>
                  <input type="text" value={preferences.defaultDriverName || ''} onChange={(e) => setString('defaultDriverName', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Operator Name</label>
                  <input type="text" value={preferences.defaultOperatorName || ''} onChange={(e) => setString('defaultOperatorName', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Operator Business Address</label>
                  <input type="text" value={preferences.defaultOperatorBusinessAddress || ''} onChange={(e) => setString('defaultOperatorBusinessAddress', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Home Terminal Address</label>
                  <input type="text" value={preferences.defaultHomeTerminalAddress || ''} onChange={(e) => setString('defaultHomeTerminalAddress', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>CMV Plate</label>
                  <input type="text" value={preferences.defaultCmvPlate || ''} onChange={(e) => setString('defaultCmvPlate', e.target.value)} />
                </div>
              </div>
            )}

            {activeTab === 'trucking' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Trucking Features</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '-0.75rem' }}>
                  Toggle visibility for specific HOS fields and features on the dashboard.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
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
                </div>
              </div>
            )}

            {activeTab === 'install' && !isStandalone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Installation</h3>
                {installPrompt ? (
                  <button className="btn-primary" onClick={onInstall} style={{ width: '100%', justifyContent: 'center' }}>
                    <Download size={18} /> Install App
                  </button>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <p style={{ marginBottom: '0.5rem' }}>To install for offline use:</p>
                    <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>
                      <li>Open browser menu</li>
                      <li>Select <b>"Add to Home Screen"</b> or <b>"Install App"</b></li>
                    </ol>
                    <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      Note: Installation requires a secure connection (HTTPS) or localhost.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'version' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Version History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {VERSIONS.map((v, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-secondary)', padding: '1rem',
                      borderRadius: '8px', border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>v{v.version}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{v.date}</span>
                      </div>

                      {v.features.length > 0 && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-green)', textTransform: 'uppercase' }}>Features</span>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {v.features.map((feat, j) => <li key={j}>{feat}</li>)}
                          </ul>
                        </div>
                      )}

                      {v.fixes.length > 0 && (
                        <div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>Fixes</span>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {v.fixes.map((fix, j) => <li key={j}>{fix}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-overlay {
          position: fixed; inset: 0; z-index: 4000; 
          background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; justify-content: center; align-items: center; padding: 1rem;
        }
        .modal-container {
          width: 100%; max-width: 800px; height: 85vh; max-height: 800px;
          border-radius: 16px; display: flex; flex-direction: column; padding: 0;
          animation: fadeIn 0.2s ease forwards; overflow: hidden;
        }
        .modal-body {
          display: flex; flex: 1; overflow: hidden;
        }
        .modal-sidebar {
          width: 240px; border-right: 1px solid var(--glass-border);
          background: rgba(0,0,0,0.1); overflow-y: auto; display: flex; flex-direction: column;
        }
        .modal-content {
          flex: 1; padding: 1.5rem; overflow-y: auto;
        }
        .tab-btn {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 1rem 1.5rem; background: transparent;
          border: none; color: var(--text-secondary);
          text-align: left; cursor: pointer; transition: all 0.2s;
          font-weight: 400; border-left: 4px solid transparent;
          white-space: nowrap;
        }
        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .tab-btn.active {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          font-weight: 600;
          border-left: 4px solid var(--accent-blue);
        }
        
        @media (max-width: 640px) {
          .modal-overlay {
            padding: 0;
          }
          .modal-container {
            height: 100vh; max-height: 100vh; border-radius: 0;
          }
          .modal-body {
            flex-direction: column;
          }
          .modal-sidebar {
            width: 100%; flex-direction: row; border-right: none; 
            border-bottom: 1px solid var(--glass-border);
          }
          .tab-btn {
            border-left: none; border-bottom: 4px solid transparent;
          }
          .tab-btn.active {
            border-left: none; border-bottom: 4px solid var(--accent-blue);
          }
        }
      `}</style>
    </div>
  );
};
