export type Status = 'off-duty' | 'sleeper' | 'driving' | 'on-duty';

export interface WeeklyMetadata {
  homeTerminalAddress: string;
  month: string;
  year: string;
  cycle: '7-Day' | '14-Day';
  driverName: string;
  coDrivers: string;
  weekNumber: string;
  operatorName: string;
  operatorBusinessAddress: string;
  cmvPlate: string;
  trailerPlate: string;
  exemptHrs14Day: string;
  signature: string;
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  grid: Status[]; // 96 quarters
  remarks: string;
  startOdometer: string;
  endOdometer: string;
  locked?: boolean;
  sameVehicle?: boolean;
  cmvPlate?: string;
  lastEdited?: string; // ISO timestamp of last edit
}

export interface AuditEntry {
  timestamp: string;
  date?: string; // The date of the log day being edited (if applicable)
  field: string;
  originalValue: string;
  newValue: string;
  editedBy: string;
  reason?: string;
}

export interface WeeklyLog {
  id: string; // The Monday date YYYY-MM-DD
  metadata: WeeklyMetadata;
  days: DayEntry[]; // 7 entries, Monday to Sunday
  auditLog?: AuditEntry[];
}

export type PaintMode = Status | 'cycle';

export interface VehicleProfile {
  id: string;
  friendlyName: string;
  vin: string;
  licensePlate: string;
  mileage: string;
  operatorName: string;
  inspectionDate: string;
}

export interface UserProfile {
  name: string;
  email: string;
  occupations: string[];
  licenseNumber: string;
  licenseExpiry: string;
  medicalExpiry: string;
  firstAidExpiry: string;
  vehicles: VehicleProfile[];
}

export interface Preferences {
  timeFormat: '12h' | '24h';
  theme: 'dark' | 'light';
  showCoDrivers: boolean;
  showTrailerPlate: boolean;
  showExempt: boolean;
  showSleeper: boolean;
  autoSave: boolean;
  showDailyTotals: boolean;
  language: string;
  showTimestamps: boolean;
  showSameVehicle: boolean;
  defaultCycle: '7-Day' | '14-Day';
  defaultDriverName: string;
  defaultOperatorName: string;
  defaultOperatorBusinessAddress: string;
  defaultHomeTerminalAddress: string;
  defaultCmvPlate: string;
  weekStartsOn: 0 | 1;
  userProfile: UserProfile;
  cloudSyncEnabled: boolean;
  cloudSyncPin: string;
  cloudSyncToken: string;
  cloudSyncLastSync: string;
  hideEarlyHours: boolean;
  collapseEarlyHours: boolean;
}

export const DEFAULT_PREFS: Preferences = {
  timeFormat: '24h',
  theme: 'light',
  showCoDrivers: false,
  showTrailerPlate: false,
  showExempt: false,
  showSleeper: false,
  autoSave: true,
  showDailyTotals: true,
  language: 'en',
  showTimestamps: true,
  showSameVehicle: true,
  defaultCycle: '7-Day',
  defaultDriverName: '',
  defaultOperatorName: '',
  defaultOperatorBusinessAddress: '',
  defaultHomeTerminalAddress: '',
  defaultCmvPlate: '',
  weekStartsOn: 1,
  cloudSyncEnabled: false,
  cloudSyncPin: '',
  cloudSyncToken: '',
  cloudSyncLastSync: '',
  hideEarlyHours: false,
  collapseEarlyHours: false,
  userProfile: {
    name: '',
    email: '',
    occupations: [],
    licenseNumber: '',
    licenseExpiry: '',
    medicalExpiry: '',
    firstAidExpiry: '',
    vehicles: []
  }
};

export const APP_VERSION = '0.16.2';
