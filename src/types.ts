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
}

export const DEFAULT_PREFS: Preferences = {
  timeFormat: '24h',
  theme: 'dark',
  showCoDrivers: true,
  showTrailerPlate: true,
  showExempt: true,
  showSleeper: true,
  viewMode: 'tabs',
  autoSave: true,
  language: 'en',
  showTimestamps: true,
};
