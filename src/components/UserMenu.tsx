import React, { useState } from 'react';
import { Preferences, VehicleProfile, WeeklyLog } from '../types';
import { Save, Plus, Trash2, Pencil, X, Cloud, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { uploadToGoogleDrive, downloadFromGoogleDrive, encryptData, decryptData } from '../utils/cloudSync';
import { saveLog } from '../utils/storage';

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

export const UserMenu: React.FC<UserMenuProps> = ({ preferences, setPreferences, onClose, logs = [] }) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'vehicles' | 'trucking' | 'sync'>('personal');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    onSuccess: (tokenResponse) => {
      setPreferences(p => ({ ...p, cloudSyncToken: tokenResponse.access_token, cloudSyncEnabled: true }));
    },
    onError: () => setSyncMessage('Google Login Failed')
  });

  const handleLogout = () => {
    googleLogout();
    setPreferences(p => ({ ...p, cloudSyncToken: '', cloudSyncEnabled: false, cloudSyncPin: '' }));
  };

  const handleManualSync = async () => {
    if (!preferences.cloudSyncToken || !preferences.cloudSyncPin) {
      setSyncMessage('Please connect to Google and set a PIN first.');
      return;
    }
    try {
      setSyncStatus('syncing');
      setSyncMessage('Encrypting and uploading...');
      const payload = JSON.stringify({
        logs,
        preferences,
        timestamp: new Date().toISOString()
      });
      const encrypted = await encryptData(payload, preferences.cloudSyncPin);
      await uploadToGoogleDrive(preferences.cloudSyncToken, encrypted);
      setPreferences(p => ({ ...p, cloudSyncLastSync: new Date().toISOString() }));
      setSyncStatus('success');
      setSyncMessage('Sync complete!');
    } catch (e: any) {
      console.error(e);
      const errMsg = e.message || String(e);
      if (errMsg.includes('401')) {
        handleLogout();
        setSyncMessage('Session expired. Please reconnect to Google.');
      } else {
        setSyncMessage(`Sync failed: ${errMsg}`);
      }
      setSyncStatus('error');
    }
  };

  const handleRestore = async () => {
    if (!preferences.cloudSyncToken || !preferences.cloudSyncPin) return;
    try {
      setSyncStatus('syncing');
      setSyncMessage('Downloading and decrypting...');
      const encrypted = await downloadFromGoogleDrive(preferences.cloudSyncToken);
      if (!encrypted) {
        setSyncStatus('error');
        setSyncMessage('No backup found in Google Drive.');
        return;
      }
      const decrypted = await decryptData(encrypted, preferences.cloudSyncPin);
      const data = JSON.parse(decrypted);

      // Restore all logs to IndexedDB
      if (data.logs && Array.isArray(data.logs)) {
        for (const log of data.logs) {
          await saveLog(log);
        }
      }

      if (data.preferences) {
        data.preferences.cloudSyncToken = preferences.cloudSyncToken;
        data.preferences.cloudSyncPin = preferences.cloudSyncPin;
        setPreferences(data.preferences);
      }
      setSyncStatus('success');
      setSyncMessage('Restore successful! Reloading page in a moment...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      console.error(e);
      const errMsg = e.message || String(e);
      setSyncStatus('error');
      setSyncMessage(`Restore failed: ${errMsg}`);
    }
  };
  const [newVehicle, setNewVehicle] = useState<Omit<VehicleProfile, 'id'>>({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

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
    return base;
  });


  const getVehicleMileage = (vehicle: VehicleProfile) => {
    if (!vehicle.licensePlate) return vehicle.mileage || '--';

    let latestOdo = 0;
    let latestDateStr = '';
    const cleanPlate = vehicle.licensePlate.trim().toLowerCase();

    logs.forEach(log => {
      // Check week metadata first if sameVehicle is true for any days
      log.days.forEach(day => {
        const activePlate = day.cmvPlate || log.metadata.cmvPlate || preferences.defaultCmvPlate || '';
        if (activePlate.trim().toLowerCase() === cleanPlate) {
          const endOdo = parseInt(day.endOdometer || '0', 10);
          const startOdo = parseInt(day.startOdometer || '0', 10);
          const maxOdo = Math.max(endOdo, startOdo);
          
          if (maxOdo > 0) {
            if (!latestDateStr || day.date > latestDateStr) {
              latestOdo = maxOdo;
              latestDateStr = day.date;
            }
          }
        }
      });
    });

    const profileMileage = parseInt(vehicle.mileage || '0', 10);
    return latestOdo > profileMileage ? latestOdo.toString() : (vehicle.mileage || '--');
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
  };

  const handleCancelEdit = () => {
    setEditingVehicleId(null);
    setNewVehicle({ friendlyName: '', vin: '', licensePlate: '', mileage: '', operatorName: '', inspectionDate: '' });
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <div className="glass-panel" style={{ padding: '1.5rem', paddingTop: '1rem', position: 'relative' }}>

        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--glass-border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
          <button className={`nav-link ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>Personal Info</button>
          <button className={`nav-link ${activeTab === 'vehicles' ? 'active' : ''}`} onClick={() => setActiveTab('vehicles')}>My Vehicles</button>
          <button className={`nav-link ${activeTab === 'trucking' ? 'active' : ''}`} onClick={() => setActiveTab('trucking')}>Trucking Features</button>
          <button className={`nav-link ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>Cloud Sync</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
              background: 'var(--bg-primary)', 
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
              {(profile.vehicles || []).map(v => (
                <div key={v.id} style={{ padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', paddingRight: '2rem' }}>{v.friendlyName || v.vin || v.licensePlate || 'Unnamed Vehicle'}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div><strong>VIN:</strong> {v.vin || '--'}</div>
                    <div><strong>Plate:</strong> {v.licensePlate || '--'}</div>
                    <div><strong>Mileage:</strong> {getVehicleMileage(v)}</div>
                    <div><strong>Operator:</strong> {v.operatorName || '--'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Inspected:</strong> {v.inspectionDate || '--'}</div>
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

              <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
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
                      <label>Mileage</label>
                      <input type="number" value={newVehicle.mileage} onChange={e => setNewVehicle({...newVehicle, mileage: e.target.value})} placeholder="Odometer" />
                    </div>
                    <div className="input-group">
                      <label>Inspection Date</label>
                      <input type="date" value={newVehicle.inspectionDate} onChange={e => setNewVehicle({...newVehicle, inspectionDate: e.target.value})} />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Operator / Company</label>
                    <input type="text" value={newVehicle.operatorName} onChange={e => setNewVehicle({...newVehicle, operatorName: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-primary" style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }} onClick={handleAddVehicle}>
                      {editingVehicleId ? <Save size={18} /> : <Plus size={18} />}
                      {editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}
                    </button>
                    {editingVehicleId && (
                      <button 
                        className="btn-primary" 
                        style={{ marginTop: '0.5rem', alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} 
                        onClick={handleCancelEdit}
                      >
                        <X size={18} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
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
                  <input 
                    type="checkbox" 
                    checked={preferences.showCoDrivers} 
                    onChange={() => setPreferences(prev => ({ ...prev, showCoDrivers: !prev.showCoDrivers }))} 
                  />
                  Show Co-Driver(s)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={preferences.showTrailerPlate} 
                    onChange={() => setPreferences(prev => ({ ...prev, showTrailerPlate: !prev.showTrailerPlate }))} 
                  />
                  Show Trailer Plate
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={preferences.showExempt} 
                    onChange={() => setPreferences(prev => ({ ...prev, showExempt: !prev.showExempt }))} 
                  />
                  Show Exempt Hrs
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={preferences.showSleeper} 
                    onChange={() => setPreferences(prev => ({ ...prev, showSleeper: !prev.showSleeper }))} 
                  />
                  Show Sleeper Row
                </label>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Cloud size={24} color="var(--accent-blue)" />
                <div>
                  <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Encrypted Cloud Sync</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Securely backup to your Google Drive AppData folder.</p>
                </div>
              </div>

              {!preferences.cloudSyncToken ? (
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                    Enable zero-knowledge, encrypted syncing. Your data is stored safely in a hidden folder on your personal Google Drive, immune to accidental deletion.
                  </p>
                  <button className="btn-primary" onClick={() => login()} style={{ width: '100%', justifyContent: 'center' }}>
                    Connect Google Drive
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="input-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Lock size={14} /> Encryption PIN / Passphrase
                    </label>
                    <input 
                      type="password" 
                      placeholder="Required to encrypt/decrypt data"
                      value={preferences.cloudSyncPin}
                      onChange={e => setPreferences(p => ({ ...p, cloudSyncPin: e.target.value }))}
                    />
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--accent-orange)' }}>
                      If you lose this PIN, your backup cannot be recovered.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
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
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      background: syncStatus === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: syncStatus === 'error' ? 'var(--accent-red)' : 'var(--status-on-duty)'
                    }}>
                      {syncStatus === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                      {syncMessage}
                    </div>
                  )}

                  {preferences.cloudSyncLastSync && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                      Last synced: {new Date(preferences.cloudSyncLastSync).toLocaleString()}
                    </p>
                  )}

                  <button 
                    onClick={handleLogout} 
                    style={{ background: 'none', border: 'none', color: 'var(--accent-red)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem', marginTop: '1rem' }}
                  >
                    Disconnect Google Drive
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} onClick={onClose}>
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
