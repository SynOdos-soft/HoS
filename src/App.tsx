import { useState, useEffect } from 'react';
import { Grid } from './components/Grid';
import { Totals } from './components/Totals';
import { MetadataForm } from './components/MetadataForm';
import { PreferencesMenu } from './components/PreferencesMenu';
import { WeeklyLog, WeeklyMetadata, Status, DayEntry, Preferences, DEFAULT_PREFS, AuditEntry } from './types';
import { saveLog, getLog, getAllLogs, deleteLog } from './utils/storage';
import { generatePDF } from './utils/pdf';
import { Download, Save, ArrowLeft, Plus, Trash2, Settings, Lock, LockOpen, Copy, WifiOff } from 'lucide-react';
import { startOfWeek, addDays, subDays, format, parseISO, getWeek, isToday, isBefore, startOfDay } from 'date-fns';
import { t } from './utils/i18n';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AuditView } from './components/AuditView';
import { ReasonModal } from './components/ReasonModal';

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
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(startDate, i);
    return {
      date: format(d, 'yyyy-MM-dd'),
      grid: Array(96).fill('off-duty'),
      remarks: '',
      startOdometer: '',
      endOdometer: '',
      locked: isBefore(d, today),
      sameVehicle: true,
      cmvPlate: '',
      lastEdited: new Date().toISOString(),
    };
  });
};

