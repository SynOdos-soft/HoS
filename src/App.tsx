import { useState, useEffect } from 'react';
import { Grid } from './components/Grid';
import { Totals } from './components/Totals';
import { MetadataForm } from './components/MetadataForm';
import { PreferencesMenu } from './components/PreferencesMenu';
import { WeeklyLog, WeeklyMetadata, Status, DayEntry, Preferences, DEFAULT_PREFS } from './types';
import { saveLog, getLog, getAllLogs, deleteLog } from './utils/storage';
import { generatePDF } from './utils/pdf';
import { Download, Save, ArrowLeft, Plus, Trash2, Settings, Lock, LockOpen, Copy } from 'lucide-react';
import { startOfWeek, addDays, format, parseISO } from 'date-fns';
import { t } from './utils/i18n';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Wifi, WifiOff, CloudDownload } from 'lucide-react';

const DEFAULT_METADATA: WeeklyMetadata = {
  homeTerminalAddress: '',
  month: '',
  year: '',
  cycle: '7-Day',
  driverName: '',
  coDrivers: '',
  weekNumber: '',
  operatorName: '',
  operatorBusinessAddress: '',
  cmvPlate: '',
  trailerPlate: '',
  exemptHrs14Day: '',
  signature: '',
};

const createEmptyDays = (startDate: Date): DayEntry[] => {
  return Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(startDate, i);
    return {
      date: format(d, 'yyyy-MM-dd'),
      grid: Array(96).fill('off-duty'),
      remarks: '',
      startOdometer: '',
      endOdometer: '',
      locked: false
    };
  });
};

