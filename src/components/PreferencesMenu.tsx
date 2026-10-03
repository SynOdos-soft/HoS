import React, { useState } from 'react';
import { Preferences, APP_VERSION } from '../types';
import { Settings, Save, Download, Info, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { useDragScroll } from '../lib/useDragScroll';
import { t as translateKey, LANGUAGES, isTranslated } from '../utils/i18n';

interface PreferencesMenuProps {
  preferences: Preferences;
  setPreferences: (prefs: Preferences) => void;
  onClose: () => void;
  installPrompt?: any;
  isStandalone?: boolean;
  onInstall?: () => void;
  initialTab?: 'general' | 'trucking' | 'install' | 'version';
  onCheckForUpdates?: () => void;
  updateCheckStatus?: 'idle' | 'checking' | 'up-to-date';
}const VERSIONS = [
  {
    version: APP_VERSION,
    date: '2026-10-02',
    features: [
      'The handoff QR code now points at a short link — about 70 characters instead of over a thousand — so it scans instantly off a phone screen at a roadside stop.',
      'Handoff links now expire 7 days after you create them, and only your most recent one stays live. Creating a new link retires the old one.',
      'The officer\u2019s record now reads exactly like your own Inspection screen: the same day cards, the same 24-hour grid, the same totals and the same tags, in the same places, so nobody has to learn a second layout.',
      'The officer\u2019s screen states plainly that it is a read-only copy, and says when the record was generated.'
    ],
    fixes: [
      'Fixed the address bar showing a stray "#" at the end of the app\u2019s web address after signing in.',
      'Fixed the QR code refusing to generate on a full 14-day record — it could report "Report is too large for a QR code" on a fragmented grid. Records are now packed before encoding, so every cycle fits.',
      'The QR code is no longer built on the spot while offline. Links are now created on the server; if that is not possible you are told plainly and pointed at the printable PDF rather than being shown a link that will not open.',
      'Labels across the app are no longer in capital letters. The menu headings, the "Weekly record" heading, the daily totals tiles, the audit table headings, the status rows beside the grid and the Inspection tags (Remarks, Odometer, CMV plate, …) are now written the way you would write them, in both English and French.',
      'The "Today" marker and the metadata tags were re-sized so they stay readable now that they are no longer in capitals.',
      'The tab strips on the Account and System Settings screens were sitting flush against the title above them; they now have breathing room.'
    ]
  },
  {
    version: '0.35.0',
    date: '2026-10-02',
    fixes: [
      'The Account screen now follows your language all the way through: the four tabs (Account, Personal Info, My Vehicles, Operator Companies), every field label, the occupation checkboxes, the empty-state hints, the button tooltips and the placeholders.',
      'Backup and cloud messages are translated too — "Backup Now", "Restore Data", "Reconnect & Retry", the encryption PIN warning and every success or failure message, including "Sync failed:" and "Restore failed:" with the reason.',
      'The connection health card is translated: the status badge (On, Syncing, Checking, Offline, Error), the index and preferences file rows, and the "Last error:" line.',
      'Licence, medical exam and first-aid expiries now read "5d left" or "EXPIRED 3d ago" in your language instead of English.',
      'Your saved occupations (Truck Driver, Bus Driver, …) are now shown in your language on the Account screen, while keeping the same stored values so nothing is lost when you switch back.',
      'The Inspection screen card tags are translated: REMARKS, ODOMETER, CMV PLATE, TRAILER, CO-DRIVER, HOME TERMINAL, OPERATOR and MAIN OFFICE.',
      'The roadside diagnostics panel is translated, including the MATCHED / NO MATCH markers and the "Log Date" column heading.',
      'The crash recovery screen, the subscription screen and the app-update banner now follow your language instead of always appearing in English.',
      'The duty-status row captions down the left edge of the grid (Off-Duty, Driving, On-Duty, Sleeper) are translated. The codes inside the cells (OFF, S/D, ON, Y, H) stay in English on purpose — they must match your printed log exactly.',
      'Fixed the "Show Co-Driver(s)", "Show Trailer Plate", "Show Exempt Hrs" and "Show Sleeper Row" switches in Settings → Trucking staying in English, along with the Install and Version History panels.',
      'Fixed tooltips and hover labels on the dashboard week list and the duty-status totals row still reading "Active Week (Edit)", "Completed Week (View)", "Export PDF" and "Sleeper Berth" in English.'
    ]
  },
  {
    version: '0.33.0',
    date: '2026-10-02',
    features: [
      'French (Français) is now available in Settings → General → Language, covering the log book, daily logger, totals, inspection, the roadside handoff, audit trail, account and sign-in screens.',
      'Dates follow your language too — the day and month names in headings and in the officer\'s 15-day record now read in French instead of English.',
      'Every non-English screen carries a clear notice: the translation is AI-generated and the English version is the official record for compliance purposes.',
      'Duty-status codes inside the grid (OFF, S/D, ON, Y, H) are deliberately left in English — they are the regulatory abbreviations that must match your printed log exactly.',
      'Language switching is instant and remembers your choice per account, so a French driver\'s setting is not imposed on the next person to use the device.'
    ],
    fixes: [
      'Fixed roughly 180 user-facing strings that were hardcoded to English and ignored the language setting.',
      'Fixed the language picker not matching the interface language after switching, and the page title and browser language not following it either.'
    ]
  },
  {
    version: '0.32.0',
    date: '2026-10-02',
    features: [
      'Your log book now belongs to your account instead of to the phone. Signing in with a different account on a shared device no longer shows the previous driver\'s weeks — each account sees only its own record.',
      'Everything personal is kept per account too: your vehicles, operator companies, driver profile and licence details, the last plate you used and your saved metadata presets. A second driver on the same tablet starts clean rather than inheriting them.',
      'Edits that are still waiting to upload are now tied to the account that made them, so one driver\'s pending changes can never be pushed into another account.',
      'The weeks already saved on this device are claimed for the account this device was actually using — not by whoever happens to sign in first. Nothing is deleted, nothing leaves the device, and your own log book opens exactly as it did before.'
    ],
    fixes: [
      'Fixed creating a new account showing the previous account\'s local data on the same device.',
      'Fixed a driver\'s saved preferences, vehicles and operator details leaking into another account that later used the same phone or tablet.'
    ]
  },
  {
    version: '0.31.0',
    date: '2026-10-02',
    features: [
      'Inspection handoff: the Inspection screen now offers a QR code the officer can scan to open your 15-day record on their own phone — no sign-in, read-only.',
      'One screen hands over both copies: print the roadside PDF, or copy/share the read-only link if scanning is not convenient.',
      'Officer mode is built for a roadside stop — large type, 24-hour duty bars, odometer, distance, remarks and an explicit "no log recorded" for empty days, with editing turned off entirely.',
      'Days you edited after the fact are flagged on the officer screen so the record stays transparent.',
      'The handoff link now opens as an opaque token — your name, plate and remarks no longer sit in plain text in the address bar or in browser history.',
      'Cleaner link shape: it reads like https://…/?o=3q2-7w… with no "#" in it, and older links that still carry a "#" open too.'
    ]
  },
  {
    version: '0.30.5',
    date: '2026-10-01',
    fixes: [
      'Fixed the app showing a blank white screen when opened without internet — it now opens straight into your saved log book, instantly, every time.',
      'Boot no longer waits on the network at all: your last-signed-in session is restored from this device, and even a long-expired access token no longer blocks the log book.',
      'If connectivity returns mid-session, freshly published app updates now install themselves automatically — no reopening the app, no "Update now" tap needed (anything unsaved on screen always waits).',
      'The Account screen no longer hangs on "Checking…" or falsely reports Drive as disconnected while offline — it now says "Offline" and re-verifies on reconnect.',
      'Backup & sync skips its background rounds while offline instead of spinning and reporting errors; it resumes silently on the next trigger after reconnecting.',
      '"Sync now", "Renew session now" and the reconnect buttons respond instantly with a clear offline message instead of spinning against a dead network.',
      'A crashed screen now shows a recovery page with "Try again" and "Reload app" instead of a white screen — your log book is never touched.'
    ]
  },
  {
    version: '0.30.2',
    date: '2026-09-29',
    security: [
      'Google Drive connection now binds OAuth state to this browser tab and keeps the PKCE verifier out of the redirect URL.',
      'Google Drive token access now requires an active subscription checked server-side.'
    ]
  },
  {
    version: '0.30.1',
    date: '2026-09-26',
    fixes: [
      'Backup & sync now starts reliably right after connecting Google Drive — the status card no longer said "Sync is not running" while Drive was in fact connected.',
      'All dates in the app now use one unambiguous format (YYYY/MM/DD), identical on every device.'
    ]
  },
  {
    version: '0.30.0',
    date: '2026-09-26',
    features: [
      'Accounts are here: sign in with Google or email — your log book now follows you across devices.',
      'Optional Google Drive backup: connect once and every save is backed up automatically and kept in sync between your devices.',
      'Every new account starts on the founder plan — no paywall while billing is being finished.'
    ],
    fixes: [
      'Apps stuck on an old version now update themselves — no more being trapped on a broken screen.',
      'Update banners now also appear on the sign-in and subscription screens.',
      'Sign-in problems report the real cause instead of claiming you are offline.',
      'Unified the sizes of the action buttons on the Account screen.'
    ]
  },
  {
    version: '0.21.4',
    date: '2026-09-25',
    fixes: [
      'Google sign-in problems now show a clear error message in the Account screen instead of failing silently.',
      'Account screen action buttons are now one consistent size.',
      'App updates install themselves reliably instead of waiting on a button that might never be reachable.'
    ]
  },
  {
    version: '0.21.3',
    date: '2026-09-22',
    ui: [
      'Added a "Check for updates" button next to Version History in System Settings.',
      'Removed the "SynOdos" text label from the header bar and menu — logo icon only.',
      'Made the daily log date heading smaller for a tighter day navigator.'
    ]
  },
  {
    version: '0.21.2',
    fixes: [
      'Fixed cloud backup failing with "Maximum call stack size exceeded" once a driver\u2019s log history grew large — backups of any size now succeed on every device.',
      'Removed an empty status strip that could appear at the top of the screen after the app finished preparing offline mode.'
    ]
  },
  {
    version: '0.21.1',
    date: '2026-09-20',
    fixes: [
      'Fixed app updates: new versions now announce themselves with an "Update to vX.Y.Z" banner instead of being served stale assets until every tab was closed. Update when you are ready — your open log is never disturbed.'
    ]
  },
  {
    version: '0.21.0',
    date: '2026-09-20',
    features: [
      'Operator name in the daily log now autocompletes from your saved Operator Companies, filling business address and home terminal in one pick.',
      'Settings restructured: Defaults tab removed — Default Cycle moved to General, and operator/plate fields retired in favor of saved companies and vehicles.',
      'Trucking Features has its own dedicated tab in System Settings.'
    ],
    fixes: [
      'Removed redundant default operator/plate settings that duplicated saved company and vehicle data.'
    ]
  },
  {
    version: '0.20.0',
    date: '2026-09-20',
    ui: [
      'Complete UI unification: shared design tokens for radius, spacing, fonts, and colors across every view.',
      'Full accessibility pass: WCAG AA contrast in both themes, proper landmarks, labeled controls, and zoom support.',
      'Preference views flattened to full width with consistent white surfaces for cards, forms, and buttons.',
      'Settings tab bars redesigned: icons with aligned labels, single-line tabs, and drag-to-scroll on narrow screens.',
      'Menu system polish: stable header positioning, reliable open/close toggle, and pinned background scrolling.'
    ],
    features: [
      'Operator Companies: manage multiple operators with business address and home terminal, searchable from vehicle forms.',
      'Reveal-on-demand forms for vehicles and companies with explicit Save/Cancel actions.',
      'Vehicle mileage shows a last-updated timestamp sourced from the latest odometer reading.',
      'Inspection date now captures month and year.',
      'Empty states guide you to the Add button when no vehicles or companies are saved.'
    ],
    fixes: [
      'Hamburger menu no longer reopens itself when pressed on certain spots.',
      'Opening the menu no longer shifts the header or page layout.',
      'Preference views span the full width with consistent white surfaces and buttons.',
      'Settings tab bars align icons, stay on one line, and drag-scroll on narrow screens.',
      'Company autofill dropdown no longer closes itself on quick refocus.'
    ]
  },
  {
    version: '0.17.0',
    date: '2026-09-19',
    features: [
      'Daily multi-vehicle logging with saved vehicle dropdowns, familiar vehicle names, and per-vehicle odometers.',
      'Sequential odometer tracking carries each vehicle’s end reading into the next matching vehicle start reading.',
      'PDF exports now include consistent vehicle details, full dates, wrapped remarks, operator information, and total distance.'
    ],
    fixes: [
      'Improved additional-vehicle editing, deletion confirmation, and saved vehicle handling.'
    ]
  },
  {
    version: '0.16.3',
    date: '2026-06-26',
    features: [
      'Daily-level Metadata Editing: metadata (Operator name, addresses, CMV plate, etc.) can now be edited and saved independently for each day of the week, supporting drivers with changing daily routes and vehicles.'
    ],
    fixes: [
      'Daily PDF Remarks Restoration: restored the daily CMV license plate number back onto each day\'s remarks block in the weekly PDF export.',
      'Daily Remarks on Off-Duty Days: ensured that full Operator details, home terminal addresses, and daily remarks are rendered on the PDF for fully off-duty days.'
    ]
  },
  {
    version: '0.16.2',
    date: '2026-05-24',
    features: [
      'Toggleable Mobile Early Hours Collapse: drivers can now choose to automatically collapse early "dead" Off-Duty hours (prior to the first duty status change) in the log grid editor on mobile, saving over 1,000px of vertical scrolling space.',
      'Expandable Previous Hours: easily expand collapsed hours on demand via an intuitive interactive banner to adjust earlier Off-Duty blocks if needed.'
    ],
    fixes: [
      'Reactive Auto-Expansion: editing or adding a duty status dynamically updates the start bounds, ensuring no subsequent cells are collapsed unless manually requested.'
    ]
  },
  {
    version: '0.16.1',
    date: '2026-05-22',
    features: [
      'Interactive Roadside Day Cards: day card sections in the Inspection View are now fully collapsible for a streamlined reviewing experience.',
      'Auto-Collapse for Off-Duty: days that are 24 hours off-duty are collapsed by default to automatically highlight active working days.',
      'Header-Level Metrics Summary: collapsed day cards display key driving, on-duty, off-duty, and sleeper totals directly in the header strip for at-a-glance audits.'
    ],
    fixes: [
      'Self-Healing IndexedDB Connection: resolved the "transaction on IDBDatabase is closing" error by implementing a self-healing connection runner that automatically reconnects and retries on failure.',
      'High-Performance Bulk Restore: replaced sequential database operations with a single atomic transaction during backup restores, making operations up to 10x faster and eliminating transaction timeouts.'
    ]
  },
  {
    version: '0.16.0',
    date: '2026-05-18',
    features: [
      'Premium Flat Dashboard: fully tappable cards with glassmorphic border highlights, hover radial glows, and clean calendar date titles.',
      'Embedded Weekly Totals: dynamic real-time calculations of driving, on-duty, sleeper, and off-duty times nested inside every card.',
      'Sleek Icon-Only Metrics: minimalist totals display utilizing the same compliance iconography (Steering Wheel, Briefcase, Bed, Coffee) as the Inspection View.',
      'Dynamic Feature Adaptability: smart auto-scaling flex container that dynamically hides the Sleeper Berth metric when disabled in settings.',
      'Streamlined Card Utility Panel: paired PDF Export and safety Deletion confirm actions aligned perfectly on the top-right of cards with tap propagation safety.',
      'Clutter-Free Log Details: removed redundant Driver Name inputs from weekly forms while preserving user defaults for background PDF exports.'
    ],
    fixes: []
  },
  {
    version: '0.15.0',
    date: '2026-05-18',
    features: [
      'Zero-knowledge, client-side AES-GCM encrypted cloud sync and backup system.',
      'Secured integration with personal Google Drive AppData folder, isolated from user-visible folders for audit safety.',
      'One-tap preference and weekly log backup, restorable instantly with a driver-defined passphrase/PIN.'
    ],
    fixes: []
  },
  {
    version: '0.10.0',
    date: '2026-05-18',
    features: [
      'Added a custom, full-width glassmorphism absolute autocomplete dropdown for defaults and logger plate selectors.',
      'Moved Trucking Features directly into User Preferences for a cleaner, unified account configuration experience.',
      'Created a robust deep-merging storage migration engine for backward-compatible saved profile upgrades.',
      'Synchronous head script injection to completely eliminate the dark-to-light theme flashing on page reload.'
    ],
    fixes: [
      'Fixed an infinite React re-render crash loop in User Preferences on mobile devices.',
      'Ensured complete real-time IndexedDB log loading when accessing the roadside Inspection View directly.',
      'Restored standard clean text input placeholders when clearing daily CMV Plate fields.'
    ]
  },
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
  preferences, setPreferences, onClose,
  installPrompt, isStandalone, onInstall, initialTab,
  onCheckForUpdates, updateCheckStatus = 'idle'
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'trucking' | 'install' | 'version'>(initialTab || 'general');
  // Bound to the saved language; kept in sync with setI18nLanguage by App.
  const t = (key: Parameters<typeof translateKey>[0]) => translateKey(key, preferences.language);
  const tabRow = useDragScroll<HTMLDivElement>();
  const toggleBoolean = (key: keyof Preferences) => {
    setPreferences({ ...preferences, [key]: !preferences[key] });
  };

  const setString = (key: keyof Preferences, value: string) => {
    setPreferences({ ...preferences, [key]: value });
  };

  const tabs = [
    { id: 'general', label: t('generalTab'), icon: Settings },
    { id: 'trucking', label: t('truckingFeatures'), icon: SlidersHorizontal },
    ...(!isStandalone ? [{ id: 'install', label: t('install'), icon: Download }] : []),
    { id: 'version', label: t('version'), icon: Info },
  ] as const;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative' }}>
        
        {/* Tab System identical to User Profile */}
        <div
          className="tab-row"
          ref={tabRow.ref}
          onMouseDown={tabRow.onMouseDown}
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { if (!tabRow.dragState.current.moved) setActiveTab(tab.id as any); }}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>{t('generalSettings')}</h3>
                <div className="input-group">
                  <label>{t('language')}</label>
                  <select value={preferences.language} onChange={(e) => setString('language', e.target.value)}>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                {/* Translation notice: shown only when the UI is not English. */}
                {isTranslated(preferences.language) && (
                  <p className="translation-notice">
                    <strong>{t('aiTranslationShort')}.</strong> {t('aiTranslationNotice')}
                  </p>
                )}
                <div className="input-group">
                  <label>{t('theme')}</label>
                  <select value={preferences.theme} onChange={(e) => setString('theme', e.target.value)}>
                    <option value="dark">{t('darkMode')}</option>
                    <option value="light">{t('lightMode')}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('timeFormat')}</label>
                  <select value={preferences.timeFormat} onChange={(e) => setString('timeFormat', e.target.value)}>
                    <option value="12h">{t('timeFormat12h')}</option>
                    <option value="24h">{t('timeFormat24h')}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('weekStartsOn')}</label>
                  <select value={preferences.weekStartsOn} onChange={(e) => setPreferences({ ...preferences, weekStartsOn: Number(e.target.value) as 0 | 1 })}>
                    <option value={1}>{t('monday')}</option>
                    <option value={0}>{t('sunday')}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('defaultCycle')}</label>
                  <select value={preferences.defaultCycle || '7-Day'} onChange={(e) => setString('defaultCycle', e.target.value)}>
                    <option value="7-Day">{t('cycle7Day')}</option>
                    <option value="14-Day">{t('cycle14Day')}</option>
                  </select>
                </div>

                <hr style={{ borderColor: 'var(--border-color)', margin: '0.5rem 0' }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.autoSave} onChange={() => toggleBoolean('autoSave')} />
                  {t('autoSave')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showSameVehicle} onChange={() => toggleBoolean('showSameVehicle')} />
                  {t('showAdditionalVehicles')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showTimestamps} onChange={() => toggleBoolean('showTimestamps')} />
                  {t('showTimestamps')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.showDailyTotals} onChange={() => toggleBoolean('showDailyTotals')} />
                  {t('showDailyTotalsCards')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.hideEarlyHours} onChange={() => toggleBoolean('hideEarlyHours')} />
                  {t('hideEarlyHoursNote')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={preferences.collapseEarlyHours} onChange={() => toggleBoolean('collapseEarlyHours')} />
                  {t('collapseEarlyHoursNote')}
                </label>
              </div>
            )}

            {activeTab === 'trucking' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>{t('truckingFeatures')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                  {t('truckingFeaturesBody')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={preferences.showCoDrivers}
                      onChange={() => toggleBoolean('showCoDrivers')}
                    />
                    {t('showCoDrivers')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={preferences.showTrailerPlate}
                      onChange={() => toggleBoolean('showTrailerPlate')}
                    />
                    {t('showTrailerPlate')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={preferences.showExempt}
                      onChange={() => toggleBoolean('showExempt')}
                    />
                    {t('showExemptHrs')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={preferences.showSleeper}
                      onChange={() => toggleBoolean('showSleeper')}
                    />
                    {t('showSleeperRow')}
                  </label>
                </div>
              </div>
            )}




            {activeTab === 'install' && !isStandalone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>{t('install')}</h3>
                {installPrompt ? (
                  <button className="btn-primary" onClick={onInstall} style={{ width: '100%', justifyContent: 'center' }}>
                    <Download size={18} /> {t('installApp')}
                  </button>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <p style={{ marginBottom: '0.5rem' }}>{t('installOfflineIntro')}</p>
                    <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>
                      <li>{t('installStep1')}</li>
                      <li>{t('installStep2')}</li>
                    </ol>
                    <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {t('installNote')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'version' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>{t('versionHistory')}</h3>
                  {onCheckForUpdates && (
                    <button
                      className="btn-secondary"
                      onClick={onCheckForUpdates}
                      disabled={updateCheckStatus === 'checking'}
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', gap: '0.375rem', flexShrink: 0 }}
                    >
                      <RefreshCw size={14} style={updateCheckStatus === 'checking' ? { animation: 'spin 1s linear infinite' } : undefined} />
                      {updateCheckStatus === 'checking' ? t('checkingEllipsis') : t('checkForUpdates')}
                    </button>
                  )}
                </div>
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

                      {v.security && v.security.length > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-orange)' }}>{t('securityHeading')}</span>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {v.security.map((item, j) => <li key={j}>{item}</li>)}
                          </ul>
                        </div>
                      )}

                      {v.ui && v.ui.length > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-orange)' }}>{t('uiChangesHeading')}</span>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {v.ui.map((item, j) => <li key={j}>{item}</li>)}
                          </ul>
                        </div>
                      )}

                      {v.features && v.features.length > 0 && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-green)' }}>{t('whatChanged')}</span>
                          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {v.features.map((feat, j) => <li key={j}>{feat}</li>)}
                          </ul>
                        </div>
                      )}

                      {v.fixes && v.fixes.length > 0 && (
                        <div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue)' }}>{t('fixes')}</span>
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

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose}>
            <Save size={18} /> Return to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
};
