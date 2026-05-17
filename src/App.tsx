import { useState, useEffect } from 'react';
import { Grid } from './components/Grid';
import { Totals } from './components/Totals';
import { MetadataForm } from './components/MetadataForm';
import { Header } from './components/Header';
import { PreferencesMenu } from './components/PreferencesMenu';
import { WeeklyLog, WeeklyMetadata, Status, DayEntry, Preferences, DEFAULT_PREFS, AuditEntry } from './types';
import { saveLog, getLog, getAllLogs, deleteLog } from './utils/storage';
import { generatePDF } from './utils/pdf';
import { Download, Plus, Trash2, Lock, LockOpen, WifiOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfWeek, addDays, subDays, format, parseISO, getWeek, isToday, isBefore, startOfDay } from 'date-fns';
import { t } from './utils/i18n';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { InspectionView } from './components/InspectionView';
import { ReasonModal } from './components/ReasonModal';
import { UnlockConfirmModal } from './components/UnlockConfirmModal';

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
  const [autoLoaded, setAutoLoaded] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    return localStorage.getItem('hide-install-banner') !== 'true';
  });
  const [deleteStatuses, setDeleteStatuses] = useState<Record<string, 'idle' | 'loading' | 'confirm'>>({});
  const [pendingNav, setPendingNav] = useState<{ type: 'day' | 'view' | 'active', value: any } | null>(null);
  const [pendingReasonAction, setPendingReasonAction] = useState<(() => void) | null>(null);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [pendingUnlockIdx, setPendingUnlockIdx] = useState<number | null>(null);

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
    const weekStart = startOfWeek(today, { weekStartsOn: preferences.weekStartsOn });
    const weekId = format(weekStart, 'yyyy-MM-dd');
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
    const weekStart = startOfWeek(targetDate, { weekStartsOn: preferences.weekStartsOn });
    const weekend = addDays(weekStart, 6);
    const id = format(weekStart, 'yyyy-MM-dd');
    setCurrentId(id);
    let mStr = format(weekStart, 'MMMM');
    if (mStr !== format(weekend, 'MMMM')) mStr += ` - ${format(weekend, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(weekStart, 'yyyy'), weekNumber: getWeek(weekStart, { weekStartsOn: preferences.weekStartsOn }).toString(), cycle: preferences.defaultCycle || '7-Day', driverName: preferences.defaultDriverName || '', operatorName: preferences.defaultOperatorName || '', operatorBusinessAddress: preferences.defaultOperatorBusinessAddress || '', homeTerminalAddress: preferences.defaultHomeTerminalAddress || '', cmvPlate: preferences.defaultCmvPlate || '' };
    setMetadata(md);
    const d = createEmptyDays(weekStart);
    setDays(d);
    setAuditLog([]);
    setLastSavedLog({ id, metadata: md, days: d, auditLog: [] });

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayIdx = d.findIndex(x => x.date === todayStr);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
    setView('editor');
  };

  const startNewWeekWithToday = (today: Date) => {
    const weekStart = startOfWeek(today, { weekStartsOn: preferences.weekStartsOn });
    const weekend = addDays(weekStart, 6);
    const id = format(weekStart, 'yyyy-MM-dd');
    setCurrentId(id);
    let mStr = format(weekStart, 'MMMM');
    if (mStr !== format(weekend, 'MMMM')) mStr += ` - ${format(weekend, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(weekStart, 'yyyy'), weekNumber: getWeek(weekStart, { weekStartsOn: preferences.weekStartsOn }).toString(), cycle: preferences.defaultCycle || '7-Day', driverName: preferences.defaultDriverName || '', operatorName: preferences.defaultOperatorName || '', operatorBusinessAddress: preferences.defaultOperatorBusinessAddress || '', homeTerminalAddress: preferences.defaultHomeTerminalAddress || '', cmvPlate: preferences.defaultCmvPlate || '' };
    setMetadata(md);
    const d = createEmptyDays(weekStart);
    setDays(d);
    setAuditLog([]);
    setLastSavedLog({ id, metadata: md, days: d, auditLog: [] });
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayIdx = d.findIndex(x => x.date === todayStr);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
    setView('editor');
  };
  const navigateToActiveDaily = async () => {
    const today = startOfDay(new Date());
    const weekStart = startOfWeek(today, { weekStartsOn: preferences.weekStartsOn });
    const weekId = format(weekStart, 'yyyy-MM-dd');
    const existingLog = await getLog(weekId);

    if (existingLog) {
      setCurrentId(existingLog.id);
      setMetadata(existingLog.metadata);
      setAuditLog(existingLog.auditLog || []);
      const d = existingLog.days.map(day => ({
        ...day,
        locked: day.locked || isBefore(parseISO(day.date), today)
      }));
      setDays(d);
      setLastSavedLog({ ...existingLog, days: d });
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = d.findIndex(x => x.date === todayStr);
      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
      setView('editor');
    } else {
      startNewWeekWithToday(today);
      setView('editor');
    }
  };

  const hasUnsavedLockedChanges = () => {
    if (!lastSavedLog) return false;
    const today = startOfDay(new Date());
    return days.some((d, i) => {
      const old = lastSavedLog.days[i];
      if (!old) return false;
      const isHistorical = isBefore(parseISO(d.date), today) || old.locked;
      return isHistorical && JSON.stringify(d) !== JSON.stringify(old);
    });
  };

  const handleGlobalNavigate = (newView: 'dashboard' | 'editor' | 'audit') => {
    if (hasUnsavedLockedChanges()) {
      setPendingNav({ type: 'view', value: newView });
      setIsReasonModalOpen(true);
      return;
    }

    if (newView === 'editor') {
      navigateToActiveDaily();
    } else {
      setView(newView);
    }
  };

  const handleSavePreset = () => {
    const preset = {
      driverName: metadata.driverName,
      operatorName: metadata.operatorName,
      operatorBusinessAddress: metadata.operatorBusinessAddress,
      homeTerminalAddress: metadata.homeTerminalAddress,
      cmvPlate: metadata.cmvPlate,
      cycle: metadata.cycle,
    };
    localStorage.setItem('hos-metadata-preset', JSON.stringify(preset));
    alert('Preset saved!');
  };

  const handleApplyPreset = () => {
    const raw = localStorage.getItem('hos-metadata-preset');
    if (!raw) { alert('No preset saved yet.'); return; }
    const preset = JSON.parse(raw);
    setMetadata({ ...metadata, ...preset });
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
      
      // Update savedLogs to ensure we have the latest version in the list
      setSavedLogs(prev => prev.map(l => l.id === log.id ? log : l));

      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = d.findIndex(x => x.date === todayStr);
      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
      setView('editor');
    }
  };

  const navigateToDay = async (direction: 'prev' | 'next') => {
    if (hasUnsavedLockedChanges()) {
      setPendingNav({ type: 'day', value: direction });
      setIsReasonModalOpen(true);
      return;
    }
    
    // Auto-save current state for non-locked changes
    await handleSave();

    if (direction === 'next') {
      if (selectedDayIndex < 6) {
        setSelectedDayIndex(selectedDayIndex + 1);
      } else {
        // Cross boundary to next week
        const currentMonday = parseISO(currentId);
        const nextMonday = addDays(currentMonday, 7);
        const nextId = format(nextMonday, 'yyyy-MM-dd');

        const existing = await getLog(nextId);
        if (existing) {
          await handleEditLog(nextId);
        } else {
          startNewWeek(nextMonday);
        }
        setSelectedDayIndex(0);
      }
    } else {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(selectedDayIndex - 1);
      } else {
        // Cross boundary to prev week
        const currentMonday = parseISO(currentId);
        const prevMonday = subDays(currentMonday, 7);
        const prevId = format(prevMonday, 'yyyy-MM-dd');

        const existing = await getLog(prevId);
        if (existing) {
          await handleEditLog(prevId);
        } else {
          startNewWeek(prevMonday);
        }
        setSelectedDayIndex(6);
      }
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (deleteStatuses[id] === 'confirm') {
      await deleteLog(id);
      loadDashboard();
      const newStatuses = { ...deleteStatuses };
      delete newStatuses[id];
      setDeleteStatuses(newStatuses);
    } else {
      setDeleteStatuses(prev => ({ ...prev, [id]: 'loading' }));
      setTimeout(() => {
        setDeleteStatuses(prev => ({ ...prev, [id]: 'confirm' }));
        // Auto-reset after 5 seconds of inactivity in confirm state
        setTimeout(() => {
          setDeleteStatuses(prev => {
            if (prev[id] === 'confirm') {
              const next = { ...prev };
              delete next[id];
              return next;
            }
            return prev;
          });
        }, 5000);
      }, 1000);
    }
  };

  const getAuditDiffs = (oldLog: WeeklyLog, newLog: WeeklyLog, reason: string): AuditEntry[] => {
    const diffs: AuditEntry[] = [];
    const timestamp = new Date().toISOString();
    const today = startOfDay(new Date());

    // Only audit metadata if it's a past week or already locked? 
    // Usually metadata changes are minor, but for safety we only audit if it's not the current week's metadata
    const isCurrentWeek = newLog.id === format(startOfWeek(today, { weekStartsOn: preferences.weekStartsOn }), 'yyyy-MM-dd');

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

  const handleSave = async (reason: string = '', afterAction?: () => void) => {
    const today = startOfDay(new Date());
    const needsReason = days.some((d, i) => {
      const old = lastSavedLog?.days[i];
      return old && (isBefore(parseISO(d.date), today) || old.locked) && JSON.stringify(d) !== JSON.stringify(old);
    });
    if (needsReason && !reason) { 
      setIsReasonModalOpen(true); 
      if (afterAction) setPendingReasonAction(() => afterAction);
      return; 
    }
    setIsSaving(true);
    let newAudit = auditLog;
    if (lastSavedLog) newAudit = [...auditLog, ...getAuditDiffs(lastSavedLog, { id: currentId, metadata, days }, reason)];
    const log = { id: currentId, metadata, days, auditLog: newAudit };
    await saveLog(log);
    
    setAuditLog(newAudit);
    setLastSavedLog(log);
    setSavedLogs(prev => {
      const idx = prev.findIndex(l => l.id === log.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = log;
        return next;
      }
      return [log, ...prev].sort((a, b) => b.id.localeCompare(a.id));
    });

    setIsReasonModalOpen(false);
    setTimeout(() => setIsSaving(false), 500);

    if (afterAction) afterAction();
    else if (pendingReasonAction) {
      pendingReasonAction();
      setPendingReasonAction(null);
    }
  };

  const handleDiscardAndNavigate = () => {
    if (lastSavedLog) {
      setDays(lastSavedLog.days);
      setMetadata(lastSavedLog.metadata);
      setAuditLog(lastSavedLog.auditLog || []);
    }
    setIsReasonModalOpen(false);
    const nav = pendingNav;
    setPendingNav(null);
    if (nav) {
      if (nav.type === 'day') executeDayNav(nav.value);
      else if (nav.type === 'view') executeViewNav(nav.value);
    }
  };

  const executeDayNav = (direction: 'prev' | 'next') => {
    if (direction === 'next') {
      if (selectedDayIndex < 6) setSelectedDayIndex(selectedDayIndex + 1);
      else {
        const currentMonday = parseISO(currentId);
        const nextMonday = addDays(currentMonday, 7);
        const nextId = format(nextMonday, 'yyyy-MM-dd');
        getLog(nextId).then(existing => {
          if (existing) handleEditLog(nextId);
          else startNewWeek(nextMonday);
          setSelectedDayIndex(0);
        });
      }
    } else {
      if (selectedDayIndex > 0) setSelectedDayIndex(selectedDayIndex - 1);
      else {
        const currentMonday = parseISO(currentId);
        const prevMonday = subDays(currentMonday, 7);
        const prevId = format(prevMonday, 'yyyy-MM-dd');
        getLog(prevId).then(existing => {
          if (existing) handleEditLog(prevId);
          else startNewWeek(prevMonday);
          setSelectedDayIndex(6);
        });
      }
    }
  };

  const executeViewNav = (newView: any) => {
    if (newView === 'editor') navigateToActiveDaily();
    else setView(newView);
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
    const cLog = allLogs.find(l => l.id === format(startOfWeek(today, { weekStartsOn: preferences.weekStartsOn }), 'yyyy-MM-dd'));
    generatePDF({ id: `roadside-${todayStr}`, metadata: cLog?.metadata || DEFAULT_METADATA, days: filled }, preferences, true);
  };

  useEffect(() => {
    if (view === 'editor') document.body.classList.add('has-footer');
    else document.body.classList.remove('has-footer');
  }, [view]);

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

    if (day.locked && isPastDay) {
      setPendingUnlockIdx(idx);
      setIsUnlockModalOpen(true);
      return;
    }

    executeToggleLock(idx);
  };

  const executeToggleLock = (idx: number) => {
    setDays(prev => {
      const u = [...prev];
      u[idx] = { ...u[idx], locked: !u[idx].locked };
      return u;
    });
  };



  const renderDayPanel = (day: DayEntry, idx: number) => {
    const dayIsToday = isToday(parseISO(day.date));
    const currentHour = dayIsToday ? new Date().getHours() : -1;

    return (
      <div key={day.date} className={`glass-panel day-panel no-print ${dayIsToday ? 'day-today' : ''}`} style={{ marginBottom: '1rem', padding: '1.5rem', border: dayIsToday ? '2px solid var(--accent-blue)' : undefined }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            {day.lastEdited && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Last Edited: {format(parseISO(day.lastEdited), 'HH:mm:ss')}
              </span>
            )}
            <button className={`tool-btn ${day.locked ? 'active' : ''}`} onClick={() => toggleDayLock(idx)}>
              {day.locked ? <Lock size={14} style={{ color: 'var(--accent-red)' }} /> : <LockOpen size={14} />}
              {day.locked ? t('locked', preferences.language) : t('finishDay', preferences.language)}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: 1 }}>
            <label>{t('remarks', preferences.language)}</label>
            <input
              type="text"
              value={day.remarks || ''}
              onChange={e => updateSelectedDayField(idx, 'remarks', e.target.value)}
              disabled={day.locked}
              placeholder="..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div className="input-group" style={{ flex: 1, minWidth: 0, width: '50%' }}>
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
          <div className="input-group" style={{ flex: 1, minWidth: 0, width: '50%' }}>
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

        {preferences.showDailyTotals && (
          <div style={{ marginTop: '1.5rem' }}>
            <Totals
              grid={day.grid}
              preferences={preferences}
              startOdometer={day.startOdometer}
              endOdometer={day.endOdometer}
              homeTerminalAddress={metadata.homeTerminalAddress}
              variant="grid"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      <Header
        view={view}
        onNavigate={handleGlobalNavigate}
        onOpenPrefs={() => setIsPrefsOpen(true)}
        onSave={() => handleSave()}
        onExportPDF={handleExportPDF}
        isSaving={isSaving}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onRoadsidePDF={handleRoadsidePDF}
      />

      {(offlineReady || needRefresh || !isOnline || installPrompt || (!isStandalone && showInstallBanner)) && (
        <div className="glass-panel no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.75rem', fontSize: '0.875rem', background: needRefresh || installPrompt ? 'rgba(59, 130, 246, 0.2)' : !isOnline ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', borderColor: needRefresh || installPrompt ? 'var(--accent-blue)' : !isOnline ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          {!isOnline ? (<><WifiOff size={16} color="var(--accent-red)" /> <span>Offline</span></>) : installPrompt ? (<><Plus size={16} /> <span>Install App</span> <button onClick={handleInstallClick}>Install</button></>) : null}
          <button style={{ background: 'none', border: 'none' }} onClick={() => setShowInstallBanner(false)}>✕</button>
        </div>
      )}

      <div className="main-content">
        {view === 'audit' ? (
          <InspectionView logs={savedLogs} preferences={preferences} />
        ) : view === 'dashboard' ? (
          <>
            <main style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {(() => {
                const currentWeekId = format(startOfWeek(new Date(), { weekStartsOn: preferences.weekStartsOn }), 'yyyy-MM-dd');
                return savedLogs.map(l => {
                  const isCurrent = l.id === currentWeekId;
                  const delStatus = deleteStatuses[l.id] || 'idle';
                  
                  return (
                    <div key={l.id} className={`glass-panel ${isCurrent ? 'day-today' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: isCurrent ? '2px solid var(--accent-blue)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h3 style={{ margin: 0 }}>Week of {l.id}</h3>
                          {isCurrent && <span className="today-pill" style={{ position: 'static', padding: '2px 8px', fontSize: '0.6rem' }}>CURRENT</span>}
                        </div>
                        
                        <button 
                          className="tool-btn" 
                          style={{ 
                            padding: '0.4rem',
                            background: delStatus === 'confirm' ? 'var(--accent-red)' : 'transparent',
                            color: delStatus === 'confirm' ? 'white' : 'var(--accent-red)',
                            border: delStatus === 'confirm' ? 'none' : '1px solid rgba(239, 68, 68, 0.2)',
                            minWidth: delStatus === 'confirm' ? '80px' : '36px',
                            transition: 'all 0.2s ease',
                            borderRadius: '8px'
                          }} 
                          onClick={(e) => { e.stopPropagation(); handleDeleteLog(l.id); }}
                          disabled={delStatus === 'loading'}
                        >
                          {delStatus === 'loading' ? (
                            <div className="loading-spinner-small" style={{ width: '14px', height: '14px' }} />
                          ) : delStatus === 'confirm' ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Confirm</span>
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                        <button className="btn-primary" style={{ flex: 1.5 }} onClick={() => handleEditLog(l.id)}>
                          {isCurrent ? 'Edit' : 'View'}
                        </button>
                        
                        <button className="btn-primary" style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} onClick={() => handleExportDashboardPDF(l)}>
                          <Download size={18} /> PDF
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </main>
          </>
        ) : (
          <>
            <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <MetadataForm metadata={metadata} setMetadata={setMetadata} preferences={preferences} />

              <div className="no-print glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
                <button className="tool-btn" onClick={() => navigateToDay('prev')} style={{ padding: '0.5rem 1rem' }}>
                  <ChevronLeft size={24} />
                </button>

                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {days[selectedDayIndex] && format(parseISO(days[selectedDayIndex].date), 'EEEE, MMMM d')}
                    {days[selectedDayIndex]?.locked && <Lock size={20} color="#ef4444" />}
                  </h2>
                </div>

                <button className="tool-btn" onClick={() => navigateToDay('next')} style={{ padding: '0.5rem 1rem' }}>
                  <ChevronRight size={24} />
                </button>
              </div>

              {days[selectedDayIndex] && renderDayPanel(days[selectedDayIndex], selectedDayIndex)}
            </main>

            {days[selectedDayIndex] && (
              <footer className="fixed-totals-footer no-print" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
                  <Totals
                    grid={days[selectedDayIndex].grid}
                    preferences={preferences}
                    startOdometer={days[selectedDayIndex].startOdometer}
                    endOdometer={days[selectedDayIndex].endOdometer}
                    homeTerminalAddress={metadata.homeTerminalAddress}
                    variant="compact"
                  />
                </div>
              </footer>
            )}
          </>
        )}

        <footer className="app-footer no-print">
          Copyright &copy; 2026 SynOdos. All rights reserved.
        </footer>
      </div>
      <PreferencesMenu
        preferences={preferences}
        setPreferences={setPreferences}
        isOpen={isPrefsOpen}
        onClose={() => setIsPrefsOpen(false)}
      />
      <ReasonModal 
        isOpen={isReasonModalOpen} 
        isNavigating={!!pendingNav}
        onSave={(r) => {
          const nav = pendingNav;
          setPendingNav(null);
          handleSave(r, () => {
            if (nav) {
              if (nav.type === 'day') executeDayNav(nav.value);
              else if (nav.type === 'view') executeViewNav(nav.value);
            }
          });
        }} 
        onDiscard={pendingNav ? handleDiscardAndNavigate : undefined}
        onCancel={() => { 
          setIsReasonModalOpen(false); 
          setPendingNav(null);
          setPendingReasonAction(null); 
        }} 
      />
      <UnlockConfirmModal 
        isOpen={isUnlockModalOpen} 
        onConfirm={() => {
          if (pendingUnlockIdx !== null) executeToggleLock(pendingUnlockIdx);
          setIsUnlockModalOpen(false);
          setPendingUnlockIdx(null);
        }}
        onCancel={() => {
          setIsUnlockModalOpen(false);
          setPendingUnlockIdx(null);
        }}
      />
    </div>
  );
}
