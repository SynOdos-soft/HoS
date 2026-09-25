import { WeeklyLog, WeeklyMetadata, DayEntry, Preferences, DEFAULT_PREFS } from '../types';

export const makeMeta = (over: Partial<WeeklyMetadata> = {}): WeeklyMetadata => ({
  homeTerminalAddress: '',
  month: 'September',
  year: '2026',
  cycle: '7-Day',
  driverName: 'Jade',
  coDrivers: '',
  weekNumber: '39',
  operatorName: 'Acme',
  operatorBusinessAddress: '',
  cmvPlate: 'ABC123',
  trailerPlate: '',
  exemptHrs14Day: '',
  signature: '',
  ...over,
});

let dayCounter = 0;
export const resetDayCounter = () => { dayCounter = 0; };
export const makeDay = (over: Partial<DayEntry> = {}): DayEntry => ({
  date: over.date ?? `2026-09-2${dayCounter++ % 7}`,
  grid: Array(96).fill('off-duty'),
  remarks: '',
  startOdometer: '',
  endOdometer: '',
  additionalVehicles: [],
  locked: false,
  sameVehicle: true,
  cmvPlate: 'ABC123',
  lastEdited: new Date().toISOString(),
  ...over,
});

export const makeWeek = (id = '2026-09-21', days?: DayEntry[], updatedAt?: string): WeeklyLog => ({
  id,
  metadata: makeMeta(),
  days: days ?? Array.from({ length: 7 }, (_, i) => makeDay({ date: `${id.slice(0, 8)}${String(Number(id.slice(8)) + i).padStart(2, '0')}` })),
  auditLog: [],
  ...(updatedAt ? { updatedAt } : {}),
});

export const makePrefs = (over: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFS,
  defaultDriverName: 'Jade',
  ...over,
});