export default function App() {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [savedLogs, setSavedLogs] = useState<WeeklyLog[]>([]);

  // Preferences State
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const saved = localStorage.getItem('hos-preferences');
    return saved ? JSON.parse(saved) : DEFAULT_PREFS;
  });
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);

  // Editor State
  const [currentId, setCurrentId] = useState<string>('');
  const [metadata, setMetadata] = useState<WeeklyMetadata>(DEFAULT_METADATA);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    return localStorage.getItem('hide-install-banner') !== 'true';
  });

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  // PWA Registration
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered');
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // Apply theme class
  useEffect(() => {
    if (preferences.theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    localStorage.setItem('hos-preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (view === 'dashboard') {
      loadDashboard();
    }
  }, [view]);

  const loadDashboard = async () => {
    const logs = await getAllLogs();
    logs.sort((a, b) => b.id.localeCompare(a.id));
    setSavedLogs(logs);
  };

  const startNewWeek = (targetDate: Date) => {
    const monday = startOfWeek(targetDate, { weekStartsOn: 1 });
    const id = format(monday, 'yyyy-MM-dd');
    setCurrentId(id);
    setMetadata({
      ...DEFAULT_METADATA,
      month: format(monday, 'MMMM'),
      year: format(monday, 'yyyy'),
    });
    setDays(createEmptyDays(monday));
    setSelectedDayIndex(0);
    setView('editor');
  };

  const handleEditLog = async (id: string) => {
    const log = await getLog(id);
    if (log) {
      setCurrentId(log.id);
      setMetadata(log.metadata);
      setDays(log.days);
      setSelectedDayIndex(0);
      setView('editor');
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this log?')) {
      await deleteLog(id);
      loadDashboard();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const log: WeeklyLog = {
      id: currentId,
      metadata,
      days,
    };
    await saveLog(log);
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleExportPDF = () => {
    const log: WeeklyLog = {
      id: currentId,
      metadata,
      days,
    };
    generatePDF(log, preferences);
  };

  // Auto-save debounced effect
  useEffect(() => {
    if (preferences.autoSave && view === 'editor' && currentId) {
      const timer = setTimeout(() => {
        handleSave();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [days, metadata, preferences.autoSave]);

  const updateSelectedDayGrid = (idx: number, newGrid: Status[] | ((prev: Status[]) => Status[])) => {
    setDays((prev) => {
      const updated = [...prev];
      const currentGrid = updated[idx].grid;
      updated[idx].grid = typeof newGrid === 'function' ? newGrid(currentGrid) : newGrid;
      return updated;
    });
  };

  const updateSelectedDayField = (idx: number, field: 'remarks' | 'startOdometer' | 'endOdometer', value: string) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[idx][field] = value;
      return updated;
    });
  };

  const toggleDayLock = (idx: number) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], locked: !updated[idx].locked };
      return updated;
    });
  };

  const savePreset = (grid: Status[]) => {
    localStorage.setItem('hos-preset', JSON.stringify(grid));
    alert('Day grid saved as preset!');
  };

  const loadPreset = (idx: number) => {
    const preset = localStorage.getItem('hos-preset');
    if (preset) {
      if (!days[idx].locked) {
        updateSelectedDayGrid(idx, JSON.parse(preset));
      } else {
        alert('Cannot apply preset to a locked day.');
      }
    } else {
      alert('No preset saved yet. Use "Save Preset" first.');
    }
  };
  const toggleDayCollapse = (date: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const renderDayPanel = (day: DayEntry, idx: number) => {
    const isCollapsed = collapsedDays.has(day.date);
    return (
      <div key={day.date} className="glass-panel day-panel no-print" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
        {/* Row 1: Date + collapse arrow */}
        <div
          className="day-panel-header"
          onClick={() => toggleDayCollapse(day.date)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 2rem 0.75rem 1rem', cursor: 'pointer',
            borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
            userSelect: 'none',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            {format(parseISO(day.date), 'EEEE, MMMM d, yyyy')}
            {day.locked && <Lock size={14} style={{ marginLeft: '8px', color: 'var(--accent-red)', verticalAlign: 'middle' }} />}
          </h3>
          <span style={{ color: 'var(--text-secondary)', transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            ▼
          </span>
        </div>

        {!isCollapsed && (
          <div style={{ padding: '1rem' }}>
            {/* Row 2: Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button className="tool-btn" onClick={() => savePreset(day.grid)} title={t('savePreset', preferences.language)}>
                <Copy size={14} /> {t('savePreset', preferences.language)}
              </button>
              <button className="tool-btn" onClick={() => loadPreset(idx)} title={t('applyPreset', preferences.language)} disabled={day.locked}>
                <Download size={14} /> {t('applyPreset', preferences.language)}
              </button>
              <button className={`tool-btn ${day.locked ? 'active' : ''}`} onClick={() => toggleDayLock(idx)} style={{ marginLeft: 'auto' }}>
                {day.locked ? <Lock size={14} style={{ color: 'var(--accent-red)' }} /> : <LockOpen size={14} />}
                {day.locked ? t('locked', preferences.language) : t('finishDay', preferences.language)}
              </button>
            </div>

            {/* Odometer + Remarks */}
            <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('remarks', preferences.language)}</label>
                <input
                  type="text"
                  className="input-group"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  value={day.remarks || ''}
                  onChange={(e) => updateSelectedDayField(idx, 'remarks', e.target.value)}
                  placeholder="..."
                  disabled={day.locked}
                />
              </div>
              <div style={{ minWidth: '120px', width: '45%', display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: "auto" }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('startOdo', preferences.language)}</label>
                <input
                  type="number"
                  className="input-group"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  value={day.startOdometer || ''}
                  onChange={(e) => updateSelectedDayField(idx, 'startOdometer', e.target.value)}
                  onBlur={(e) => {
                    const start = Number(e.target.value);
                    const end = Number(day.endOdometer);
                    if (day.endOdometer && end < start) updateSelectedDayField(idx, 'endOdometer', start.toString());
                  }}
                  disabled={day.locked}
                />
              </div>
              <div style={{ minWidth: '120px', width: '45%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('endOdo', preferences.language)}</label>
                <input
                  type="number"
                  className="input-group"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  value={day.endOdometer || ''}
                  onChange={(e) => updateSelectedDayField(idx, 'endOdometer', e.target.value)}
                  onBlur={(e) => {
                    const end = Number(e.target.value);
                    const start = Number(day.startOdometer);
                    if (day.startOdometer && end < start) updateSelectedDayField(idx, 'endOdometer', start.toString());
                  }}
                  min={day.startOdometer || ''}
                  disabled={day.locked}
                />
              </div>
            </div>

            <Grid
              grid={day.grid}
              setGrid={(newGrid) => updateSelectedDayGrid(idx, newGrid)}
              preferences={preferences}
              locked={day.locked}
            />
            <div style={{ marginTop: '1rem' }}>
              <Totals grid={day.grid} preferences={preferences} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
          {(offlineReady || needRefresh || !isOnline || installPrompt || (!isStandalone && showInstallBanner)) && (
            <div className="glass-panel no-print" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              background: needRefresh || installPrompt ? 'rgba(59, 130, 246, 0.2)' : !isOnline ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              borderColor: needRefresh || installPrompt ? 'var(--accent-blue)' : !isOnline ? 'var(--accent-red)' : 'var(--accent-green)',
              marginTop: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {!isOnline ? (
                <><WifiOff size={16} color="var(--accent-red)" /> <span>Working Offline</span></>
              ) : installPrompt ? (
                <>
                  <Plus size={16} color="var(--accent-blue)" />
                  <span>Install Synodos Log for the best experience</span>
                  <button className="btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={handleInstallClick}>
                    Install Now
                  </button>
                </>
              ) : !isStandalone && !offlineReady ? (
                <>
                  <Settings size={16} color="var(--accent-blue)" />
                  <span>To install: Open browser menu & select <b>"Add to Home Screen"</b></span>
                </>
              ) : offlineReady ? (
                <><CloudDownload size={16} color="var(--accent-green)" /> <span>Ready to work offline</span></>
              ) : needRefresh ? (
                <>
                  <span>New content available!</span>
                  <button className="btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => updateServiceWorker(true)}>
                    Update
                  </button>
                </>
              ) : null}
              {(offlineReady || needRefresh || installPrompt || !isStandalone) && (
                <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => {
                  setOfflineReady(false);
                  setNeedRefresh(false);
                  setInstallPrompt(null);
                  if (!isStandalone) {
                    setShowInstallBanner(false);
                    localStorage.setItem('hide-install-banner', 'true');
                  }
                }}>✕</button>
              )}
            </div>
          )}

      {view === 'dashboard' ? (
        <>
          <header className="header">
            <h1>{t('dashboard', preferences.language)}</h1>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="tool-btn" onClick={() => setIsPrefsOpen(true)}>
                <Settings size={18} />
              </button>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="date"
                  onChange={(e) => e.target.value && startNewWeek(new Date(e.target.value))}
                  style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
                <button className="btn-primary" style={{ pointerEvents: 'none' }}>
                  <Plus size={18} /> {t('newWeek', preferences.language)}
                </button>
              </div>
            </div>
          </header>

          <main style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', marginTop: '1rem' }}>
            {savedLogs.length === 0 ? (
              <div className="glass-panel" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>{t('noLogs', preferences.language)}</p>
              </div>
            ) : (
              savedLogs.map(log => (
                <div key={log.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3>Week of {log.id}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Driver: {log.metadata.driverName || 'N/A'}<br />
                    Cycle: {log.metadata.cycle}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <button className="btn-primary" style={{ flex: 1, padding: '0.5rem', justifyContent: 'center' }} onClick={() => handleEditLog(log.id)}>
                      Edit
                    </button>
                    <button className="btn-primary" style={{ background: 'var(--accent-red)', padding: '0.5rem' }} onClick={() => handleDeleteLog(log.id)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </main>
        </>
      ) : (
        <>
          <header className="header no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button className="tool-btn" onClick={() => setView('dashboard')} style={{ padding: '0.5rem' }}>
                <ArrowLeft size={20} />
              </button>
              <h1>Week of {currentId}</h1>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="tool-btn" onClick={() => setIsPrefsOpen(true)}>
                <Settings size={18} />
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
                <Save size={18} /> {isSaving ? t('saved', preferences.language) : t('save', preferences.language)}
              </button>
              <button className="btn-primary" onClick={handleExportPDF} style={{ background: 'var(--accent-green)' }}>
                <Download size={18} /> {t('exportPdf', preferences.language)}
              </button>
            </div>
          </header>

          <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
            <MetadataForm metadata={metadata} setMetadata={setMetadata} preferences={preferences} />

            {preferences.viewMode === 'tabs' ? (
              <div>
                <div style={{ display: 'flex', overflowX: 'auto', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
                  {days.map((day, idx) => {
                    const d = parseISO(day.date);
                    return (
                      <button
                        key={day.date}
                        className={`tool-btn ${selectedDayIndex === idx ? 'active' : ''}`}
                        onClick={() => setSelectedDayIndex(idx)}
                        style={{ minWidth: '120px', justifyContent: 'center' }}
                      >
                        {format(d, 'EEEE')} {day.locked && <Lock size={12} style={{ marginLeft: '4px' }} />}<br />
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>{format(d, 'MMM d')}</span>
                      </button>
                    );
                  })}
                </div>
                {days[selectedDayIndex] && renderDayPanel(days[selectedDayIndex], selectedDayIndex)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {days.map((day, idx) => renderDayPanel(day, idx))}
              </div>
            )}
          </main>
        </>
      )}

      <PreferencesMenu 
        preferences={preferences} 
        setPreferences={setPreferences} 
        isOpen={isPrefsOpen} 
        onClose={() => setIsPrefsOpen(false)} 
        installPrompt={installPrompt}
        isStandalone={isStandalone}
        onInstall={handleInstallClick}
      />

      <footer className="no-print" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 'auto' }}>
        Copyright &copy; 2026 SynOdos. All rights reserved.
      </footer>
    </div>
  );
}
