import React, { useState, useRef } from 'react';
import { Preferences, VehicleProfile, OperatorCompany, WeeklyLog } from '../types';
import { Save, Plus, Trash2, Pencil, X, Cloud, Lock, CheckCircle, AlertCircle, User, Truck, Building2, ShieldCheck, Clock, RefreshCw, KeyRound, Activity } from 'lucide-react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { uploadToGoogleDrive, downloadFromGoogleDrive, encryptData, decryptData } from '../utils/cloudSync';
import { saveLogsBulk } from '../utils/storage';
import { useDragScroll } from '../lib/useDragScroll';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../lib/useSyncStatus';
import { syncNow } from '../utils/driveSync';
import { getActiveProvider, setActiveProviderId, type CloudProvider } from '../utils/cloudProviders';
import { googleDriveProvider, DRIVE_HANDSHAKE_ERROR_KEY } from '../utils/googleDriveProvider';
import { useT, type TranslationKey } from '../utils/i18n';
import { getDriveHealth, type DriveHealth } from '../utils/driveStore';
import { formatDateIso, formatDateTimeIso } from '../utils/formatDate';

interface UserMenuProps {
  preferences: Preferences;
  setPreferences: React.Dispatch<React.SetStateAction<Preferences>>;
  onClose: () => void;
  logs?: WeeklyLog[];
}

// [stored English value, translation key]. The stored value is persisted in the
// driver profile, so it must never change — only the displayed label is localized.
const OCCUPATIONS: ReadonlyArray<readonly [string, TranslationKey]> = [
  ['Bus Driver', 'occBusDriver'],
  ['School Bus Driver', 'occSchoolBusDriver'],
  ['Truck Driver', 'occTruckDriver'],
  ['Delivery Driver', 'occDeliveryDriver'],
  ['Ridesharing Driver', 'occRidesharingDriver'],
  ['Taxi Driver', 'occTaxiDriver'],
  ['Chauffeur', 'occChauffeur'],
  ['Courier', 'occCourier'],
  ['Heavy Equipment Operator', 'occHeavyEquipment'],
] as const;

const TABS = [
  { id: 'account', label: 'tabAccount', icon: ShieldCheck },
  { id: 'personal', label: 'tabPersonal', icon: User },
  { id: 'vehicles', label: 'tabMyVehicles', icon: Truck },
  { id: 'companies', label: 'tabCompanies', icon: Building2 },
] as const;

