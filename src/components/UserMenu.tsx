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
import { googleDriveProvider } from '../utils/googleDriveProvider';
import { getDriveHealth, type DriveHealth } from '../utils/driveStore';

interface UserMenuProps {
  preferences: Preferences;
  setPreferences: React.Dispatch<React.SetStateAction<Preferences>>;
  onClose: () => void;
  logs?: WeeklyLog[];
}

const OCCUPATIONS = [
  'Bus Driver',
  'School Bus Driver',
  'Truck Driver',
  'Delivery Driver',
  'Ridesharing Driver',
  'Taxi Driver',
  'Chauffeur',
  'Courier',
  'Heavy Equipment Operator'
];

const TABS = [
  { id: 'account', label: 'Account', icon: ShieldCheck },
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'vehicles', label: 'My Vehicles', icon: Truck },
  { id: 'companies', label: 'Operator Companies', icon: Building2 },
] as const;

export const UserMenu: React.FC<UserMenuProps> = ({ preferences, setPreferences, onClose, logs = [] }) => {
  const { user, daysRemaining, validateSession } = useAuth();
  const { state: syncState, message: syncErrorMessage, online, lastSyncedAt } = useSyncStatus();
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncNowMsg, setSyncNowMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<DriveHealth | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const provider: CloudProvider | null = getActiveProvider();

  const refreshHealth = async () => {
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
    setSyncNowMsg(res.ok ? 'Up to date.' : (res.error || 'Sync failed.'));
    if (res.ok) window.setTimeout(() => setSyncNowMsg(null), 4000);
  };

  const handleConnectProvider = (p: CloudProvider) => {
    setActiveProviderId(p.id);
    void p.connect(); // redirects to consent; returns via ?code=... handshake
  };

  const handleDisconnectProvider = async (p: CloudProvider) => {
    await p.disconnect();
    setActiveProviderId(null);
    setSyncNowMsg(`${p.label} disconnected. Local data remains; backup & device sync paused.`);
  };

  const handleRevalidate = async () => {
    setSyncNowMsg(null);
    setSyncingNow(true);
    const res = await validateSession();
    setSyncingNow(false);
    setSyncNowMsg(res.ok ? 'Session renewed.' : (res.error || 'Could not reach the server.'));
    if (res.ok) window.setTimeout(() => setSyncNowMsg(null), 4000);
  };

  const fmtDateTime = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const daysUntil = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  };

  const credentials = [
    { label: 'Driver license', expiry: preferences.userProfile?.licenseExpiry },
    { label: 'Medical exam', expiry: preferences.userProfile?.medicalExpiry },
    { label: 'First aid', expiry: preferences.userProfile?.firstAidExpiry },
  ]
    .map(c => ({ ...c, days: daysUntil(c.expiry || '') }))
    .filter(c => c.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const [activeTab, setActiveTab] = useState<'account' | 'personal' | 'vehicles' | 'companies'>('account');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [pendingSyncAction, setPendingSyncAction] = useState<'backup' | 'restore' | null>(null);

  // Refresh the Drive health card whenever the Account tab is shown.
  React.useEffect(() => {
    if (activeTab === 'account' && provider) void refreshHealth();
  }, [activeTab, provider]);

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
      setSyncMessage('Google connected successfully!');
      
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
      setSyncMessage('Google Re-Authentication Failed');
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
      setSyncMessage('Encrypting and uploading...');
      const payload = JSON.stringify({
        logs,
        preferences: currentPrefs,
        timestamp: new Date().toISOString()
      });
      const encrypted = await encryptData(payload, currentPrefs.cloudSyncPin);
      await uploadToGoogleDrive(token, encrypted);
      setPreferences(p => ({ ...p, cloudSyncLastSync: new Date().toISOString() }));
      setSyncStatus('success');
      setSyncMessage('Sync complete!');
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('401') || errMsg.includes('auth') || errMsg.includes('credential')) {
        setPendingSyncAction('backup');
        setSyncStatus('error');
        setSyncMessage('Session expired. Click Reconnect below to resume backup.');
      } else {
        setSyncStatus('error');
        setSyncMessage(`Sync failed: ${errMsg}`);
      }
    }
  };

  const runRestoreWithToken = async (token: string, currentPrefs: Preferences) => {
    try {
      setSyncStatus('syncing');
      setSyncMessage('Downloading and decrypting...');
      const encrypted = await downloadFromGoogleDrive(token);
      if (!encrypted) {
        setSyncStatus('error');
        setSyncMessage('No backup found in Google Drive.');
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
      setSyncMessage('Restore successful! Reloading page in a moment...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('401') || errMsg.includes('auth') || errMsg.includes('credential')) {
        setPendingSyncAction('restore');
        setSyncStatus('error');
        setSyncMessage('Session expired. Click Reconnect below to restore.');
      } else {
        setSyncStatus('error');
        setSyncMessage(`Restore failed: ${errMsg}`);
      }
    }
  };

  const handleManualSync = async () => {
    if (!preferences.cloudSyncToken || !preferences.cloudSyncPin) {
      setSyncMessage('Please connect to Google and set a PIN first.');
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
    return raw.includes('T')
      ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const formatInspectionMonth = (raw: string) => {
    if (!raw) return '';
    // Accept YYYY-MM (native month input) and legacy full dates
    const m = /^((\d{4})-(\d{2}))(?:-\d{2})?$/.exec(raw);
    if (m) {
      const d = new Date(`${m[1]}-15T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
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
                <span>{tab.label}</span>
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
                  <div style={{ fontWeight: 600, fontSize: '1.02rem' }}>{preferences.userProfile?.name || 'Unnamed driver'}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{user?.email || '—'}</div>
                  {preferences.userProfile?.occupations?.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{preferences.userProfile.occupations.join(' · ')}</div>
                  )}
                </div>
              </div>

              {/* ---- Access (offline grace window) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Clock size={16} color="var(--accent-blue)" />
                  <strong style={{ fontSize: '0.95rem' }}>Access</strong>
                  {typeof daysRemaining === 'number' && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 600,
                      color: daysRemaining <= 2 ? 'var(--accent-orange)' : 'var(--accent-green)',
                    }}>
                      {daysRemaining <= 0 ? 'Reconnect required' : daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  You can keep logging offline for {daysRemaining === 1 ? 'one more day' : `${daysRemaining ?? 7} more days`}. After that, one reconnect extends the window — this is also where a subscription will renew access.
                </p>
                <button className="btn-primary" onClick={handleRevalidate} disabled={syncingNow || !online}
                  style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', fontSize: '0.85rem', justifyContent: 'center' }}>
                  <RefreshCw size={15} className={syncingNow ? 'spin' : ''} /> Renew session now
                </button>
              </div>

              {/* ---- Backup & device sync (optional cloud add-on) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Cloud size={16} color={provider ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                  <strong style={{ fontSize: '0.95rem' }}>Backup &amp; device sync</strong>
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600,
                    color: !provider ? 'var(--text-secondary)' : !online ? 'var(--text-secondary)' : syncState === 'error' ? 'var(--accent-red)' : syncState === 'syncing' ? 'var(--accent-blue)' : 'var(--accent-green)',
                  }}>
                    {!provider ? 'Optional — not connected' : !online ? 'Offline' : syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Error' : 'On'}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Your data always lives on this device. Connect a cloud to add an
                  automatic backup there and keep multiple devices in sync.
                </p>

                {!provider ? (
                  <button className="btn-primary" onClick={() => handleConnectProvider(googleDriveProvider)} disabled={!online}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', justifyContent: 'center' }}>
                    <Cloud size={15} /> Connect Google Drive
                  </button>
                ) : (
                  <>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'grid', gap: '0.2rem' }}>
                      <div><strong>Provider:</strong> {provider.label}</div>
                      <div><strong>Last sync:</strong> {fmtDateTime(lastSyncedAt)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <button className="btn-primary" onClick={handleSyncNow} disabled={syncingNow || !online}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', justifyContent: 'center' }}>
                        <RefreshCw size={15} className={syncingNow ? 'spin' : ''} /> Sync now
                      </button>
                      <button onClick={() => handleDisconnectProvider(provider)} disabled={syncingNow}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Disconnect
                      </button>
                    </div>
                  </>
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
                  <strong style={{ fontSize: '0.95rem' }}>Encrypted Cloud Sync</strong>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>optional manual backup</span>
                </div>
                <p style={{ margin: '0 0 0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Writes a PIN-encrypted copy of all data to a hidden folder on your
                  Google Drive. Independent of the automatic sync above — an extra
                  safety net you control.
                </p>
                {!preferences.cloudSyncToken ? (
                  <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                    <button className="btn-primary" onClick={() => login()} style={{ width: '100%', justifyContent: 'center' }}>
                      Enable Encrypted Backup
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={14} /> Encryption PIN / Passphrase
                      </label>
                      <input
                        type="password"
                        placeholder="Required to encrypt/decrypt data"
                        value={preferences.cloudSyncPin}
                        onChange={e => setPreferences(p => ({ ...p, cloudSyncPin: e.target.value }))}
                      />
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--accent-orange)' }}>
                        If you lose this PIN, your backup cannot be recovered.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button
                        className="btn-primary"
                        onClick={handleManualSync}
                        disabled={!preferences.cloudSyncPin || syncStatus === 'syncing'}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Cloud size={16} /> Backup Now
                      </button>
                      <button
                        className="btn-primary"
                        onClick={handleRestore}
                        disabled={!preferences.cloudSyncPin || syncStatus === 'syncing'}
                        style={{ flex: 1, justifyContent: 'center', background: 'transparent', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}
                      >
                        Restore Data
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
                            Reconnect & Retry
                          </button>
                        )}
                      </div>
                    )}

                    {preferences.cloudSyncLastSync && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                        Last backup: {new Date(preferences.cloudSyncLastSync).toLocaleString()}
                      </p>
                    )}

                    <button
                      onClick={handleLogout}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-red)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Disconnect encrypted backup
                    </button>
                  </div>
                )}
              </div>

              {/* ---- Connection health (Drive storage snapshot) ---- */}
              <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <Activity size={16} color={provider ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                  <strong style={{ fontSize: '0.95rem' }}>Connection health</strong>
                  <button
                    onClick={refreshHealth}
                    disabled={healthBusy || !online}
                    title="Refresh from Google Drive"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: healthBusy ? 'wait' : 'pointer', display: 'flex', padding: 4 }}
                  >
                    <RefreshCw size={14} className={healthBusy ? 'spin' : ''} />
                  </button>
                </div>
                {!provider ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Running local-only. Connect a cloud above to see storage and
                    sync health here.
                  </div>
                ) : !health ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {healthBusy ? 'Checking Google Drive…' : 'No health data yet.'}
                  </div>
                ) : !health.connected ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--accent-red)' }}>
                    Google Drive is not reachable right now.
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Weeks stored</span>
                    <span style={{ fontWeight: 600 }}>{health.weeksStored}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Storage used</span>
                    <span style={{ fontWeight: 600 }}>
                      {health.bytesUsed >= 1024 * 1024
                        ? `${(health.bytesUsed / (1024 * 1024)).toFixed(2)} MB`
                        : `${Math.max(1, Math.round(health.bytesUsed / 1024))} KB`}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>Index file</span>
                    <span style={{ color: health.indexOk ? 'var(--accent-green)' : 'var(--accent-orange)', fontWeight: 600 }}>
                      {health.indexOk ? 'OK' : 'Missing (rebuilt on next sync)'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>Preferences file</span>
                    <span style={{ color: health.prefsOk ? 'var(--accent-green)' : 'var(--accent-orange)', fontWeight: 600 }}>
                      {health.prefsOk ? 'OK' : 'Missing (recreated on next sync)'}
                    </span>
                  </div>
                )}
                {syncState === 'error' && syncErrorMessage && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--accent-red)' }}>
                    <strong>Last error:</strong> {syncErrorMessage}
                  </div>
                )}
              </div>

              {/* ---- Credential expiries ---- */}
              {credentials.length > 0 && (
                <div style={{ padding: '1.1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <KeyRound size={16} color="var(--accent-blue)" />
                    <strong style={{ fontSize: '0.95rem' }}>Credentials</strong>
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
                            {d <= 0 ? `EXPIRED ${Math.abs(d)}d ago` : `${d}d left`}
                            <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 400 }}>({c.expiry})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Edit dates under <em>Personal Info</em>.
                  </p>
                </div>
              )}

            </div>
          )}

          {activeTab === 'personal' && (
            <>
              <div className="input-group">
            <label>Full Name</label>
            <input 
              type="text" 
              value={profile.name} 
              onChange={e => setProfile({...profile, name: e.target.value})} 
              placeholder="John Doe"
            />
          </div>

          <div className="input-group">
            <label>Email Address</label>
            <input 
              type="email" 
              value={profile.email} 
              onChange={e => setProfile({...profile, email: e.target.value})} 
              placeholder="john@example.com"
            />
          </div>

          <div className="input-group">
            <label>Driver Occupation</label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '0.75rem', 
              background: 'var(--bg-secondary)', 
              padding: '1rem', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)' 
            }}>
              {OCCUPATIONS.map(occ => (
                <label key={occ} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input 
                    type="checkbox" 
                    checked={profile.occupations.includes(occ)}
                    onChange={() => toggleOccupation(occ)}
                  />
                  {occ}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>Driver License Number</label>
            <input 
              type="text" 
              value={profile.licenseNumber} 
              onChange={e => setProfile({...profile, licenseNumber: e.target.value})} 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            <div className="input-group">
              <label>License Expires</label>
              <input 
                type="date" 
                value={profile.licenseExpiry} 
                onChange={e => setProfile({...profile, licenseExpiry: e.target.value})} 
              />
            </div>
            <div className="input-group">
              <label>Medical Exam Expires</label>
              <input 
                type="date" 
                value={profile.medicalExpiry} 
                onChange={e => setProfile({...profile, medicalExpiry: e.target.value})} 
              />
            </div>
          </div>

            <div className="input-group">
              <label>First Aid Expires</label>
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
                  No saved vehicles. Press the <strong>Add Vehicle</strong> button to add one.
                </div>
              )}
              {(profile.vehicles || []).map(v => (
                <div key={v.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', paddingRight: '2rem' }}>{v.friendlyName || v.vin || v.licensePlate || 'Unnamed Vehicle'}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div><strong>VIN:</strong> {v.vin || '--'}</div>
                    <div><strong>Plate:</strong> {v.licensePlate || '--'}</div>
                    <div>
                      <strong>Mileage:</strong> {getVehicleMileage(v)}
                      {(() => { const info = getVehicleMileageInfo(v); return info.lastUpdated ? (
                        <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Last updated: {formatMileageTimestamp(info.lastUpdated)}
                        </span>
                      ) : null; })()}
                    </div>
                    <div><strong>Operator:</strong> {v.operatorName || '--'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Inspected:</strong> {formatInspectionMonth(v.inspectionDate) || '--'}</div>
                  </div>
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => startEditVehicle(v)}
                      title="Edit Vehicle"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        if (editingVehicleId === v.id) handleCancelEdit();
                        setProfile(p => ({ ...p, vehicles: (p.vehicles || []).filter(x => x.id !== v.id) }));
                      }}
                      title="Delete Vehicle"
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
                  <Plus size={18} /> Add Vehicle
                </button>
              )}

              {showVehicleForm && (
              <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: editingVehicleId ? 'var(--accent-blue)' : 'inherit' }}>
                  {editingVehicleId ? 'Edit Vehicle Details' : 'Add New Vehicle'}
                </h4>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Friendly Name (Optional)</label>
                    <input type="text" value={newVehicle.friendlyName} onChange={e => setNewVehicle({...newVehicle, friendlyName: e.target.value})} placeholder="e.g. Bus 42" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div className="input-group">
                      <label>VIN</label>
                      <input type="text" value={newVehicle.vin} onChange={e => setNewVehicle({...newVehicle, vin: e.target.value})} />
                    </div>
                    <div className="input-group">
                      <label>License Plate</label>
                      <input type="text" value={newVehicle.licensePlate} onChange={e => setNewVehicle({...newVehicle, licensePlate: e.target.value})} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div className="input-group">
                      <label style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        Mileage
                        {editingVehicleId && (() => { const info = getVehicleMileageInfo(profile.vehicles.find(x => x.id === editingVehicleId)!); return info.lastUpdated ? (
                          <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Last updated: {formatMileageTimestamp(info.lastUpdated)}
                          </span>
                        ) : null; })()}
                      </label>
                      <input type="number" aria-label="Mileage" value={newVehicle.mileage} onChange={e => setNewVehicle({...newVehicle, mileage: e.target.value})} placeholder="Odometer" />
                    </div>
                    <div className="input-group">
                      <label>Inspection Date (Month &amp; Year)</label>
                      <input type="month" value={newVehicle.inspectionDate} onChange={e => setNewVehicle({...newVehicle, inspectionDate: e.target.value})} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Operator / Company</label>
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
                        placeholder="Search saved companies..."
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
                      <Save size={18} /> Save
                    </button>
                    <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleCancelEdit}>
                      <X size={18} /> Cancel
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
                  No saved companies. Press the <strong>Add Company</strong> button to add one.
                </div>
              )}
              {(profile.operatorCompanies || []).map(c => (
                <div key={c.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', paddingRight: '2rem' }}>{c.name || 'Unnamed Company'}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Business:</strong> {c.businessAddress || '--'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Home Terminal:</strong> {c.homeTerminalAddress || '--'}</div>
                  </div>
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => startEditCompany(c)}
                      title="Edit Company"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        if (editingCompanyId === c.id) handleCancelEditCompany();
                        setProfile(p => ({ ...p, operatorCompanies: (p.operatorCompanies || []).filter(x => x.id !== c.id) }));
                      }}
                      title="Delete Company"
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
                  <Plus size={18} /> Add Company
                </button>
              )}

              {showCompanyForm && (
                <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: editingCompanyId ? 'var(--accent-blue)' : 'inherit' }}>
                    {editingCompanyId ? 'Edit Company Details' : 'Add New Company'}
                  </h4>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div className="input-group">
                      <label>Company Name</label>
                      <input type="text" value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} placeholder="e.g. Acme Trucking Inc." />
                    </div>
                    <div className="input-group">
                      <label>Business Address</label>
                      <input type="text" value={newCompany.businessAddress} onChange={e => setNewCompany({...newCompany, businessAddress: e.target.value})} placeholder="Street, City, Province" />
                    </div>
                    <div className="input-group">
                      <label>Home Terminal Address</label>
                      <input type="text" value={newCompany.homeTerminalAddress} onChange={e => setNewCompany({...newCompany, homeTerminalAddress: e.target.value})} placeholder="City, Province" />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleSaveCompany}>
                        <Save size={18} /> Save
                      </button>
                      <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleCancelEditCompany}>
                        <X size={18} /> Cancel
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
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={18} /> Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
