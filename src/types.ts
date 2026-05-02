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
}

export interface WeeklyLog {
  id: string; // The Monday date YYYY-MM-DD
  metadata: WeeklyMetadata;
  days: DayEntry[]; // 7 entries, Monday to Sunday
}

export type PaintMode = Status | 'cycle';

export interface Preferences {
  timeFormat: '12h' | '24h';
  theme: 'dark' | 'light';
  showCoDrivers: boolean;
  showTrailerPlate: boolean;
  showExempt: boolean;
  showSleeper: boolean;
  viewMode: 'tabs' | 'stacked';
  autoSave: boolean;
  language: string;
  showTimestamps: boolean;
  showSameVehicle: boolean;
  defaultCycle: '7-Day' | '14-Day';
  defaultDriverName: string;
  defaultOperatorName: string;
  defaultOperatorBusinessAddress: string;
  defaultHomeTerminalAddress: string;
  defaultCmvPlate: string;
}

export const DEFAULT_PREFS: Preferences = {
  timeFormat: '24h',
  theme: 'light',
  showCoDrivers: false,
  showTrailerPlate: false,
  showExempt: false,
  showSleeper: false,
  viewMode: 'tabs',
  autoSave: true,
  language: 'en',
  showTimestamps: true,
  showSameVehicle: true,
  defaultCycle: '7-Day',
  defaultDriverName: '',
  defaultOperatorName: '',
  defaultOperatorBusinessAddress: '',
  defaultHomeTerminalAddress: '',
  defaultCmvPlate: '',
};