export const UserMenu: React.FC<UserMenuProps> = ({ preferences, setPreferences, onClose, logs = [] }) => {
  const { user, daysRemaining, validateSession } = useAuth();
  const t = useT();
  const { state: syncState, message: syncErrorMessage, online, lastSyncedAt } = useSyncStatus();
  const [syncingNow, setSyncingNow] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState(false);
  const [syncNowMsg, setSyncNowMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<DriveHealth | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const provider: CloudProvider | null = getActiveProvider();

  const refreshHealth = async () => {
    // Offline: the Drive API is unreachable; a doomed fetch would report a
    // fake "not connected" state. Leave any cached health data on screen.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setHealthBusy(true);
    try {
      const h = await getDriveHealth();
      setHealth(h);
    } catch (e) {
      console.error('[drive] health check failed', e);
      setHealth({ connected: false, weeksStored: 0, bytesUsed: 0, indexOk: false, prefsOk: false });
    } finally {
      setHealthBusy(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncingNow) return;
    setSyncNowMsg(null);
    setSyncingNow(true);
    const res = await syncNow();
    setSyncingNow(false);
    setSyncNowMsg(res.ok ? t('upToDateShort') : (res.error || t('syncFailedShort')));
    if (res.ok) window.setTimeout(() => setSyncNowMsg(null), 4000);
  };

  const handleConnectProvider = async (p: CloudProvider) => {
    setSyncNowMsg(null);
    setConnectingProvider(true);
    try {
      // Redirects to Google consent; comes back with ?code=... and the
      // handshake (which itself sets the active provider on success) runs
      // in App.tsx. Nothing is marked connected until the broker exchange
      // succeeds — a failed consent must not leave the card saying "On".
      await p.connect();
    } catch (e) {
      console.error('[cloud] connect failed', e);
      setSyncNowMsg(
        e instanceof Error ? e.message : t('couldNotStartSignIn')
      );
    } finally {
      setConnectingProvider(false);
    }
  };

  const handleDisconnectProvider = async (p: CloudProvider) => {
    await p.disconnect();
    setActiveProviderId(null);
    setVerifiedConnected(false);
    setSyncNowMsg(`${p.label} ${t('providerDisconnected')}`);
  };

  const handleRevalidate = async () => {
    setSyncNowMsg(null);
    setSyncingNow(true);
    const res = await validateSession();
    setSyncingNow(false);
    setSyncNowMsg(res.ok ? t('sessionRenewed') : (res.error || t('couldNotReachServer')));
    if (res.ok) window.setTimeout(() => setSyncNowMsg(null), 4000);
  };

  const fmtDateTime = (iso: string) => {
    if (!iso) return '—';
    return formatDateTimeIso(iso);
  };

  const daysUntil = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  };

  const credentials = [
    { label: t('credDriverLicense'), expiry: preferences.userProfile?.licenseExpiry },
    { label: t('credMedicalExam'), expiry: preferences.userProfile?.medicalExpiry },
    { label: t('credFirstAid'), expiry: preferences.userProfile?.firstAidExpiry },
  ]
    .map(c => ({ ...c, days: daysUntil(c.expiry || '') }))
    .filter(c => c.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const [activeTab, setActiveTab] = useState<'account' | 'personal' | 'vehicles' | 'companies'>('account');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [pendingSyncAction, setPendingSyncAction] = useState<'backup' | 'restore' | null>(null);

  // Refresh the Drive health card whenever the Account tab is shown.
  // Offline the refresh is a no-op (see refreshHealth), so skip the await.
  React.useEffect(() => {
    if (activeTab === 'account' && provider && navigator.onLine) void refreshHealth();
  }, [activeTab, provider]);

  // Server-verified connection state. "On" must mean the token broker
  // actually holds Google tokens for this user — not that a button was once
  // clicked. Verified when the Account tab opens and whenever the selected
  // provider changes (e.g. right after the OAuth return handshake).
  const [verifiedConnected, setVerifiedConnected] = useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setVerifiedConnected(null);
    if (!provider) {
      setVerifiedConnected(false);
      return;
    }
    if (!navigator.onLine) {
      // Offline: cannot verify with the server. Trust the local connection
      // flag so the card shows "Offline" (not a false "Not connected"),
      // and re-verify the moment connectivity returns.
      setVerifiedConnected(localStorage.getItem('hos-drive-connected') === 'true');
      return;
    }
    provider.isConnected()
      .then((ok: boolean) => { if (!cancelled) setVerifiedConnected(ok); })
      .catch(() => { if (!cancelled) setVerifiedConnected(false); });
    return () => { cancelled = true; };
  }, [provider, activeTab, online]);

  // Show an OAuth-return failure (consent declined, exchange error, …) once.
  const [handshakeError, setHandshakeError] = useState<string | null>(null);
  React.useEffect(() => {
    const stored = localStorage.getItem(DRIVE_HANDSHAKE_ERROR_KEY);
    if (stored) {
      setHandshakeError(stored);
      localStorage.removeItem(DRIVE_HANDSHAKE_ERROR_KEY);
    }
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    onSuccess: async (tokenResponse) => {
      const freshToken = tokenResponse.access_token;
      const nextPrefs = { 
        ...preferences, 
        cloudSyncToken: freshToken, 
        cloudSyncEnabled: true 
      };
      setPreferences(nextPrefs);
      setSyncStatus('idle');
      setSyncMessage(t('googleConnected'));
      
      // Auto-resume action with fresh token
      if (pendingSyncAction === 'backup') {
        setPendingSyncAction(null);
        await runBackupWithToken(freshToken, nextPrefs);
      } else if (pendingSyncAction === 'restore') {
        setPendingSyncAction(null);
        await runRestoreWithToken(freshToken, nextPrefs);
      }
    },
    onError: () => {
      setSyncStatus('error');
      setSyncMessage(t('googleReauthFailed'));
    }
  });

  const handleLogout = () => {
    googleLogout();
    setPreferences(p => ({ ...p, cloudSyncToken: '', cloudSyncEnabled: false, cloudSyncPin: '' }));
    setPendingSyncAction(null);
  };

  const runBackupWithToken = async (token: string, currentPrefs: Preferences) => {
    try {
      setSyncStatus('syncing');
      setSyncMessage(t('encryptingUploading'));
      const payload = JSON.stringify({
        logs,
        preferences: currentPrefs,
        timestamp: new Date().toISOString()
      });
      const encrypted = await encryptData(payload, currentPrefs.cloudSyncPin);
      await uploadToGoogleDrive(token, encrypted);
      setPreferences(p => ({ ...p, cloudSyncLastSync: new Date().toISOString() }));
      setSyncStatus('success');
      setSyncMessage(t('syncComplete'));
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('401') || errMsg.includes('auth') || errMsg.includes('credential')) {
        setPendingSyncAction('backup');
        setSyncStatus('error');
        setSyncMessage(t('sessionExpiredResumeBackup'));
      } else {
        setSyncStatus('error');
        setSyncMessage(`${t('syncFailedDetail')} ${errMsg}`);
      }
    }
  };

  const runRestoreWithToken = async (token: string, currentPrefs: Preferences) => {
    try {
      setSyncStatus('syncing');
      setSyncMessage(t('downloadingDecrypting'));
      const encrypted = await downloadFromGoogleDrive(token);
      if (!encrypted) {
        setSyncStatus('error');
        setSyncMessage(t('noBackupFound'));
        return;
      }
      const decrypted = await decryptData(encrypted, currentPrefs.cloudSyncPin);
      const data = JSON.parse(decrypted);

      // Restore all logs to IndexedDB
      if (data.logs && Array.isArray(data.logs)) {
        await saveLogsBulk(data.logs);
      }

      if (data.preferences) {
        data.preferences.cloudSyncToken = token;
        data.preferences.cloudSyncPin = currentPrefs.cloudSyncPin;
        setPreferences(data.preferences);
      }
      setSyncStatus('success');
      setSyncMessage(t('restoreSuccessful'));
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('401') || errMsg.includes('auth') || errMsg.includes('credential')) {
        setPendingSyncAction('restore');
        setSyncStatus('error');
        setSyncMessage(t('sessionExpiredResumeRestore'));
      } else {
        setSyncStatus('error');
        setSyncMessage(`${t('restoreFailedDetail')} ${errMsg}`);
      }
    }
  };

  const handleManualSync = async () => {
    if (!preferences.cloudSyncToken || !preferences.cloudSyncPin) {
      setSyncMessage(t('connectAndPinFirst'));
      return;
    }
    await runBackupWithToken(preferences.cloudSyncToken, preferences);
  };

  const handleRestore = async () => {
    if (!preferences.cloudSyncToken || !preferences.cloudSyncPin) return;
    await runRestoreWithToken(preferences.cloudSyncToken, preferences);
  };

  const [newVehicle, setNewVehicle] = useState<Omit<VehicleProfile, 'id'>>({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const tabRow = useDragScroll<HTMLDivElement>();

  const [newCompany, setNewCompany] = useState<Omit<OperatorCompany, 'id'>>({ name: '', businessAddress: '', homeTerminalAddress: '' });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [operatorAutocomplete, setOperatorAutocomplete] = useState(false);
  const closeOperatorAutocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOperatorAutocomplete = () => {
    if (closeOperatorAutocompleteTimer.current) {
      clearTimeout(closeOperatorAutocompleteTimer.current);
      closeOperatorAutocompleteTimer.current = null;
    }
    setOperatorAutocomplete(true);
  };
  const closeOperatorAutocomplete = () => {
    closeOperatorAutocompleteTimer.current = setTimeout(() => {
      setOperatorAutocomplete(false);
      closeOperatorAutocompleteTimer.current = null;
    }, 200);
  };

  const [profile, setProfile] = useState(() => {
    const base = preferences.userProfile || {
      name: '',
      email: '',
      occupations: [],
      licenseNumber: '',
      licenseExpiry: '',
      medicalExpiry: '',
      firstAidExpiry: '',
      vehicles: []
    };
    if (base.name === '' && preferences.defaultDriverName) {
      base.name = preferences.defaultDriverName;
    }
    if (!base.vehicles) {
      base.vehicles = [];
    }
    if (!base.operatorCompanies) {
      base.operatorCompanies = [];
    }
    return base;
  });


  const getVehicleMileageInfo = (vehicle: VehicleProfile): { mileage: string; lastUpdated: string } => {
    if (!vehicle.licensePlate) return { mileage: vehicle.mileage || '--', lastUpdated: '' };

    const cleanPlate = vehicle.licensePlate.trim().toLowerCase();
    const readings: { date: string; edited: string; value: number }[] = [];

    logs.forEach(log => {
      log.days.forEach(day => {
        const activePlate = day.cmvPlate || log.metadata.cmvPlate || preferences.defaultCmvPlate || '';
        if (activePlate.trim().toLowerCase() !== cleanPlate) return;

        // Prefer the end reading for a day; otherwise use its start reading.
        const value = Number(day.endOdometer || day.startOdometer);
        if (Number.isFinite(value) && value > 0) {
          readings.push({ date: day.date, edited: day.lastEdited || '', value });
        }
      });
    });

    readings.sort((a, b) => a.date.localeCompare(b.date) || a.edited.localeCompare(b.edited));
    const latest = readings.length > 0 ? readings[readings.length - 1] : null;
    const latestOdo = latest ? latest.value : 0;
    const profileMileage = Number(vehicle.mileage || 0);
    const resolvedMileage = Math.max(latestOdo, Number.isFinite(profileMileage) ? profileMileage : 0);
    return {
      mileage: resolvedMileage > 0 ? resolvedMileage.toString() : '--',
      lastUpdated: latest ? (latest.edited || latest.date) : ''
    };
  };

  const getVehicleMileage = (vehicle: VehicleProfile) => getVehicleMileageInfo(vehicle).mileage;

  const formatMileageTimestamp = (raw: string) => {
    if (!raw) return '';
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
    if (Number.isNaN(d.getTime())) return raw;
    return raw.includes('T') ? formatDateTimeIso(d) : formatDateIso(d);
  };

  const formatInspectionMonth = (raw: string) => {
    if (!raw) return '';
    // Accept YYYY-MM (native month input) and legacy full dates
    const m = /^(\d{4})-(\d{2})/.exec(raw);
    if (m) return `${m[1]}/${m[2]}`;
    return raw;
  };

  const handleSave = () => {
    // Resolve vehicle mileages before saving
    const resolvedVehicles = (profile.vehicles || []).map(v => ({
      ...v,
      mileage: getVehicleMileage(v)
    }));

    setPreferences(prev => ({
      ...prev,
      defaultDriverName: profile.name, // Keep existing defaults synced
      userProfile: {
        ...profile,
        vehicles: resolvedVehicles
      }
    }));
    onClose();
  };

  const toggleOccupation = (occ: string) => {
    setProfile(prev => {
      const occupations = prev.occupations.includes(occ)
        ? prev.occupations.filter(o => o !== occ)
        : [...prev.occupations, occ];
      return { ...prev, occupations };
    });
  };

  const handleAddVehicle = () => {
    if (!newVehicle.vin && !newVehicle.licensePlate) return; // Basic validation
    
    if (editingVehicleId) {
      setProfile(p => ({
        ...p,
        vehicles: (p.vehicles || []).map(v => 
          v.id === editingVehicleId ? { ...newVehicle, id: editingVehicleId } : v
        )
      }));
      setEditingVehicleId(null);
    } else {
      setProfile(p => ({
        ...p,
        vehicles: [...(p.vehicles || []), { ...newVehicle, id: Date.now().toString() }]
      }));
    }
    
    setNewVehicle({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' });
    setShowVehicleForm(false);
  };

  const handleSaveCompany = () => {
    if (!newCompany.name.trim()) return; // Name is required

    if (editingCompanyId) {
      setProfile(p => ({
        ...p,
        operatorCompanies: (p.operatorCompanies || []).map(c =>
          c.id === editingCompanyId ? { ...newCompany, id: editingCompanyId } : c
        )
      }));
      setEditingCompanyId(null);
    } else {
      setProfile(p => ({
        ...p,
        operatorCompanies: [...(p.operatorCompanies || []), { ...newCompany, id: Date.now().toString() }]
      }));
    }

    setNewCompany({ name: '', businessAddress: '', homeTerminalAddress: '' });
    setShowCompanyForm(false);
  };

  const startEditCompany = (company: OperatorCompany) => {
    setEditingCompanyId(company.id);
    setNewCompany({
      name: company.name || '',
      businessAddress: company.businessAddress || '',
      homeTerminalAddress: company.homeTerminalAddress || ''
    });
    setShowCompanyForm(true);
  };

  const handleCancelEditCompany = () => {
    setEditingCompanyId(null);
    setNewCompany({ name: '', businessAddress: '', homeTerminalAddress: '' });
    setShowCompanyForm(false);
  };

  const startEditVehicle = (vehicle: VehicleProfile) => {
    setEditingVehicleId(vehicle.id);
    setNewVehicle({
      friendlyName: vehicle.friendlyName || '',
      vin: vehicle.vin || '',
      licensePlate: vehicle.licensePlate || '',
      mileage: vehicle.mileage || '',
      operatorName: vehicle.operatorName || '',
      inspectionDate: vehicle.inspectionDate || ''
    });
    setShowVehicleForm(true);
  };

  const handleCancelEdit = () => {
    setEditingVehicleId(null);
    setNewVehicle({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' });
    setShowVehicleForm(false);
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative' }}>

        <div
          className="tab-row"
          ref={tabRow.ref}
          onMouseDown={tabRow.onMouseDown}
        >
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => { if (!tabRow.dragState.current.moved) setActiveTab(tab.id); }}
              >
                <Icon size={16} />
                <span>{t(tab.label)}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {activeTab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* ---- Identity ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent-blue)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', fontWeight: 700,
                }}>
                  {(preferences.userProfile?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '1.02rem' }}>{preferences.userProfile?.name || t('unnamedDriver')}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{user?.email || '—'}</div>
                  {preferences.userProfile?.occupations?.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {preferences.userProfile.occupations
                        .map(o => { const hit = OCCUPATIONS.find(([value]) => value === o); return hit ? t(hit[1]) : o; })
                        .join(' · ')}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Access (offline grace window) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Clock size={16} color="var(--accent-blue)" />
                  <strong style={{ fontSize: '0.95rem' }}>{t('access')}</strong>
                  {typeof daysRemaining === 'number' && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 600,
                      color: daysRemaining <= 2 ? 'var(--accent-orange)' : 'var(--accent-green)',
                    }}>
                      {daysRemaining <= 0 ? t('reconnectRequired') : daysRemaining === 1 ? t('oneDayLeft') : `${daysRemaining} ${t('daysLeftSuffix')}`}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {daysRemaining === 1
                    ? t('offlineGraceOne')
                    : t('offlineGraceMany').replace('{n}', String(daysRemaining ?? 7))}
                </p>
                <button className="btn-primary btn-compact" onClick={handleRevalidate} disabled={syncingNow || !online}
                  style={{ marginTop: '0.75rem' }}>
                  <RefreshCw size={15} className={syncingNow ? 'spin' : ''} /> {t('renewSessionNow')}
                </button>
              </div>

              {/* ---- Backup & device sync (optional cloud add-on) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Cloud size={16} color={verifiedConnected ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                  <strong style={{ fontSize: '0.95rem' }}>{t('backupDeviceSync')}</strong>
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600,
                    color: !provider || verifiedConnected === false ? 'var(--text-secondary)' : !online ? 'var(--text-secondary)' : syncState === 'error' ? 'var(--accent-red)' : syncState === 'syncing' ? 'var(--accent-blue)' : 'var(--accent-green)',
                  }}>
                    {!provider
                      ? t('statusOptionalNotConnected')
                      : verifiedConnected === false
                        ? t('statusNotConnected')
                        : verifiedConnected === null
                          ? t('statusChecking')
                          : !online
                            ? t('offline')
                            : syncState === 'syncing'
                              ? t('syncing')
                              : syncState === 'error'
                                ? t('statusError')
                                : t('statusOn')}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('backupBody')}
                </p>

                {(!provider || verifiedConnected === false) ? (
                  <button className="btn-primary btn-compact" onClick={() => handleConnectProvider(googleDriveProvider)} disabled={!online || connectingProvider}>
                    {connectingProvider ? <RefreshCw size={15} className="spin" /> : <Cloud size={15} />} {t('connectGoogleDrive')}
                  </button>
                ) : (
                  <>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'grid', gap: '0.2rem' }}>
                      <div><strong>{t('provider')}:</strong> {provider.label}</div>
                      <div><strong>{t('lastSync')}</strong> {fmtDateTime(lastSyncedAt)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <button className="btn-primary btn-compact" onClick={handleSyncNow} disabled={syncingNow || !online}>
                        <RefreshCw size={15} className={syncingNow ? 'spin' : ''} /> {t('syncNow')}
                      </button>
                      <button onClick={() => handleDisconnectProvider(provider)} disabled={syncingNow}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>
                        {t('disconnect')}
                      </button>
                    </div>
                  </>
                )}
                {handshakeError && (
                  <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', fontSize: '0.8rem', color: 'var(--accent-red)' }}>
                    {t('googleSignInFailed')}: {handshakeError}
                  </div>
                )}
                {syncNowMsg && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: syncNowMsg.startsWith('Up to date') || syncNowMsg.includes('renewed') || syncNowMsg.includes('disconnected') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {syncNowMsg}
                  </div>
                )}
              </div>

              {/* ---- Manual encrypted backup (optional extra, same tab as requested) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <Lock size={16} color="var(--accent-blue)" />
                  <strong style={{ fontSize: '0.95rem' }}>{t('encryptedCloudSync')}</strong>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('optionalManualBackup')}</span>
                </div>
                <p style={{ margin: '0 0 0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('encryptedBackupBody')}
                </p>
                {!preferences.cloudSyncToken ? (
                  <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                    <button className="btn-primary btn-compact" onClick={() => login()}>
                      {t('enableEncryptedBackup')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={14} /> {t('encryptionPin')}
                      </label>
                      <input
                        type="password"
                        placeholder={t('pinRequiredPlaceholder')}
                        value={preferences.cloudSyncPin}
                        onChange={e => setPreferences(p => ({ ...p, cloudSyncPin: e.target.value }))}
                      />
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--accent-orange)' }}>
                        {t('pinLostWarning')}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button
                        className="btn-primary btn-compact"
                        onClick={handleManualSync}
                        disabled={!preferences.cloudSyncPin || syncStatus === 'syncing'}
                        style={{ flex: 1 }}
                      >
                        <Cloud size={16} /> {t('backupNow')}
                      </button>
                      <button
                        className="btn-primary btn-compact"
                        onClick={handleRestore}
                        disabled={!preferences.cloudSyncPin || syncStatus === 'syncing'}
                        style={{ flex: 1, background: 'transparent', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}
                      >
                        {t('restoreData')}
                      </button>
                    </div>

                    {syncMessage && (
                      <div style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        fontSize: '0.82rem',
                        background: syncStatus === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        color: syncStatus === 'error' ? 'var(--accent-red)' : 'var(--status-on-duty)',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto' }}>
                          {syncStatus === 'error' ? <AlertCircle size={16} style={{ flexShrink: 0 }} /> : <CheckCircle size={16} style={{ flexShrink: 0 }} />}
                          <span>{syncMessage}</span>
                        </div>
                        {pendingSyncAction && (
                          <button
                            className="btn-primary"
                            onClick={() => login()}
                            style={{
                              padding: '4px 12px',
                              fontSize: '0.75rem',
                              background: 'var(--accent-blue)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                          >
                            {t('reconnectAndRetry')}
                          </button>
                        )}
                      </div>
                    )}

                    {preferences.cloudSyncLastSync && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                        {t('lastBackupPrefix')} {formatDateTimeIso(preferences.cloudSyncLastSync)}
                      </p>
                    )}

                    <button
                      onClick={handleLogout}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      {t('disconnectEncryptedBackup')}
                    </button>
                  </div>
                )}
              </div>

              {/* ---- Connection health (Drive storage snapshot) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Activity size={16} color={provider ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                  <strong style={{ fontSize: '0.95rem' }}>{t('connectionHealth')}</strong>
                  <button
                    onClick={refreshHealth}
                    disabled={healthBusy || !online}
                    title={t('refreshFromDrive')}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: healthBusy ? 'wait' : 'pointer', display: 'flex', padding: 4 }}
                  >
                    <RefreshCw size={14} className={healthBusy ? 'spin' : ''} />
                  </button>
                </div>
                {!provider ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('localOnlyBody')}
                  </div>
                ) : !health ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {healthBusy ? t('checkingDrive') : t('noHealthData')}
                  </div>
                ) : !health.connected ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--accent-red)' }}>
                    {t('driveUnreachable')}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('weeksStored')}</span>
                    <span style={{ fontWeight: 600 }}>{health.weeksStored}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('storageUsed')}</span>
                    <span style={{ fontWeight: 600 }}>
                      {health.bytesUsed >= 1024 * 1024
                        ? `${(health.bytesUsed / (1024 * 1024)).toFixed(2)} MB`
                        : `${Math.max(1, Math.round(health.bytesUsed / 1024))} KB`}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('indexFile')}</span>
                    <span style={{ color: health.indexOk ? 'var(--accent-green)' : 'var(--accent-orange)', fontWeight: 600 }}>
                      {health.indexOk ? t('statusOk') : t('missingRebuilt')}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('preferencesFile')}</span>
                    <span style={{ color: health.prefsOk ? 'var(--accent-green)' : 'var(--accent-orange)', fontWeight: 600 }}>
                      {health.prefsOk ? t('statusOk') : t('missingRecreated')}
                    </span>
                  </div>
                )}
                {syncState === 'error' && syncErrorMessage && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--accent-red)' }}>
                    <strong>{t('lastError')}</strong> {syncErrorMessage}
                  </div>
                )}
              </div>

              {/* ---- Credential expiries ---- */}
              {credentials.length > 0 && (
                <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <KeyRound size={16} color="var(--accent-blue)" />
                    <strong style={{ fontSize: '0.95rem' }}>{t('credentials')}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.85rem' }}>
                    {credentials.map(c => {
                      const d = c.days as number;
                      const urgent = d <= 30;
                      return (
                        <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span>{c.label}</span>
                          <span style={{
                            fontWeight: urgent ? 600 : 400,
                            color: d <= 7 ? 'var(--accent-red)' : urgent ? 'var(--accent-orange)' : 'var(--text-secondary)',
                          }}>
                            {d <= 0
                              ? t('expiredDaysAgo').replace('{n}', String(Math.abs(d)))
                              : t('daysLeftShort').replace('{n}', String(d))}
                            <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 400 }}>({c.expiry})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {t('editDatesUnderPersonal')}
                  </p>
                </div>
              )}

            </div>
          )}

          {activeTab === 'personal' && (
            <>
              <div className="input-group">            <label>{t('fullName')}</label>
            <input 
              type="text"
              value={profile.name}
              onChange={e => setProfile({...profile, name: e.target.value})} 
              placeholder={t('placeholderFullName')}
            />
          </div>

          <div className="input-group">
            <label>{t('emailAddress')}</label>
            <input 
              type="email"
              value={profile.email}
              onChange={e => setProfile({...profile, email: e.target.value})} 
              placeholder="john@example.com"
            />
          </div>

          <div className="input-group">
            <label>{t('driverOccupation')}</label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '0.75rem', 
              background: 'var(--bg-secondary)', 
              padding: '1rem', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)' 
            }}>              {OCCUPATIONS.map(([value, key]) => (
                <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input 
                    type="checkbox"
                    checked={profile.occupations.includes(value)}
                    onChange={() => toggleOccupation(value)}
                  />
                  {t(key)}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>{t('driverLicenseNumber')}</label>
            <input 
              type="text" 
              value={profile.licenseNumber} 
              onChange={e => setProfile({...profile, licenseNumber: e.target.value})} 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            <div className="input-group">
              <label>{t('licenseExpires')}</label>
              <input 
                type="date" 
                value={profile.licenseExpiry} 
                onChange={e => setProfile({...profile, licenseExpiry: e.target.value})} 
              />
            </div>
            <div className="input-group">
              <label>{t('medicalExpires')}</label>
              <input 
                type="date" 
                value={profile.medicalExpiry} 
                onChange={e => setProfile({...profile, medicalExpiry: e.target.value})} 
              />
            </div>
          </div>

            <div className="input-group">
              <label>{t('firstAidExpires')}</label>
              <input 
                type="date" 
                value={profile.firstAidExpiry} 
                onChange={e => setProfile({...profile, firstAidExpiry: e.target.value})} 
              />
            </div>
            </>
          )}

          {activeTab === 'vehicles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {(profile.vehicles || []).length === 0 && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                  {t('noSavedVehicles')} <strong>{t('addVehicleButton')}</strong> {t('addOneSuffix')}
                </div>
              )}
              {(profile.vehicles || []).map(v => (
                <div key={v.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', paddingRight: '2rem' }}>{v.friendlyName || v.vin || v.licensePlate || t('unnamedVehicle')}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div><strong>{t('vinLabel')}</strong> {v.vin || '--'}</div>
                    <div><strong>{t('plateLabel')}</strong> {v.licensePlate || '--'}</div>
                    <div>
                      <strong>{t('labelMileage')}</strong> {getVehicleMileage(v)}
                      {(() => { const info = getVehicleMileageInfo(v); return info.lastUpdated ? (
                        <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {t('lastUpdated')} {formatMileageTimestamp(info.lastUpdated)}
                        </span>
                      ) : null; })()}
                    </div>
                    <div><strong>{t('labelOperator')}</strong> {v.operatorName || '--'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>{t('inspectedLabel')}</strong> {formatInspectionMonth(v.inspectionDate) || '--'}</div>
                  </div>
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => startEditVehicle(v)}
                      title={t('editVehicleTitle')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        if (editingVehicleId === v.id) handleCancelEdit();
                        setProfile(p => ({ ...p, vehicles: (p.vehicles || []).filter(x => x.id !== v.id) }));
                      }}
                      title={t('deleteVehicleTitle')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {!showVehicleForm && (
                <button
                  className="btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => { setEditingVehicleId(null); setNewVehicle({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' }); setShowVehicleForm(true); }}
                >
                  <Plus size={18} /> {t('addVehicleButton')}
                </button>
              )}

              {showVehicleForm && (
              <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: editingVehicleId ? 'var(--accent-blue)' : 'inherit' }}>
                  {editingVehicleId ? t('editVehicleDetails') : t('addNewVehicle')}
                </h4>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="input-group">
                    <label>{t('friendlyName')}</label>
                    <input type="text" value={newVehicle.friendlyName} onChange={e => setNewVehicle({...newVehicle, friendlyName: e.target.value})} placeholder={t('placeholderBusExample')} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div className="input-group">
                      <label>VIN</label>
                      <input type="text" value={newVehicle.vin} onChange={e => setNewVehicle({...newVehicle, vin: e.target.value})} />
                    </div>
                    <div className="input-group">
                      <label>{t('licensePlate')}</label>
                      <input type="text" value={newVehicle.licensePlate} onChange={e => setNewVehicle({...newVehicle, licensePlate: e.target.value})} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div className="input-group">
                      <label style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        {t('mileage')}
                        {editingVehicleId && (() => { const info = getVehicleMileageInfo(profile.vehicles.find(x => x.id === editingVehicleId)!); return info.lastUpdated ? (
                          <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {t('lastUpdated')} {formatMileageTimestamp(info.lastUpdated)}
                          </span>
                        ) : null; })()}
                      </label>
                      <input type="number" aria-label={t('mileage')} value={newVehicle.mileage} onChange={e => setNewVehicle({...newVehicle, mileage: e.target.value})} placeholder={t('odometerPlaceholder')} />
                    </div>
                    <div className="input-group">
                      <label>{t('inspectionDate')}</label>
                      <input type="month" value={newVehicle.inspectionDate} onChange={e => setNewVehicle({...newVehicle, inspectionDate: e.target.value})} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>{t('operatorCompany')}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        style={{ width: '100%' }}
                        value={newVehicle.operatorName}
                        onChange={e => { setNewVehicle({...newVehicle, operatorName: e.target.value}); openOperatorAutocomplete(); }}
                        onClick={() => openOperatorAutocomplete()}
                        onFocus={() => openOperatorAutocomplete()}
                        onBlur={() => closeOperatorAutocomplete()}
                        autoComplete="off"
                        placeholder={t('searchCompaniesPlaceholder')}
                      />
                      {operatorAutocomplete && (profile.operatorCompanies || []).length > 0 && (
                        <div
                          className="autocomplete-dropdown"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            width: '100%',
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '8px',
                            marginTop: '4px',
                            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                            zIndex: 1000,
                            maxHeight: '200px',
                            overflowY: 'auto'
                          }}
                        >
                          {(profile.operatorCompanies || [])
                            .filter(c => {
                              const search = (newVehicle.operatorName || '').trim().toLowerCase();
                              if (!search) return true;
                              return c.name.toLowerCase().includes(search);
                            })
                            .map(c => (
                              <div
                                key={c.id}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  setNewVehicle(v => ({ ...v, operatorName: c.name }));
                                  setOperatorAutocomplete(false);
                                }}
                                style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-primary)', textAlign: 'left' }}
                                className="autocomplete-option"
                              >
                                <div>{c.name}</div>
                                {c.homeTerminalAddress && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.homeTerminalAddress}</div>
                                )}
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleAddVehicle}>
                      <Save size={18} /> {t('save')}
                    </button>
                    <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleCancelEdit}>
                      <X size={18} /> {t('cancel')}
                    </button>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          {activeTab === 'companies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {(profile.operatorCompanies || []).length === 0 && (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                  {t('noSavedCompanies')} <strong>{t('addCompanyButton')}</strong> {t('addOneSuffix')}
                </div>
              )}
              {(profile.operatorCompanies || []).map(c => (
                <div key={c.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', paddingRight: '2rem' }}>{c.name || t('unnamedCompany')}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}><strong>{t('labelBusiness')}</strong> {c.businessAddress || '--'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>{t('labelHomeTerminal')}</strong> {c.homeTerminalAddress || '--'}</div>
                  </div>
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => startEditCompany(c)}
                      title={t('editCompanyTitle')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        if (editingCompanyId === c.id) handleCancelEditCompany();
                        setProfile(p => ({ ...p, operatorCompanies: (p.operatorCompanies || []).filter(x => x.id !== c.id) }));
                      }}
                      title={t('deleteCompanyTitle')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {!showCompanyForm && (
                <button
                  className="btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => { setEditingCompanyId(null); setNewCompany({ name: '', businessAddress: '', homeTerminalAddress: '' }); setShowCompanyForm(true); }}
                >
                  <Plus size={18} /> {t('addCompanyButton')}
                </button>
              )}

              {showCompanyForm && (
                <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: editingCompanyId ? 'var(--accent-blue)' : 'inherit' }}>
                    {editingCompanyId ? t('editCompanyDetails') : t('addNewCompany')}
                  </h4>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div className="input-group">
                      <label>{t('companyName')}</label>
                      <input type="text" value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} placeholder={t('placeholderCompanyExample')} />
                    </div>
                    <div className="input-group">
                      <label>{t('businessAddress')}</label>
                      <input type="text" value={newCompany.businessAddress} onChange={e => setNewCompany({...newCompany, businessAddress: e.target.value})} placeholder={t('placeholderStreetCity')} />
                    </div>
                    <div className="input-group">
                      <label>{t('homeTerminalAddress')}</label>
                      <input type="text" value={newCompany.homeTerminalAddress} onChange={e => setNewCompany({...newCompany, homeTerminalAddress: e.target.value})} placeholder={t('placeholderCityProvince')} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleSaveCompany}>
                        <Save size={18} /> {t('save')}
                      </button>
                      <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleCancelEditCompany}>
                        <X size={18} /> {t('cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}





        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={18} /> {t('savePreferences')}
          </button>
        </div>
      </div>
    </div>
  );
};