export default function App() {
  const [view, setView] = useState<'dashboard' | 'editor' | 'audit'>('dashboard');
  const [auditReturnView, setAuditReturnView] = useState<'dashboard' | 'editor'>('dashboard');
  const [savedLogs, setSavedLogs] = useState<WeeklyLog[]>([]);

  const [preferences, setPreferences] = useState<Preferences>(() => {
    const saved = localStorage.getItem('hos-preferences');
    return saved ? JSON.parse(saved) : DEFAULT_PREFS;
  });
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);

  const [currentId, setCurrentId] = useState<string>('');
  const [metadata, setMetadata] = useState<WeeklyMetadata>(DEFAULT_METADATA);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [lastSavedLog, setLastSavedLog] = useState<WeeklyLog | null>(null);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [autoLoaded, setAutoLoaded] = useState(false);

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

  const { offlineReady: [offlineReady], needRefresh: [needRefresh] } = useRegisterSW();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
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
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  useEffect(() => {
    if (preferences.theme === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    localStorage.setItem('hos-preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => { if (view === 'dashboard') loadDashboard(); }, [view]);

  useEffect(() => {
    if (!autoLoaded) {
      setAutoLoaded(true);
      autoLoadCurrentWeek();
    }
  }, []);

  const autoLoadCurrentWeek = async () => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    const weekId = format(monday, 'yyyy-MM-dd');
    const existingLog = await getLog(weekId);
    if (existingLog) {
      setCurrentId(existingLog.id);
      setMetadata(existingLog.metadata);
      setDays(existingLog.days);
      setAuditLog(existingLog.auditLog || []);
      setLastSavedLog(existingLog);
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = existingLog.days.findIndex(d => d.date === todayStr);
      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
      setCollapsedDays(new Set(existingLog.days.map(d => d.date).filter(d => d !== todayStr)));
      setView('editor');
    } else {
      startNewWeekWithToday(today);
    }
  };

  const loadDashboard = async () => {
    const logs = await getAllLogs();
    logs.sort((a, b) => b.id.localeCompare(a.id));
    setSavedLogs(logs);
  };

  const startNewWeek = (targetDate: Date) => {
    const monday = startOfWeek(targetDate, { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);
    const id = format(monday, 'yyyy-MM-dd');
    setCurrentId(id);
    let mStr = format(monday, 'MMMM');
    if (mStr !== format(sunday, 'MMMM')) mStr += ` - ${format(sunday, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(monday, 'yyyy'), weekNumber: getWeek(monday, { weekStartsOn: 1 }).toString(), cycle: preferences.defaultCycle || '7-Day', driverName: preferences.defaultDriverName || '', operatorName: preferences.defaultOperatorName || '', operatorBusinessAddress: preferences.defaultOperatorBusinessAddress || '', homeTerminalAddress: preferences.defaultHomeTerminalAddress || '', cmvPlate: preferences.defaultCmvPlate || '' };
    setMetadata(md);
    const d = createEmptyDays(monday);
    setDays(d);
    setAuditLog([]);
    setLastSavedLog({ id, metadata: md, days: d, auditLog: [] });
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayIdx = d.findIndex(x => x.date === todayStr);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
    setCollapsedDays(new Set(d.map(x => x.date).filter(x => x !== todayStr)));
    setView('editor');
  };

  const startNewWeekWithToday = (today: Date) => {
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);
    const id = format(monday, 'yyyy-MM-dd');
    setCurrentId(id);
    let mStr = format(monday, 'MMMM');
    if (mStr !== format(sunday, 'MMMM')) mStr += ` - ${format(sunday, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(monday, 'yyyy'), weekNumber: getWeek(monday, { weekStartsOn: 1 }).toString(), cycle: preferences.defaultCycle || '7-Day', driverName: preferences.defaultDriverName || '', operatorName: preferences.defaultOperatorName || '', operatorBusinessAddress: preferences.defaultOperatorBusinessAddress || '', homeTerminalAddress: preferences.defaultHomeTerminalAddress || '', cmvPlate: preferences.defaultCmvPlate || '' };
    setMetadata(md);
    const d = createEmptyDays(monday);
    setDays(d);
    setAuditLog([]);
    setLastSavedLog({ id, metadata: md, days: d, auditLog: [] });
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayIdx = d.findIndex(x => x.date === todayStr);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
    setCollapsedDays(new Set(d.map(x => x.date).filter(x => x !== todayStr)));
    setView('editor');
  };

  const handleEditLog = async (id: string) => {
    const log = await getLog(id);
    if (log) {
      setCurrentId(log.id);
      setMetadata(log.metadata);
      setAuditLog(log.auditLog || []);
      const today = startOfDay(new Date());
      // Auto-lock past days on load to ensure compliance
      const d = log.days.map(day => ({ 
        ...day, 
        locked: day.locked || isBefore(parseISO(day.date), today) 
      }));
      setDays(d);
      setLastSavedLog({ ...log, days: d });
      
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = d.findIndex(x => x.date === todayStr);
      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
      setCollapsedDays(new Set(d.map(x => x.date).filter(x => x !== todayStr)));
      setView('editor');
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (window.confirm('Delete this log?')) { await deleteLog(id); loadDashboard(); }
  };

  const getAuditDiffs = (oldLog: WeeklyLog, newLog: WeeklyLog, reason: string): AuditEntry[] => {
    const diffs: AuditEntry[] = [];
    const timestamp = new Date().toISOString();
    const today = startOfDay(new Date());

    // Only audit metadata if it's a past week or already locked? 
    // Usually metadata changes are minor, but for safety we only audit if it's not the current week's metadata
    const isCurrentWeek = newLog.id === format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    if (!isCurrentWeek) {
      Object.keys(newLog.metadata).forEach(k => {
        const key = k as keyof WeeklyMetadata;
        if (oldLog.metadata[key] !== newLog.metadata[key]) {
          diffs.push({ timestamp, field: `Metadata: ${key}`, originalValue: String(oldLog.metadata[key] || 'Empty'), newValue: String(newLog.metadata[key] || 'Empty'), editedBy: 'Driver', reason });
        }
      });
    }

    newLog.days.forEach((day, i) => {
      const oldDay = oldLog.days[i];
      if (!oldDay) return;

      // RULE: Only audit if it's a past day OR it was previously locked
      const shouldAudit = isBefore(parseISO(day.date), today) || oldDay.locked;
      if (!shouldAudit) return;

      ['remarks', 'startOdometer', 'endOdometer', 'cmvPlate', 'sameVehicle'].forEach(f => {
        const field = f as keyof DayEntry;
        if (day[field] !== oldDay[field]) {
          diffs.push({ timestamp, date: day.date, field: f, originalValue: String(oldDay[field] ?? 'Empty'), newValue: String(day[field] ?? 'Empty'), editedBy: 'Driver', reason });
        }
      });
      if (JSON.stringify(day.grid) !== JSON.stringify(oldDay.grid)) {
        const getSummary = (grid: Status[]) => {
          const counts: Record<string, number> = {};
          grid.forEach(s => counts[s] = (counts[s] || 0) + 1);
          return Object.entries(counts)
            .map(([s, q]) => `${s.split('-')[0]}: ${(q / 4).toFixed(1)}h`)
            .join(' | ');
        };
        const findChanges = () => {
          const changedRanges: string[] = [];
          let start: number | null = null;
          for (let j = 0; j < 96; j++) {
            if (day.grid[j] !== oldDay.grid[j]) {
              if (start === null) start = j;
            } else {
              if (start !== null) {
                const h1 = Math.floor(start / 4); const m1 = (start % 4) * 15;
                const h2 = Math.floor(j / 4); const m2 = (j % 4) * 15;
                changedRanges.push(`${h1}:${m1 || '00'}-${h2}:${m2 || '00'}`);
                start = null;
              }
            }
          }
          if (start !== null) {
            const h1 = Math.floor(start / 4); const m1 = (start % 4) * 15;
            changedRanges.push(`${h1}:${m1 || '00'}-00:00`);
          }
          return changedRanges.join(', ');
        };

        diffs.push({ 
          timestamp, 
          date: day.date, 
          field: 'Duty Status Grid', 
          originalValue: `${findChanges()} (Old: ${getSummary(oldDay.grid)})`, 
          newValue: `Modified (New: ${getSummary(day.grid)})`, 
          editedBy: 'Driver', 
          reason 
        });
      }
    });
    return diffs;
  };

  const handleSave = async (reason: string = '') => {
    const today = startOfDay(new Date());
    const needsReason = days.some((d, i) => {
      const old = lastSavedLog?.days[i];
      return old && (isBefore(parseISO(d.date), today) || old.locked) && JSON.stringify(d) !== JSON.stringify(old);
    });
    if (needsReason && !reason) { setIsReasonModalOpen(true); return; }
    setIsSaving(true);
    let newAudit = auditLog;
    if (lastSavedLog) newAudit = [...auditLog, ...getAuditDiffs(lastSavedLog, { id: currentId, metadata, days }, reason)];
    const log = { id: currentId, metadata, days, auditLog: newAudit };
    await saveLog(log);
    setAuditLog(newAudit);
    setLastSavedLog(log);
    setIsReasonModalOpen(false);
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleExportPDF = () => generatePDF({ id: currentId, metadata, days }, preferences);
  const handleExportDashboardPDF = (log: WeeklyLog) => generatePDF(log, preferences);

  const handleRoadsidePDF = async () => {
    const today = new Date();
    const allLogs = await getAllLogs();
    const allDays: DayEntry[] = [];
    allLogs.forEach(l => l.days.forEach(d => allDays.push(d)));
    const todayStr = format(today, 'yyyy-MM-dd');
    const startStr = format(subDays(today, 14), 'yyyy-MM-dd');
    const filtered = allDays.filter(d => d.date >= startStr && d.date <= todayStr);
    const filled: DayEntry[] = [];
    for (let i = 14; i >= 0; i--) {
      const ds = format(subDays(today, i), 'yyyy-MM-dd');
      const ex = filtered.find(d => d.date === ds);
      filled.push(ex || { date: ds, grid: Array(96).fill('off-duty'), remarks: '', startOdometer: '', endOdometer: '', locked: true, sameVehicle: true, cmvPlate: '' });
    }
    const cLog = allLogs.find(l => l.id === format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    generatePDF({ id: `roadside-${todayStr}`, metadata: cLog?.metadata || DEFAULT_METADATA, days: filled }, preferences, true);
  };

  useEffect(() => {
    if (preferences.autoSave && view === 'editor' && currentId) {
      const timer = setTimeout(() => {
        const today = startOfDay(new Date());
        const needsReason = days.some((d, i) => {
          const old = lastSavedLog?.days[i];
          return old && (isBefore(parseISO(d.date), today) || old.locked) && JSON.stringify(d) !== JSON.stringify(old);
        });
        if (!needsReason) handleSave();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [days, metadata, preferences.autoSave]);

  const updateSelectedDayGrid = (idx: number, newGrid: Status[] | ((prev: Status[]) => Status[])) => {
    setDays(prev => {
      const updated = [...prev];
      updated[idx].grid = typeof newGrid === 'function' ? newGrid(updated[idx].grid) : newGrid;
      updated[idx].lastEdited = new Date().toISOString();
      return updated;
    });
  };

  const updateSelectedDayField = (idx: number, field: string, value: any) => {
    setDays(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value, lastEdited: new Date().toISOString() };
      if (field === 'endOdometer' && idx < 6) {
        const next = updated[idx + 1];
        if (next.sameVehicle !== false && !next.locked) updated[idx + 1] = { ...next, startOdometer: value };
      }
      if (field === 'sameVehicle' && value === true && idx > 0) {
        const pDay = updated[idx - 1];
        if (pDay.endOdometer) updated[idx] = { ...updated[idx], startOdometer: pDay.endOdometer };
      }
      return updated;
    });
  };

  const toggleDayLock = (idx: number) => {
    const day = days[idx];
    const isPastDay = isBefore(parseISO(day.date), startOfDay(new Date()));
    
    if (day.locked) {
      // Trying to UNLOCK
      if (isPastDay) {
        if (!window.confirm('WARNING: Unlocking a past day for editing will be recorded in the Audit Log for compliance. Continue?')) {
          return;
        }
      }
    }

    setDays(prev => {
      const u = [...prev];
      u[idx] = { ...u[idx], locked: !u[idx].locked };
      return u;
    });
  };

  const savePreset = (grid: Status[]) => { localStorage.setItem('hos-preset', JSON.stringify(grid)); alert('Preset saved!'); };
  const loadPreset = (idx: number) => {
    const p = localStorage.getItem('hos-preset');
    if (p && !days[idx].locked) updateSelectedDayGrid(idx, JSON.parse(p));
    else if (!p) alert('No preset.'); else alert('Locked.');
  };

  const toggleDayCollapse = (date: string) => {
    setCollapsedDays(prev => {
      const n = new Set(prev);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });
  };

  const renderDayPanel = (day: DayEntry, idx: number) => {
    const isCollapsed = collapsedDays.has(day.date);
    const dayIsToday = isToday(parseISO(day.date));
    const currentHour = dayIsToday ? new Date().getHours() : -1;
    const counts = day.grid.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<Status, number>);
    const fmtH = (q: number) => {
      const h = Math.floor(q / 4);
      const m = (q % 4) * 15;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };
    const totalKm = (() => {
      const s = Number(day.startOdometer); const e = Number(day.endOdometer);
      return (!isNaN(s) && !isNaN(e) && e >= s && day.startOdometer !== '' && day.endOdometer !== '') ? `${e - s} km` : '0 km';
    })();

    return (
      <div key={day.date} className={`glass-panel day-panel no-print ${dayIsToday ? 'day-today' : ''}`} style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
        <div className="day-panel-header" onClick={() => toggleDayCollapse(day.date)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)', background: dayIsToday ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              {format(parseISO(day.date), 'EEEE, MMM d, yyyy')} 
              {day.locked && <Lock size={14} style={{ marginLeft: '8px', color: 'var(--accent-red)', verticalAlign: 'middle' }} />}
            </h3>
            {isCollapsed && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Off: {fmtH(counts['off-duty'] || 0)} · Dr: {fmtH(counts['driving'] || 0)} · On: {fmtH(counts['on-duty'] || 0)}
                {preferences.showSleeper && <> · Sl: {fmtH(counts['sleeper'] || 0)}</>}
                {' '} · Dist: {totalKm}
              </div>
            )}
          </div>
          <span style={{ color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>▼</span>
        </div>
        {!isCollapsed && (
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button className="tool-btn" onClick={() => savePreset(day.grid)}><Copy size={14} /> {t('savePreset', preferences.language)}</button>
              <button className="tool-btn" onClick={() => loadPreset(idx)} disabled={day.locked}><Download size={14} /> {t('applyPreset', preferences.language)}</button>
              <button className={`tool-btn ${day.locked ? 'active' : ''}`} onClick={() => toggleDayLock(idx)} style={{ marginLeft: 'auto' }}>
                {day.locked ? <Lock size={14} style={{ color: 'var(--accent-red)' }} /> : <LockOpen size={14} />} 
                {day.locked ? t('locked', preferences.language) : t('finishDay', preferences.language)}
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div className="input-group" style={{ flex: 1, minWidth: '100%' }}>
                <label>{t('remarks', preferences.language)}</label>
                <input 
                  type="text" 
                  value={day.remarks || ''} 
                  onChange={e => updateSelectedDayField(idx, 'remarks', e.target.value)} 
                  disabled={day.locked} 
                  placeholder="..."
                />
                {day.lastEdited && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.3rem' }}>
                    {(() => {
                      const d = new Date(day.lastEdited);
                      return `Last edited: ${d.toLocaleString()}`;
                    })()}
                  </div>
                )}
              </div>

              {preferences.showSameVehicle && (
                <div className="input-group" style={{ flex: 1, minWidth: '100%' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={day.sameVehicle !== false}
                      onChange={(e) => updateSelectedDayField(idx, 'sameVehicle', e.target.checked)}
                      disabled={day.locked}
                    />
                    {t('sameVehicle', preferences.language)}
                  </label>
                  {day.sameVehicle === false && (
                    <div className="input-group" style={{ marginTop: '0.5rem' }}>
                      <label>{t('cmvPlate', preferences.language)}</label>
                      <input
                        type="text"
                        value={day.cmvPlate || ''}
                        onChange={(e) => updateSelectedDayField(idx, 'cmvPlate', e.target.value)}
                        placeholder="..."
                        disabled={day.locked}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="input-group" style={{ width: '120px' }}>
                <label>{t('startOdo', preferences.language)}</label>
                <input 
                  type="number" 
                  value={day.startOdometer || ''} 
                  onChange={e => updateSelectedDayField(idx, 'startOdometer', e.target.value)} 
                  onBlur={e => {
                    const s = Number(e.target.value);
                    const end = Number(day.endOdometer);
                    if (day.endOdometer && end < s) updateSelectedDayField(idx, 'endOdometer', s.toString());
                  }}
                  disabled={day.locked} 
                />
              </div>
              <div className="input-group" style={{ width: '120px' }}>
                <label>{t('endOdo', preferences.language)}</label>
                <input 
                  type="number" 
                  value={day.endOdometer || ''} 
                  onChange={e => updateSelectedDayField(idx, 'endOdometer', e.target.value)} 
                  onBlur={e => {
                    const end = Number(e.target.value);
                    const s = Number(day.startOdometer);
                    if (day.startOdometer && end < s) updateSelectedDayField(idx, 'endOdometer', s.toString());
                  }}
                  disabled={day.locked} 
                />
              </div>
            </div>

            <Grid 
              grid={day.grid} 
              setGrid={g => updateSelectedDayGrid(idx, g)} 
              preferences={preferences} 
              locked={day.locked} 
              highlightHour={currentHour} 
            />
            <div style={{ marginTop: '1rem' }}>
              <Totals 
                grid={day.grid} 
                preferences={preferences} 
                startOdometer={day.startOdometer} 
                endOdometer={day.endOdometer} 
                homeTerminalAddress={metadata.homeTerminalAddress}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      {(offlineReady || needRefresh || !isOnline || installPrompt || (!isStandalone && showInstallBanner)) && (
        <div className="glass-panel no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.75rem', fontSize: '0.875rem', background: needRefresh || installPrompt ? 'rgba(59, 130, 246, 0.2)' : !isOnline ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', borderColor: needRefresh || installPrompt ? 'var(--accent-blue)' : !isOnline ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          {!isOnline ? (<><WifiOff size={16} color="var(--accent-red)" /> <span>Offline</span></>) : installPrompt ? (<><Plus size={16} /> <span>Install App</span> <button onClick={handleInstallClick}>Install</button></>) : null}
          <button style={{ background: 'none', border: 'none' }} onClick={() => setShowInstallBanner(false)}>✕</button>
        </div>
      )}

      {view === 'audit' ? (
        <AuditView auditLog={auditLog} onBack={() => {
          if (auditReturnView === 'editor') {
            const today = format(new Date(), 'yyyy-MM-dd');
            setCollapsedDays(new Set(days.map(d => d.date).filter(date => date !== today)));
            setView('editor');
          } else {
            setView('dashboard');
          }
        }} />
      ) : view === 'dashboard' ? (
        <>
          <header className="header">
            <h1>Dashboard</h1>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="tool-btn" onClick={() => setIsPrefsOpen(true)}><Settings size={18} /></button>
              <div style={{ position: 'relative' }}>
                <input type="date" onChange={e => { if (e.target.value) { const [y, m, d] = e.target.value.split('-').map(Number); startNewWeek(new Date(y, m - 1, d)); e.target.value = ''; } }} style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                <button className="btn-primary"><Plus size={18} /> New Week</button>
              </div>
            </div>
          </header>
          <main style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', marginTop: '1rem' }}>
            {savedLogs.map(l => (
              <div key={l.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3>Week of {l.id}</h3><button className="tool-btn" onClick={() => handleExportDashboardPDF(l)}><Download size={18} /></button></div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleEditLog(l.id)}>Edit</button>
                  <button className="btn-primary" style={{ flex: 1, background: 'var(--accent-orange)' }} onClick={async () => { 
                    await handleEditLog(l.id); 
                    setAuditReturnView('dashboard');
                    setView('audit'); 
                  }}>Audit</button>
                  <button className="btn-primary" style={{ background: 'var(--accent-red)' }} onClick={() => handleDeleteLog(l.id)}><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </main>
        </>
      ) : (
        <>
          <header className="header no-print">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}><button className="tool-btn" onClick={() => setView('dashboard')}><ArrowLeft size={20} /></button><h1>Week of {currentId}</h1></div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="tool-btn" onClick={() => setIsPrefsOpen(true)}><Settings size={18} /></button>
              <button className="btn-primary" onClick={() => handleSave()} disabled={isSaving}><Save size={18} /> {isSaving ? 'Saved' : 'Save'}</button>
              <button className="btn-primary" onClick={handleExportPDF} style={{ background: 'var(--accent-green)' }}><Download size={18} /> PDF</button>
            </div>
          </header>
          <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
            <MetadataForm metadata={metadata} setMetadata={setMetadata} preferences={preferences} />
            
            {preferences.viewMode === 'tabs' ? (
              <>
                <div className="no-print" style={{ display: 'flex', overflowX: 'auto', gap: '0.5rem', marginBottom: '1rem' }}>
                  {days.map((d, i) => (
                    <button key={d.date} className={`tool-btn ${selectedDayIndex === i ? 'active' : ''}`} onClick={() => setSelectedDayIndex(i)} style={{ minWidth: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 1rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        {format(parseISO(d.date), 'EEE')}
                        {d.locked && <Lock size={14} color="#ef4444" />}
                      </span>
                      <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{format(parseISO(d.date), 'MMM d')}</span>
                    </button>
                  ))}
                </div>
                {days[selectedDayIndex] && renderDayPanel(days[selectedDayIndex], selectedDayIndex)}
              </>
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
        onRoadsidePDF={handleRoadsidePDF}
        onAuditView={() => { 
          setAuditReturnView('editor');
          setView('audit'); 
          setIsPrefsOpen(false); 
        }}
      />
      <ReasonModal isOpen={isReasonModalOpen} onSave={r => handleSave(r)} onCancel={() => setIsReasonModalOpen(false)} />
      <footer className="no-print" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 'auto' }}>
        Copyright &copy; 2026 SynOdos. All rights reserved.
      </footer>
    </div>
  );
}
