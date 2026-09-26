import { useState, useEffect, useRef } from 'react';
import { Grid } from './components/Grid';
import { Totals } from './components/Totals';
import { MetadataForm } from './components/MetadataForm';
import { Header } from './components/Header';
import { PreferencesMenu } from './components/PreferencesMenu';
import { WeeklyLog, WeeklyMetadata, Status, DayEntry, DayVehicle, Preferences, DEFAULT_PREFS, AuditEntry, APP_VERSION } from './types';
import { saveLog, getLog, getAllLogs, deleteLog } from './utils/storage';
import { generatePDF } from './utils/pdf';
import { Download, Plus, Trash2, Lock, LockOpen, WifiOff, ChevronLeft, ChevronRight, Eye, Pencil, Coffee, Bed, Briefcase, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { startOfWeek, addDays, subDays, format, parseISO, getWeek, isToday, isBefore, startOfDay } from 'date-fns';
import { t } from './utils/i18n';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { InspectionView } from './components/InspectionView';
import { ReasonModal } from './components/ReasonModal';
import { UnlockConfirmModal } from './components/UnlockConfirmModal';
import { UserMenu } from './components/UserMenu';
import { SteeringWheel } from './components/Icons';
import { useAuth } from './lib/auth';
import { SignIn } from './components/SignIn';
import { Paywall } from './components/Paywall';
import { startCloudSync, stopCloudSync, setCloudSyncPreferences } from './utils/driveSync';
import { getActiveProvider, getActiveProviderId } from './utils/cloudProviders';
import { completeGoogleDriveHandshake } from './utils/googleDriveProvider';

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

const LAST_USED_VEHICLE_KEY = 'hos-last-used-vehicle-plate';

/** Periodic service worker update check while the app stays open. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const getLastUsedVehiclePlate = (fallback = '') =>
  localStorage.getItem(LAST_USED_VEHICLE_KEY) || fallback;

const rememberVehiclePlate = (plate: string) => {
  const normalizedPlate = plate.trim();
  if (normalizedPlate) localStorage.setItem(LAST_USED_VEHICLE_KEY, normalizedPlate);
};

const createEmptyDays = (startDate: Date, defaultPlate: string = '', defaultMetadata: WeeklyMetadata): DayEntry[] => {
  const today = startOfDay(new Date());
  const initialPlate = getLastUsedVehiclePlate(defaultPlate);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(startDate, i);
    return {
      date: format(d, 'yyyy-MM-dd'),
      grid: Array(96).fill('off-duty'),
      remarks: '',
      startOdometer: '',
      endOdometer: '',
      additionalVehicles: [],
      locked: isBefore(d, today),
      sameVehicle: true,
      cmvPlate: initialPlate,
      lastEdited: new Date().toISOString(),
      metadata: defaultMetadata,
    };
  });
};

export default function App() {
  const { session, user, loading: authLoading, signOut, authFresh, daysRemaining } = useAuth();

  // Optional cloud connection (Google Drive today). The app is fully
  // functional without it; this only enables backup + device sync. The flag
  // is maintained so other modules can read connection state cheaply.
  useEffect(() => {
    // Complete the OAuth return if we came back from Google's consent screen.
    void completeGoogleDriveHandshake().then(done => {
      if (done) localStorage.setItem('hos-drive-connected', 'true');
    });
    if (!session) return;
    let cancelled = false;
    getActiveProvider()?.isConnected().then((connected: boolean) => {
      if (!cancelled) localStorage.setItem('hos-drive-connected', connected ? 'true' : 'false');
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // --- Incoming remote preferences ---------------------------------------
  // pullRemote() writes a pulled preferences blob to localStorage under
  // 'hos-preferences-incoming' and fires 'hos-prefs-incoming'. We adopt it
  // only if it is newer than our last local save, so a stale remote blob can
  // never clobber fresher local edits.
  useEffect(() => {
    const adopt = () => {
      try {
        const raw = localStorage.getItem('hos-preferences-incoming');
        if (!raw) return;
        localStorage.removeItem('hos-preferences-incoming');
        const incoming = JSON.parse(raw);
        const localSavedAt = localStorage.getItem('hos-preferences-saved-at') || '';
        if (incoming.savedAt && incoming.savedAt <= localSavedAt) return;
        const { savedAt, ...prefs } = incoming;
        setPreferences(prev => ({
          ...DEFAULT_PREFS,
          ...prev,
          ...prefs,
          userProfile: { ...DEFAULT_PREFS.userProfile, ...(prev.userProfile || {}), ...(prefs.userProfile || {}) },
        }));
        localStorage.setItem('hos-preferences-saved-at', savedAt || new Date().toISOString());
      } catch (e) {
        console.error('[sync] failed to adopt incoming preferences', e);
      }
    };
    window.addEventListener('hos-prefs-incoming', adopt);
    return () => window.removeEventListener('hos-prefs-incoming', adopt);
  }, []);

  const [view, setView] = useState<'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences'>('dashboard');
  const [savedLogs, setSavedLogs] = useState<WeeklyLog[]>([]);

  const [preferences, setPreferences] = useState<Preferences>(() => {
    const saved = localStorage.getItem('hos-preferences');
    if (!saved) return DEFAULT_PREFS;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_PREFS,
        ...parsed,
        userProfile: {
          ...DEFAULT_PREFS.userProfile,
          ...(parsed.userProfile || {})
        }
      };
    } catch {
      return DEFAULT_PREFS;
    }
  });

  const [currentId, setCurrentId] = useState<string>('');
  const [metadata, setMetadata] = useState<WeeklyMetadata>(DEFAULT_METADATA);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [lastSavedLog, setLastSavedLog] = useState<WeeklyLog | null>(null);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [activeAutocompleteDay, setActiveAutocompleteDay] = useState<number | null>(null);
  const [activeAdditionalAutocomplete, setActiveAdditionalAutocomplete] = useState<{ dayIndex: number; vehicleIndex: number } | null>(null);
  const [pendingAdditionalDeletes, setPendingAdditionalDeletes] = useState<Record<string, boolean>>({});
  const [autoLoaded, setAutoLoaded] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    return localStorage.getItem('hide-install-banner') !== 'true';
  });
  const [deleteStatuses, setDeleteStatuses] = useState<Record<string, 'idle' | 'loading' | 'confirm'>>({});
  const [pendingNav, setPendingNav] = useState<{ type: 'day' | 'view' | 'active', value: any, tab?: 'general' | 'trucking' | 'install' | 'version' } | null>(null);
  const [prefTab, setPrefTab] = useState<'general' | 'trucking' | 'install' | 'version'>('general');
  const [pendingReasonAction, setPendingReasonAction] = useState<(() => void) | null>(null);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [pendingUnlockIdx, setPendingUnlockIdx] = useState<number | null>(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      swRegistrationRef.current = registration;
      const checkForUpdates = () => { registration.update().catch(() => {}); };
      // Refresh check on each app open / tab focus, plus a safety net while long-lived
      // tabs stay open (drivers may keep a week open for days without a reload).
      window.addEventListener('focus', checkForUpdates);
      window.addEventListener('online', checkForUpdates);
      checkForUpdates();
      const interval = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
      const stop = () => {
        window.clearInterval(interval);
        window.removeEventListener('focus', checkForUpdates);
        window.removeEventListener('online', checkForUpdates);
      };
      registration.addEventListener('updatefound', stop, { once: true });
    },
  });

  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [swDismmissed, setSwDismmissed] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'up-to-date'>('idle');
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [showUpToDateToast, setShowUpToDateToast] = useState(false);

  useEffect(() => {
    if (!needRefresh) return;
    let cancelled = false;
    fetch('version.json', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.version) setNewVersion(String(data.version)); })
      .catch(() => {}); // banner still works without a version label
    return () => { cancelled = true; };
  }, [needRefresh]);

  const handleUpdateClick = () => {
    setIsUpdating(true);
    updateServiceWorker(true); // reloads the page once the waiting worker takes over
  };

  const handleCheckForUpdates = () => {
    if (!swRegistrationRef.current || updateCheckStatus === 'checking') return;
    setUpdateCheckStatus('checking');
    swRegistrationRef.current.update().catch(() => {});
  };

  useEffect(() => {
    if (updateCheckStatus !== 'checking') return;
    const timer = window.setTimeout(() => setUpdateCheckStatus((status) => (status === 'checking' ? 'up-to-date' : status)), 3000);
    return () => window.clearTimeout(timer);
  }, [updateCheckStatus]);

  // Announce "up to date" as a transient toast once the update check resolves.
  // Closing goes through a 'closing' state so the ease fade-out can play before unmount.
  const [isToastClosing, setIsToastClosing] = useState(false);
  const closeUpToDateToast = () => {
    setIsToastClosing(true);
    window.setTimeout(() => {
      setShowUpToDateToast(false);
      setIsToastClosing(false);
    }, 250);
  };
  useEffect(() => {
    if (updateCheckStatus !== 'up-to-date') return;
    setShowUpToDateToast(true);
    setIsToastClosing(false);
    const timer = window.setTimeout(closeUpToDateToast, 4000);
    return () => window.clearTimeout(timer);
  }, [updateCheckStatus]);

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
    if (preferences.theme === 'light') {
      document.body.classList.add('light-mode');
      document.documentElement.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
      document.documentElement.classList.remove('light-mode');
    }
    localStorage.setItem('hos-preferences', JSON.stringify(preferences));
    localStorage.setItem('hos-preferences-saved-at', new Date().toISOString());
    setCloudSyncPreferences(preferences);
  }, [preferences]);

  useEffect(() => { if (view === 'dashboard' || view === 'audit') loadDashboard(); }, [view]);

  // Boot: local data always loads. The optional cloud engine only runs when
  // a provider is connected — never a gate, purely additive.
  useEffect(() => {
    if (authLoading || !session) return;
    if (!autoLoaded) {
      setAutoLoaded(true);
      autoLoadCurrentWeek();
    }
    if (getActiveProviderId()) {
      startCloudSync(preferences);
      return () => stopCloudSync();
    }
  }, [authLoading, session?.user?.id]);

  const applyLastUsedVehicle = (day: DayEntry, fallbackPlate: string) => {
    const lastUsedPlate = getLastUsedVehiclePlate();
    const currentPlate = (day.cmvPlate || '').trim().toLowerCase();
    const defaultPlate = fallbackPlate.trim().toLowerCase();
    if (lastUsedPlate && (!currentPlate || currentPlate === defaultPlate)) {
      return { ...day, cmvPlate: lastUsedPlate };
    }
    return day;
  };

  const autoLoadCurrentWeek = async () => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: preferences.weekStartsOn });
    const weekId = format(weekStart, 'yyyy-MM-dd');
    const existingLog = await getLog(weekId);
    if (existingLog) {
      setCurrentId(existingLog.id);
      setMetadata(existingLog.metadata);
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = existingLog.days.findIndex(d => d.date === todayStr);
      const loadedDays = existingLog.days.map((day, idx) =>
        idx === (todayIdx >= 0 ? todayIdx : 0)
          ? applyLastUsedVehicle(day, preferences.defaultCmvPlate || existingLog.metadata.cmvPlate || '')
          : day
      );
      setDays(loadedDays);
      setAuditLog(existingLog.auditLog || []);
      setLastSavedLog({ ...existingLog, days: loadedDays });
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
    const lastUsedPlate = getLastUsedVehiclePlate(preferences.defaultCmvPlate || '');
    const weekDefaults = { ...preferences, defaultCmvPlate: lastUsedPlate };
    let mStr = format(weekStart, 'MMMM');
    if (mStr !== format(weekend, 'MMMM')) mStr += ` - ${format(weekend, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(weekStart, 'yyyy'), weekNumber: getWeek(weekStart, { weekStartsOn: preferences.weekStartsOn }).toString(), cycle: weekDefaults.defaultCycle || '7-Day', driverName: weekDefaults.defaultDriverName || '', operatorName: weekDefaults.defaultOperatorName || '', operatorBusinessAddress: weekDefaults.defaultOperatorBusinessAddress || '', homeTerminalAddress: weekDefaults.defaultHomeTerminalAddress || '', cmvPlate: lastUsedPlate };
    setMetadata(md);
    const d = createEmptyDays(weekStart, lastUsedPlate, md);
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
    const lastUsedPlate = getLastUsedVehiclePlate(preferences.defaultCmvPlate || '');
    const weekDefaults = { ...preferences, defaultCmvPlate: lastUsedPlate };
    let mStr = format(weekStart, 'MMMM');
    if (mStr !== format(weekend, 'MMMM')) mStr += ` - ${format(weekend, 'MMMM')}`;
    const md = { ...DEFAULT_METADATA, month: mStr, year: format(weekStart, 'yyyy'), weekNumber: getWeek(weekStart, { weekStartsOn: preferences.weekStartsOn }).toString(), cycle: weekDefaults.defaultCycle || '7-Day', driverName: weekDefaults.defaultDriverName || '', operatorName: weekDefaults.defaultOperatorName || '', operatorBusinessAddress: weekDefaults.defaultOperatorBusinessAddress || '', homeTerminalAddress: weekDefaults.defaultHomeTerminalAddress || '', cmvPlate: lastUsedPlate };
    setMetadata(md);
    const d = createEmptyDays(weekStart, lastUsedPlate, md);
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
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = d.findIndex(x => x.date === todayStr);
      const loadedDays = d.map((day, idx) =>
        idx === (todayIdx >= 0 ? todayIdx : 0)
          ? applyLastUsedVehicle(day, preferences.defaultCmvPlate || existingLog.metadata.cmvPlate || '')
          : day
      );
      setDays(loadedDays);
      setLastSavedLog({ ...existingLog, days: loadedDays });
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

  const handleGlobalNavigate = (newView: 'dashboard' | 'editor' | 'audit' | 'profile' | 'preferences', tab?: 'general' | 'trucking' | 'install' | 'version') => {
    if (view === 'editor' && hasUnsavedLockedChanges() && newView !== 'editor') {
      setPendingNav({ type: 'view', value: newView, tab });
      setIsReasonModalOpen(true);
      return;
    }

    if (newView === 'editor') {
      navigateToActiveDaily();
    } else {
      setPrefTab(tab || 'general');
      setView(newView);
    }
  };

  const handleSavePreset = () => {
    const currentDayMeta = days[selectedDayIndex]?.metadata || metadata;
    const preset = {
      driverName: currentDayMeta.driverName,
      operatorName: currentDayMeta.operatorName,
      operatorBusinessAddress: currentDayMeta.operatorBusinessAddress,
      homeTerminalAddress: currentDayMeta.homeTerminalAddress,
      cmvPlate: currentDayMeta.cmvPlate,
      cycle: currentDayMeta.cycle,
    };
    localStorage.setItem('hos-metadata-preset', JSON.stringify(preset));
    alert('Preset saved!');
  };

  const handleApplyPreset = () => {
    const raw = localStorage.getItem('hos-metadata-preset');
    if (!raw) { alert('No preset saved yet.'); return; }
    const preset = JSON.parse(raw);
    // Apply preset to the selected day's metadata
    const updatedDays = days.map((d, i) =>
      i === selectedDayIndex ? { ...d, metadata: { ...d.metadata, ...preset } } : d
    );
    setDays(updatedDays);
  };

  const getLatestVehicleOdometer = (plate: string, vehicleMileage = '') => {
    const cleanPlate = plate.trim().toLowerCase();
    if (!cleanPlate) return vehicleMileage;

    const logsToSearch = lastSavedLog
      ? [...savedLogs.filter(log => log.id !== lastSavedLog.id), lastSavedLog]
      : savedLogs;
    const readings = logsToSearch.flatMap(log => log.days
      .filter(day => (day.cmvPlate || log.metadata.cmvPlate || '').trim().toLowerCase() === cleanPlate)
      .map(day => ({
        date: day.date,
        edited: day.lastEdited || '',
        value: day.endOdometer || day.startOdometer
      }))
      .filter(reading => reading.value && Number.isFinite(Number(reading.value)))
    );

    readings.sort((a, b) => a.date.localeCompare(b.date) || a.edited.localeCompare(b.edited));
    return readings.length > 0 ? readings[readings.length - 1].value : vehicleMileage;
  };

  const applyVehicleSelection = (idx: number, vehicle: { licensePlate: string; mileage: string; friendlyName?: string }) => {
    rememberVehiclePlate(vehicle.licensePlate);
    const currentDay = days[idx];
    const sameVehicle = (currentDay?.cmvPlate || '').trim().toLowerCase() === vehicle.licensePlate.trim().toLowerCase();
    updateSelectedDayField(idx, 'cmvPlate', vehicle.licensePlate);
    updateSelectedDayField(idx, 'vehicleName', vehicle.friendlyName || '');
    if (sameVehicle && currentDay?.endOdometer) {
      updateSelectedDayField(idx, 'startOdometer', currentDay.endOdometer);
      return;
    }
    if (sameVehicle && currentDay?.startOdometer) return;

    const latestOdometer = getLatestVehicleOdometer(vehicle.licensePlate, vehicle.mileage);
    if (latestOdometer) {
      updateSelectedDayField(idx, 'startOdometer', latestOdometer);
      const currentDay = days[idx];
      const end = Number(currentDay?.endOdometer);
      const start = Number(latestOdometer);
      if (!currentDay?.endOdometer || end < start) {
        updateSelectedDayField(idx, 'endOdometer', latestOdometer);
      }
    }
  };

  const handleEditLog = async (id: string) => {
    const log = await getLog(id);
    if (log) {
      setCurrentId(log.id);
      setMetadata(log.metadata);
      setAuditLog(log.auditLog || []);
      const today = startOfDay(new Date());
      // Auto-lock past days on load to ensure compliance and ensure each day has metadata
      const d = log.days.map(day => ({
        ...day,
        locked: day.locked || isBefore(parseISO(day.date), today),
        metadata: day.metadata ?? log.metadata
      }));
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIdx = d.findIndex(x => x.date === todayStr);
      const loadedDays = d.map((day, idx) =>
        idx === (todayIdx >= 0 ? todayIdx : 0)
          ? applyLastUsedVehicle(day, preferences.defaultCmvPlate || log.metadata.cmvPlate || '')
          : day
      );
      setDays(loadedDays);
      setLastSavedLog({ ...log, days: loadedDays });

      // Update savedLogs to ensure we have the latest version in the list
      setSavedLogs(prev => prev.map(l => l.id === log.id ? { ...l, days: loadedDays } : l));

      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
      setView('editor');
    }
  };

  const selectDay = (idx: number) => {
    const lastUsedPlate = getLastUsedVehiclePlate();
    if (lastUsedPlate) {
      setDays(prev => prev.map((day, dayIdx) => {
        if (dayIdx !== idx || day.cmvPlate === lastUsedPlate) return day;
        const isDefaultVehicle = !day.cmvPlate || day.cmvPlate.trim().toLowerCase() === (preferences.defaultCmvPlate || '').trim().toLowerCase();
        if (!isDefaultVehicle) return day;

        const latestOdometer = getLatestVehicleOdometer(lastUsedPlate);
        return {
          ...day,
          cmvPlate: lastUsedPlate,
          ...(latestOdometer ? {
            startOdometer: latestOdometer,
            endOdometer: !day.endOdometer || Number(day.endOdometer) < Number(latestOdometer)
              ? latestOdometer
              : day.endOdometer
          } : {})
        };
      }));
    }
    setSelectedDayIndex(idx);
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
        selectDay(selectedDayIndex + 1);
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
        selectDay(selectedDayIndex - 1);
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

  const handleSave = async (reason: string = '', afterAction?: () => void, overrideDays?: DayEntry[]) => {
    const today = startOfDay(new Date());
    const effectiveDays = overrideDays ?? days;
    const needsReason = effectiveDays.some((d, i) => {
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
    if (lastSavedLog) newAudit = [...auditLog, ...getAuditDiffs(lastSavedLog, { id: currentId, metadata, days: effectiveDays }, reason)];
    const log = { id: currentId, metadata, days: effectiveDays, auditLog: newAudit };
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
      else if (nav.type === 'view') executeViewNav(nav.value, nav.tab);
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

  const executeViewNav = (newView: any, tab?: 'general' | 'trucking' | 'install' | 'version') => {
    if (newView === 'editor') navigateToActiveDaily();
    else {
      if (tab) setPrefTab(tab);
      setView(newView);
    }
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

  const updateAdditionalVehicle = (dayIdx: number, vehicleIdx: number, field: keyof DayVehicle, value: string) => {
    setDays(prev => prev.map((day, idx) => {
      if (idx !== dayIdx) return day;
      const vehicles = [...(day.additionalVehicles || [])];
      vehicles[vehicleIdx] = { ...vehicles[vehicleIdx], [field]: value };
      if (field === 'startOdometer' && value !== '') {
        const currentEnd = Number(vehicles[vehicleIdx].endOdometer);
        if (!vehicles[vehicleIdx].endOdometer || currentEnd < Number(value)) {
          vehicles[vehicleIdx].endOdometer = value;
        }
      }
      if (field === 'endOdometer' && value !== '' && vehicleIdx < vehicles.length - 1) {
        const nextVehicle = vehicles[vehicleIdx + 1];
        const currentVehicle = vehicles[vehicleIdx];
        const sameVehicle = !nextVehicle.cmvPlate ||
          nextVehicle.cmvPlate.trim().toLowerCase() === currentVehicle.cmvPlate.trim().toLowerCase() ||
          (!!nextVehicle.friendlyName && !!currentVehicle.friendlyName && nextVehicle.friendlyName.trim().toLowerCase() === currentVehicle.friendlyName.trim().toLowerCase());
        if (sameVehicle) {
          nextVehicle.startOdometer = value;
          if (!nextVehicle.endOdometer || Number(nextVehicle.endOdometer) < Number(value)) {
            nextVehicle.endOdometer = value;
          }
        }
      }
      return { ...day, additionalVehicles: vehicles, lastEdited: new Date().toISOString() };
    }));
  };

  const addAdditionalVehicle = (dayIdx: number) => {
    setDays(prev => prev.map((day, idx) => {
      if (idx !== dayIdx) return day;
      const existingVehicles = day.additionalVehicles || [];
      return {
        ...day,
        additionalVehicles: [
          ...existingVehicles,
          { cmvPlate: '', friendlyName: '', startOdometer: '', endOdometer: '' }
        ]
      };
    }));
  };

  const removeAdditionalVehicle = (dayIdx: number, vehicleIdx: number) => {
    setDays(prev => prev.map((day, idx) => idx === dayIdx ? {
      ...day,
      additionalVehicles: (day.additionalVehicles || []).filter((_, i) => i !== vehicleIdx),
      lastEdited: new Date().toISOString()
    } : day));
  };

  const requestRemoveAdditionalVehicle = (dayIdx: number, vehicleIdx: number) => {
    const deleteKey = `${dayIdx}-${vehicleIdx}`;
    if (pendingAdditionalDeletes[deleteKey]) {
      removeAdditionalVehicle(dayIdx, vehicleIdx);
      setPendingAdditionalDeletes(current => Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${dayIdx}-`))
      ));
      return;
    }

    setPendingAdditionalDeletes(current => ({ ...current, [deleteKey]: true }));
    window.setTimeout(() => {
      setPendingAdditionalDeletes(current => {
        if (!current[deleteKey]) return current;
        const next = { ...current };
        delete next[deleteKey];
        return next;
      });
    }, 4000);
  };

  const applyAdditionalVehicleSelection = (dayIdx: number, vehicleIdx: number, vehicle: { licensePlate: string; mileage: string; friendlyName?: string }) => {
    rememberVehiclePlate(vehicle.licensePlate);
    const currentVehicle = days[dayIdx]?.additionalVehicles?.[vehicleIdx];
    const sameVehicle = (currentVehicle?.cmvPlate || '').trim().toLowerCase() === vehicle.licensePlate.trim().toLowerCase();
    updateAdditionalVehicle(dayIdx, vehicleIdx, 'cmvPlate', vehicle.licensePlate);
    updateAdditionalVehicle(dayIdx, vehicleIdx, 'friendlyName', vehicle.friendlyName || '');
    const day = days[dayIdx];
    const previousEnd = [
      { cmvPlate: day?.cmvPlate, endOdometer: day?.endOdometer },
      ...(day?.additionalVehicles || []).slice(0, vehicleIdx)
    ].reverse().find(previous =>
      (previous.cmvPlate || '').trim().toLowerCase() === vehicle.licensePlate.trim().toLowerCase() && previous.endOdometer
    )?.endOdometer;

    if (previousEnd) {
      updateAdditionalVehicle(dayIdx, vehicleIdx, 'startOdometer', previousEnd);
      updateAdditionalVehicle(dayIdx, vehicleIdx, 'endOdometer', previousEnd);
      return;
    }
    if (sameVehicle && currentVehicle?.endOdometer) {
      updateAdditionalVehicle(dayIdx, vehicleIdx, 'startOdometer', currentVehicle.endOdometer);
      return;
    }
    if (sameVehicle && currentVehicle?.startOdometer) return;

    const latestOdometer = getLatestVehicleOdometer(vehicle.licensePlate, vehicle.mileage);
    if (latestOdometer) {
      updateAdditionalVehicle(dayIdx, vehicleIdx, 'startOdometer', latestOdometer);
      updateAdditionalVehicle(dayIdx, vehicleIdx, 'endOdometer', latestOdometer);
    }
  };

  useEffect(() => {
    if (days.length === 0) return;

    const normalizedDays = days.map(day => {
      let previousPlate = (day.cmvPlate || '').trim().toLowerCase();
      let previousName = (day.vehicleName || '').trim().toLowerCase();
      let previousEnd = day.endOdometer;
      let changed = false;
      const additionalVehicles = (day.additionalVehicles || []).map(vehicle => {
        const plate = vehicle.cmvPlate.trim().toLowerCase();
        const name = (vehicle.friendlyName || '').trim().toLowerCase();
        const sameVehicle = plate && (plate === previousPlate || (!!name && !!previousName && name === previousName));
        const nextVehicle = { ...vehicle };
        if (sameVehicle && previousEnd) {
          if (nextVehicle.startOdometer !== previousEnd) {
            nextVehicle.startOdometer = previousEnd;
            changed = true;
          }
          if (!nextVehicle.endOdometer || Number(nextVehicle.endOdometer) < Number(previousEnd)) {
            nextVehicle.endOdometer = previousEnd;
            changed = true;
          }
        }
        if (plate || name) {
          previousPlate = plate;
          previousName = name;
          previousEnd = nextVehicle.endOdometer;
        }
        return nextVehicle;
      });
      return changed ? { ...day, additionalVehicles } : day;
    });

    if (normalizedDays.some((day, index) => day !== days[index])) {
      setDays(normalizedDays);
    }
  }, [days]);

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
      if (field === 'startOdometer' && value !== '') {
        const currentEnd = Number(updated[idx].endOdometer);
        if (!updated[idx].endOdometer || currentEnd < Number(value)) {
          updated[idx].endOdometer = value;
        }
      }
      if (field === 'endOdometer') {
        const currentDay = updated[idx];
        const firstAdditional = currentDay.additionalVehicles?.[0];
        const sameVehicle = firstAdditional && (
          firstAdditional.cmvPlate.trim().toLowerCase() === (currentDay.cmvPlate || '').trim().toLowerCase() ||
          (!!firstAdditional.friendlyName && !!currentDay.vehicleName && firstAdditional.friendlyName.trim().toLowerCase() === currentDay.vehicleName.trim().toLowerCase())
        );
        if (sameVehicle) {
          firstAdditional.startOdometer = value;
          if (!firstAdditional.endOdometer || Number(firstAdditional.endOdometer) < Number(value)) {
            firstAdditional.endOdometer = value;
          }
        }

        if (idx < 6) {
          const next = updated[idx + 1];
          if (next.sameVehicle !== false && !next.locked) updated[idx + 1] = { ...next, startOdometer: value };
        }
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

    // "Finish Day" on a past day is a record-keeping event: apply the lock and
    // save immediately so the past-day edit-reason window (audit trail) runs.
    if (isPastDay) {
      const lockedDays = days.map((d, i) => (i === idx ? { ...d, locked: true } : d));
      setDays(lockedDays);
      handleSave('', undefined, lockedDays);
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
        </div>        <div className="input-group" style={{ marginBottom: '1.5rem' }}>
          <label>{t('remarks', preferences.language)}</label>
          <textarea
            value={day.remarks || ''}
            onChange={e => updateSelectedDayField(idx, 'remarks', e.target.value)}
            disabled={day.locked}
            placeholder="..."
            rows={2}
          />
        </div>

        <div className="vehicle-entry-group" style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: 2, minWidth: '220px', position: 'relative' }}>
              <label>{day.vehicleName ? 'Vehicle' : 'CMV Plate'}</label>
              <input
                type="text"
                aria-label={day.vehicleName ? 'Vehicle' : 'CMV Plate'}
                value={day.vehicleName ? `${day.vehicleName} (${day.cmvPlate})` : (day.cmvPlate || '')}
                onChange={e => {
                  const val = e.target.value;
                  if (day.vehicleName) updateSelectedDayField(idx, 'vehicleName', '');
                  updateSelectedDayField(idx, 'cmvPlate', val);
                  setActiveAutocompleteDay(idx);
                  const matchingVehicle = (preferences.userProfile?.vehicles || []).find(
                    v => v.licensePlate.trim().toLowerCase() === val.trim().toLowerCase()
                  );
                if (matchingVehicle && (day.cmvPlate || '').trim().toLowerCase() !== matchingVehicle.licensePlate.trim().toLowerCase()) {
                  rememberVehiclePlate(matchingVehicle.licensePlate);
                  const latestOdometer = getLatestVehicleOdometer(matchingVehicle.licensePlate, matchingVehicle.mileage);
                    if (latestOdometer) {
                      updateSelectedDayField(idx, 'startOdometer', latestOdometer);
                      const end = Number(day.endOdometer);
                      if (!day.endOdometer || end < Number(latestOdometer)) {
                        updateSelectedDayField(idx, 'endOdometer', latestOdometer);
                      }
                    }
                  }
                }}
                onFocus={() => {
                  if (day.vehicleName) updateSelectedDayField(idx, 'vehicleName', '');
                  setActiveAutocompleteDay(idx);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setActiveAutocompleteDay(null);
                    const newPlate = (day.cmvPlate || '').trim();
                    if (newPlate) {
                      rememberVehiclePlate(newPlate);
                      const exists = (preferences.userProfile?.vehicles || []).some(v => v.licensePlate.trim().toLowerCase() === newPlate.toLowerCase());
                      if (!exists) {
                        const newVehicle = {
                          id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                          friendlyName: format(new Date(), 'yyyy/MM/dd-HH:mm'),
                          licensePlate: newPlate,
                          mileage: day.startOdometer || day.endOdometer || '',
                          vin: '', operatorName: preferences.defaultOperatorName || '', inspectionDate: ''
                        };
                        setPreferences(prev => ({
                          ...prev,
                          userProfile: { ...(prev.userProfile || DEFAULT_PREFS.userProfile), vehicles: [...(prev.userProfile?.vehicles || []), newVehicle] }
                        }));
                      }
                    }
                  }, 200);
                }}
                disabled={day.locked}
                placeholder="CMV Plate"
                style={{ width: '100%' }}
              />
              {activeAutocompleteDay === idx && (preferences.userProfile?.vehicles || []).length > 0 && (
                <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                  {(preferences.userProfile?.vehicles || []).filter(v => {
                    const search = (day.cmvPlate || '').trim().toLowerCase();
                    return !search || v.licensePlate.toLowerCase().includes(search) || v.friendlyName.toLowerCase().includes(search);
                  }).map(v => (
                    <div key={v.id} onClick={() => { applyVehicleSelection(idx, v); setActiveAutocompleteDay(null); }} style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-primary)', textAlign: 'left' }} className="autocomplete-option">
                      {v.friendlyName ? `${v.friendlyName} (${v.licensePlate})` : v.licensePlate}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
              <label>{t('startOdo', preferences.language)}</label>
              <input type="number" aria-label={t('startOdo', preferences.language)} value={day.startOdometer || ''} onChange={e => updateSelectedDayField(idx, 'startOdometer', e.target.value)} disabled={day.locked} />
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
              <label>{t('endOdo', preferences.language)}</label>
              <input type="number" aria-label={t('endOdo', preferences.language)} value={day.endOdometer || ''} onChange={e => updateSelectedDayField(idx, 'endOdometer', e.target.value)} disabled={day.locked} />
            </div>
          </div>
        </div>

        {(day.additionalVehicles || []).map((vehicle, vehicleIdx) => (
          <div className="additional-vehicle-entry" key={`${day.date}-vehicle-${vehicleIdx}`}>
              <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 1 }}>
                <button
                  type="button"
                  className={`icon-btn ${pendingAdditionalDeletes[`${idx}-${vehicleIdx}`] ? 'delete-confirm' : ''}`}
                  onClick={() => requestRemoveAdditionalVehicle(idx, vehicleIdx)}
                  disabled={day.locked}
                  title={pendingAdditionalDeletes[`${idx}-${vehicleIdx}`] ? 'Click again to confirm removal' : 'Remove vehicle'}
                >
                  {pendingAdditionalDeletes[`${idx}-${vehicleIdx}`] ? <Trash2 size={15} /> : <X size={15} />}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 2, minWidth: '220px', position: 'relative' }}>
                  <label>{vehicle.friendlyName ? 'Vehicle' : 'CMV Plate'}</label>
                  <input
                    type="text"
                    aria-label={vehicle.friendlyName ? 'Vehicle' : 'CMV Plate'}
                    value={vehicle.friendlyName ? `${vehicle.friendlyName} (${vehicle.cmvPlate})` : vehicle.cmvPlate}
                    onChange={e => {
                      const value = e.target.value;
                      if (vehicle.friendlyName) updateAdditionalVehicle(idx, vehicleIdx, 'friendlyName', '');
                      updateAdditionalVehicle(idx, vehicleIdx, 'cmvPlate', value);
                      setActiveAdditionalAutocomplete({ dayIndex: idx, vehicleIndex: vehicleIdx });
                      const matchingVehicle = (preferences.userProfile?.vehicles || []).find(v => v.licensePlate.trim().toLowerCase() === value.trim().toLowerCase());
                      if (matchingVehicle) applyAdditionalVehicleSelection(idx, vehicleIdx, matchingVehicle);
                    }}
                    onFocus={() => {
                      if (vehicle.friendlyName) updateAdditionalVehicle(idx, vehicleIdx, 'friendlyName', '');
                      setActiveAdditionalAutocomplete({ dayIndex: idx, vehicleIndex: vehicleIdx });
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setActiveAdditionalAutocomplete(null);
                        const plate = vehicle.cmvPlate.trim();
                        if (!plate) return;
                        rememberVehiclePlate(plate);
                        const exists = (preferences.userProfile?.vehicles || []).some(v => v.licensePlate.trim().toLowerCase() === plate.toLowerCase());
                        if (!exists) {
                          const newVehicle = {
                            id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            friendlyName: format(new Date(), 'yyyy/MM/dd-HH:mm'),
                            licensePlate: plate,
                            mileage: vehicle.startOdometer || vehicle.endOdometer || '',
                            vin: '', operatorName: preferences.defaultOperatorName || '', inspectionDate: ''
                          };
                          setPreferences(prev => ({
                            ...prev,
                            userProfile: { ...(prev.userProfile || DEFAULT_PREFS.userProfile), vehicles: [...(prev.userProfile?.vehicles || []), newVehicle] }
                          }));
                        }
                      }, 200);
                    }}
                    disabled={day.locked}
                  />
                  {activeAdditionalAutocomplete?.dayIndex === idx && activeAdditionalAutocomplete.vehicleIndex === vehicleIdx && (preferences.userProfile?.vehicles || []).length > 0 && (
                    <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                      {(preferences.userProfile?.vehicles || []).filter(v => {
                        const search = vehicle.cmvPlate.trim().toLowerCase();
                        return !search || v.licensePlate.toLowerCase().includes(search) || v.friendlyName.toLowerCase().includes(search);
                      }).map(v => (
                        <div key={v.id} onMouseDown={e => e.preventDefault()} onClick={() => { applyAdditionalVehicleSelection(idx, vehicleIdx, v); setActiveAdditionalAutocomplete(null); }} style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-primary)', textAlign: 'left' }} className="autocomplete-option">
                          {v.friendlyName ? `${v.friendlyName} (${v.licensePlate})` : v.licensePlate}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
                  <label>{t('startOdo', preferences.language)}</label>
                  <input type="number" aria-label={`${t('startOdo', preferences.language)} - vehicle ${idx + 2}`} value={vehicle.startOdometer} onChange={e => updateAdditionalVehicle(idx, vehicleIdx, 'startOdometer', e.target.value)} disabled={day.locked} />
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
                  <label>{t('endOdo', preferences.language)}</label>
                  <input type="number" aria-label={`${t('endOdo', preferences.language)} - vehicle ${idx + 2}`} value={vehicle.endOdometer} onChange={e => updateAdditionalVehicle(idx, vehicleIdx, 'endOdometer', e.target.value)} disabled={day.locked} />
                </div>
            </div>
          </div>
        ))}

        {preferences.showSameVehicle && (
          <button type="button" className="add-vehicle-btn" onClick={() => addAdditionalVehicle(idx)} disabled={day.locked}>
            <Plus size={16} /> Add another vehicle
          </button>
        )}

        <Grid
          grid={day.grid}
          setGrid={g => updateSelectedDayGrid(idx, g)}
          preferences={preferences}
          locked={day.locked}
          highlightHour={currentHour}
          date={day.date}
        />

        {preferences.showDailyTotals && (
          <div style={{ marginTop: '1.5rem' }}>
            <Totals
              grid={day.grid}
              preferences={preferences}
              startOdometer={day.startOdometer}
              endOdometer={day.endOdometer}
              additionalVehicles={day.additionalVehicles}
              homeTerminalAddress={metadata.homeTerminalAddress}
              variant="grid"
            />
          </div>
        )}
      </div>
    );
  };

  // --- Auth gate ---------------------------------------------------------
  // While the persisted session is restoring, show nothing (avoids flashing
  // the sign-in screen for an already signed-in driver). Once resolved:
  // signed-out renders the SignIn screen; signed-in renders the full app.
  if (authLoading || session === undefined) {
    return (
      <div className="app-container" style={{ minHeight: '100dvh' }} />
    );
  }
  if (!session) {
    return <SignIn />;
  }
  // Offline grace window lapsed: require one online re-validation. Renewal
  // includes the subscription entitlement check — an inactive plan lands on
  // the paywall instead of resuming the app.
  if (!authFresh) {
    return <Paywall />;
  }

  const accountEmail = user?.email || '';

  return (
    <div className="app-container">
      <Header
        view={view}
        onNavigate={handleGlobalNavigate}
        onSave={() => handleSave()}
        onExportPDF={handleExportPDF}
        isSaving={isSaving}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onRoadsidePDF={handleRoadsidePDF}
        accountEmail={accountEmail}
        onSignOut={signOut}
        daysRemaining={daysRemaining}
      />

      <div className="main-content">
        {((needRefresh && !swDismmissed) || !isOnline || (installPrompt && showInstallBanner)) && (
          <div className="glass-panel no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.75rem', fontSize: '0.875rem', background: needRefresh || (installPrompt && showInstallBanner) ? 'rgba(59, 130, 246, 0.2)' : !isOnline ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', borderColor: needRefresh || (installPrompt && showInstallBanner) ? 'var(--accent-blue)' : !isOnline ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            {!isOnline ? (<><WifiOff size={16} color="var(--accent-red)" /> <span>Offline</span></>)
              : needRefresh ? (<>
                <RefreshCw size={16} />
                <span>{isUpdating ? 'Updating…' : newVersion && newVersion !== APP_VERSION ? `Update to v${newVersion} available` : 'A new version is available'}</span>
                <button className="btn-primary" onClick={handleUpdateClick} disabled={isUpdating} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}>{isUpdating ? 'Updating…' : 'Update now'}</button>
              </>)
              : (installPrompt && showInstallBanner) ? (<><Plus size={16} /> <span>Install App</span> <button className="btn-primary" onClick={handleInstallClick} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}>Install</button></>) : null}
            <button className="close-btn" aria-label="Dismiss" onClick={() => { if (needRefresh) { setSwDismmissed(true); } else { setShowInstallBanner(false); localStorage.setItem('hide-install-banner', 'true'); } }}><X size={14} /></button>
          </div>
        )}

        {view === 'preferences' ? (
          <PreferencesMenu
            preferences={preferences}
            setPreferences={setPreferences}
            onClose={() => setView('dashboard')}
            installPrompt={installPrompt}
            isStandalone={isStandalone}
            onInstall={handleInstallClick}
            initialTab={prefTab}
            onCheckForUpdates={handleCheckForUpdates}
            updateCheckStatus={updateCheckStatus}
          />
        ) : view === 'profile' ? (
          <UserMenu
            preferences={preferences}
            setPreferences={setPreferences}
            onClose={() => setView('dashboard')}
            logs={savedLogs}
          />
        ) : view === 'audit' ? (
          <main aria-label="Inspection">
            <InspectionView logs={savedLogs} preferences={preferences} />
          </main>
        ) : view === 'dashboard' ? (
          <main aria-label="Dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {(() => {
                const currentWeekId = format(startOfWeek(new Date(), { weekStartsOn: preferences.weekStartsOn }), 'yyyy-MM-dd');
                
                // Group logs by month MMMM yyyy
                const groups: Record<string, WeeklyLog[]> = {};
                savedLogs.forEach(l => {
                  try {
                    const date = parseISO(l.id);
                    const key = format(date, 'MMMM yyyy');
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(l);
                  } catch (e) {
                    const key = 'Other Logs';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(l);
                  }
                });

                // Sort group keys in reverse chronological order
                const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
                  if (a === 'Other Logs') return 1;
                  if (b === 'Other Logs') return -1;
                  const idA = groups[a][0].id;
                  const idB = groups[b][0].id;
                  return idB.localeCompare(idA);
                });

                return sortedGroupKeys.map(month => (
                  <div key={month} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', margin: '0.5rem 0 0.5rem 0', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', fontWeight: 600 }}>
                      {month}
                    </h2>
                    <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }} aria-label={`${month} logs`}>
                      {groups[month].map(l => {
                        const isCurrent = l.id === currentWeekId;
                        const delStatus = deleteStatuses[l.id] || 'idle';

                        // Calculate weekly totals
                        let totalOff = 0;
                        let totalSb = 0;
                        let totalD = 0;
                        let totalOn = 0;

                        if (l.days) {
                          l.days.forEach(d => {
                            if (d.grid) {
                              d.grid.forEach(s => {
                                if (s === 'off-duty') totalOff += 0.25;
                                else if (s === 'sleeper') totalSb += 0.25;
                                else if (s === 'driving') totalD += 0.25;
                                else if (s === 'on-duty') totalOn += 0.25;
                              });
                            }
                          });
                        }

                        return (
                          <div 
                            key={l.id} 
                            className={`glass-panel dashboard-card ${isCurrent ? 'day-today' : ''}`} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '1rem', 
                              border: isCurrent ? '2px solid var(--accent-blue)' : undefined,
                              padding: '1.25rem'
                            }}
                            onClick={() => handleEditLog(l.id)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {l.id}
                                  {isCurrent ? (
                                    <span title="Active Week (Edit)" style={{ display: 'inline-flex' }}>
                                      <Pencil size={15} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                                    </span>
                                  ) : (
                                    <span title="Completed Week (View)" style={{ display: 'inline-flex' }}>
                                      <Eye size={15} color="var(--text-secondary)" style={{ flexShrink: 0, opacity: 0.7 }} />
                                    </span>
                                  )}
                                </h3>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <button
                                  className="tool-btn"
                                  style={{
                                    padding: '0.4rem',
                                    background: delStatus === 'confirm' ? 'var(--accent-red)' : 'transparent',
                                    color: delStatus === 'confirm' ? 'white' : 'var(--accent-red)',
                                    border: delStatus === 'confirm' ? 'none' : '1px solid rgba(239, 68, 68, 0.2)',
                                    minWidth: delStatus === 'confirm' ? '70px' : '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    borderRadius: '8px'
                                  }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteLog(l.id); }}
                                  disabled={delStatus === 'loading'}
                                  title="Delete Log"
                                >
                                  {delStatus === 'loading' ? (
                                    <div className="loading-spinner-small" style={{ width: '12px', height: '12px' }} />
                                  ) : delStatus === 'confirm' ? (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Confirm</span>
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </button>

                                <button
                                  className="tool-btn"
                                  style={{
                                    padding: '0.4rem',
                                    background: 'transparent',
                                    color: 'var(--accent-blue)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onClick={(e) => { e.stopPropagation(); handleExportDashboardPDF(l); }}
                                  title="Export PDF"
                                >
                                  <Download size={14} />
                                </button>
                              </div>
                            </div>
                            
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-around', 
                              alignItems: 'center',
                              gap: '0.5rem', 
                              background: 'transparent', 
                              padding: '0.75rem 0 0 0', 
                              borderTop: '1px solid var(--glass-border)',
                              marginTop: '0.25rem',
                              fontSize: '0.85rem',
                              fontWeight: 700
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)' }} title="Driving">
                                <SteeringWheel size={14} /> <span>{totalD.toFixed(1)}h</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-on-duty)' }} title="On Duty">
                                <Briefcase size={14} /> <span>{totalOn.toFixed(1)}h</span>
                              </div>
                              {preferences.showSleeper && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-sleeper)' }} title="Sleeper Berth">
                                  <Bed size={14} /> <span>{totalSb.toFixed(1)}h</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-off-duty)' }} title="Off Duty">
                                <Coffee size={14} /> <span>{totalOff.toFixed(1)}h</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  </div>
                ));
              })()}
            </main>
        ) : (
          <>
            <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <MetadataForm
      metadata={days[selectedDayIndex]?.metadata || metadata || DEFAULT_METADATA}
      setMetadata={(newMeta) => {
        setMetadata(newMeta);
        const updatedDays = days.map((d, i) =>
          i === selectedDayIndex ? { ...d, metadata: newMeta } : d
        );
        setDays(updatedDays);
      }}
      preferences={preferences}
    />

              <div className="no-print glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
                <button className="tool-btn" onClick={() => navigateToDay('prev')} aria-label="Previous day" style={{ padding: '0.5rem 1rem' }}>
                  <ChevronLeft size={24} />
                </button>

                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {days[selectedDayIndex] && format(parseISO(days[selectedDayIndex].date), 'EEEE, MMMM d')}
                    {days[selectedDayIndex]?.locked && <Lock size={20} color="#ef4444" />}
                  </h2>
                </div>

                <button className="tool-btn" onClick={() => navigateToDay('next')} aria-label="Next day" style={{ padding: '0.5rem 1rem' }}>
                  <ChevronRight size={24} />
                </button>
              </div>

              {days[selectedDayIndex] && renderDayPanel(days[selectedDayIndex], selectedDayIndex)}
            </main>

            {days[selectedDayIndex] && (
              <div className="fixed-totals-footer no-print" role="region" aria-label="Daily totals" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
                  <Totals
                    grid={days[selectedDayIndex].grid}
                    preferences={preferences}
                    startOdometer={days[selectedDayIndex].startOdometer}
                    endOdometer={days[selectedDayIndex].endOdometer}
                    additionalVehicles={days[selectedDayIndex].additionalVehicles}
                    homeTerminalAddress={metadata.homeTerminalAddress}
                    variant="compact"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <footer className="app-footer no-print">
          Copyright &copy; 2026 SynOdos | <span 
            style={{ cursor: 'pointer', textDecoration: 'underline' }} 
            onClick={() => handleGlobalNavigate('preferences', 'version')}
          >
            v{APP_VERSION}
          </span>
        </footer>
      </div>
      {showUpToDateToast && (
        <div role="status" aria-live="polite" className="glass-panel no-print" style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 5000, width: 'min(420px, calc(100vw - 2rem))', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.25rem', borderRadius: '16px', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)', backgroundImage: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-green) 14%, transparent), transparent 55%)', border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)', animation: isToastClosing ? 'toast-out 0.25s ease-in forwards' : 'toast-in 0.25s ease-out' }}>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-green)', marginTop: '0.125rem' }}>
            <CheckCircle2 size={16} color="#fff" />
          </span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
            You're on the latest version (v{APP_VERSION})
          </span>
          <button className="close-btn" aria-label="Dismiss" onClick={closeUpToDateToast} style={{ flexShrink: 0, marginTop: '0.125rem' }}>
            <X size={16} />
          </button>
          {!isToastClosing && (
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, height: '3px', width: '100%', borderRadius: '0 0 16px 16px', background: 'var(--accent-green)', opacity: 0.6, transformOrigin: 'left', animation: 'toast-timer 4s linear forwards' }} />
          )}
        </div>
      )}
      <ReasonModal
        isOpen={isReasonModalOpen}
        isNavigating={!!pendingNav}
        onSave={(r) => {
          const nav = pendingNav;
          setPendingNav(null);
          handleSave(r, () => {
            if (nav) {
              if (nav.type === 'day') executeDayNav(nav.value);
              else if (nav.type === 'view') executeViewNav(nav.value, nav.tab);
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
