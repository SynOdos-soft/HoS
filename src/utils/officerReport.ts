import { DayEntry, Preferences, Status, WeeklyLog, WeeklyMetadata } from '../types';
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns';

/** The roadside record covers the last 15 calendar days (Ontario HOS). */
export const OFFICER_DAYS = 15;

/** Hash prefix used by links generated before the query-param form existed. */
export const OFFICER_HASH_PREFIX = '#/officer/';

/**
 * Query parameter that carries the report token. Using the query string keeps
 * the "#" out of the URL; note this trades away the fragment's one privilege
 * — the token is now part of the request the phone sends to the host.
 */
export const OFFICER_QUERY_PARAM = 'o';

/**
 * Hard ceiling for the encoded token. A version-40 QR in byte mode holds 2953
 * characters at error-correction level L, so stay just under that to keep the
 * code scannable from a phone screen or a printout.
 */
export const MAX_OFFICER_PAYLOAD = 2900;

/** Remarks are clipped before encoding so long notes cannot blow the budget. */
const MAX_REMARKS = 120;

const EMPTY_METADATA: WeeklyMetadata = {
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

export interface OfficerDay {
  /** yyyy-MM-dd (derived from startDate + index when decoded). */
  date: string;
  /** false when nothing was logged — the officer sees an explicit "no record". */
  recorded: boolean;
  grid: Status[];
  remarks: string;
  startOdometer: string;
  endOdometer: string;
  distanceKm: number;
  plate: string;
  /** true when the day was edited after its log date — an integrity flag. */
  editedLater: boolean;
}

export interface OfficerReport {
  /** epoch ms of report generation */
  generatedAt: number;
  /** yyyy-MM-dd of the oldest day in the report */
  startDate: string;
  driver: string;
  operator: string;
  operatorAddress: string;
  homeTerminal: string;
  cycle: string;
  plate: string;
  trailer: string;
  coDriver: string;
  /** exactly OFFICER_DAYS entries, oldest first */
  days: OfficerDay[];
}

export type OfficerLink = { report: OfficerReport } | { error: string } | null;

// --- Grid helpers ---------------------------------------------------------

const STATUS_TO_CODE: Record<Status, string> = {
  'off-duty': 'o',
  sleeper: 's',
  driving: 'd',
  'on-duty': 'n',
};

const CODE_TO_STATUS: Record<string, Status> = {
  o: 'off-duty',
  s: 'sleeper',
  d: 'driving',
  n: 'on-duty',
};

const emptyGrid = (): Status[] => Array.from({ length: 96 }, () => 'off-duty' as Status);

const VALID_STATUSES: readonly Status[] = ['off-duty', 'sleeper', 'driving', 'on-duty'];

/** Pads / repairs a grid to exactly 96 slots so encoding can never overflow. */
const normalizeGrid = (grid: Status[] | undefined): Status[] => {
  const out: Status[] = [];
  if (Array.isArray(grid)) {
    for (const status of grid) {
      if (out.length >= 96) break;
      out.push(VALID_STATUSES.includes(status) ? status : 'off-duty');
    }
  }
  while (out.length < 96) out.push('off-duty');
  return out;
};

/** Run-length encode the 96 quarter-hour slots: "96o" or "24o4d68o". */
export const encodeGrid = (grid: Status[]): string => {
  const normalized = normalizeGrid(grid);
  let out = '';
  let i = 0;
  while (i < normalized.length) {
    const code = STATUS_TO_CODE[normalized[i]] ?? 'o';
    let run = 1;
    while (i + run < normalized.length && (STATUS_TO_CODE[normalized[i + run]] ?? 'o') === code) run++;
    out += `${run}${code}`;
    i += run;
  }
  return out;
};

/** Inverse of encodeGrid — always returns exactly 96 slots. */
export const decodeGrid = (encoded: string): Status[] => {
  const grid: Status[] = [];
  const pattern = /(\d+)([osdn])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(encoded)) !== null) {
    const run = Number(match[1]);
    const status = CODE_TO_STATUS[match[2]];
    if (!status || !Number.isFinite(run) || run <= 0) continue;
    for (let i = 0; i < run && grid.length < 96; i++) grid.push(status);
    if (grid.length >= 96) break;
  }
  while (grid.length < 96) grid.push('off-duty');
  return grid;
};

// --- Payload encoding -----------------------------------------------------

/**
 * Values are percent-encoded (plus "~", which separates records) so the whole
 * payload stays inside the RFC 3986 fragment character set — it can be pasted
 * straight into a URL and a QR code without any character surprises.
 */
const enc = (value: string): string => encodeURIComponent(value).replace(/~/g, '%7E');

const dec = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * The serialized report is wrapped in a URL-safe base64 token before it ever
 * reaches the address bar, so a glance at the QR, the link box or browser
 * history shows `#/officer/3q2-7w…` instead of a driver's name and remarks.
 *
 * This is obfuscation, not secrecy: no key is involved, anyone can decode it,
 * and the QR still carries the full report to whoever scans it. Its job is to
 * keep personal details out of shoulder-surfed screens and saved history.
 */
const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  // Chunked so the spread never exceeds the argument-count limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string): string => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const serialize = (report: OfficerReport): string => {
  const header = [
    'v:1',
    `gen:${report.generatedAt}`,
    `st:${report.startDate}`,
    `dv:${enc(report.driver)}`,
    `op:${enc(report.operator)}`,
    `oa:${enc(report.operatorAddress)}`,
    `ht:${enc(report.homeTerminal)}`,
    `cy:${enc(report.cycle)}`,
    `pl:${enc(report.plate)}`,
    `tp:${enc(report.trailer)}`,
    `cd:${enc(report.coDriver)}`,
  ].join('~');

  const records = report.days.map(day => {
    if (!day.recorded) return 'x';
    const fields = [`g:${encodeGrid(day.grid)}`];
    if (day.remarks) fields.push(`r:${enc(day.remarks)}`);
    if (day.startOdometer) fields.push(`s:${enc(day.startOdometer)}`);
    if (day.endOdometer) fields.push(`e:${enc(day.endOdometer)}`);
    if (day.distanceKm) fields.push(`k:${Math.round(day.distanceKm)}`);
    if (day.plate && day.plate !== report.plate) fields.push(`p:${enc(day.plate)}`);
    if (day.editedLater) fields.push('m:1');
    return fields.join('~');
  });

  return [header, ...records].join('~');
};

/**
 * Serialize a report and shrink it until the *encoded* token fits a QR code.
 * Long remarks are trimmed first (oldest notes give way before recent ones
 * keep their detail), then the boilerplate address fields as a last resort.
 */
export const encodeOfficerReport = (report: OfficerReport): string => {
  const draft: OfficerReport = { ...report, days: report.days.map(day => ({ ...day })) };
  let payload = toBase64Url(serialize(draft));

  while (payload.length > MAX_OFFICER_PAYLOAD) {
    let target: OfficerDay | undefined;
    for (const day of draft.days) {
      if (day.remarks.length > 0 && (!target || day.remarks.length > target.remarks.length)) target = day;
    }
    if (!target) break;
    target.remarks = target.remarks.slice(0, Math.floor(target.remarks.length * 0.6));
    if (target.remarks.length < 4) target.remarks = '';
    payload = toBase64Url(serialize(draft));
  }

  if (payload.length > MAX_OFFICER_PAYLOAD) {
    draft.operatorAddress = '';
    draft.homeTerminal = '';
    draft.coDriver = '';
    payload = toBase64Url(serialize(draft));
  }

  if (payload.length > MAX_OFFICER_PAYLOAD) {
    throw new Error(`Report is too large for a QR code (${payload.length} characters).`);
  }
  return payload;
};

const emptyDay = (date: string): OfficerDay => ({
  date,
  recorded: false,
  grid: emptyGrid(),
  remarks: '',
  startOdometer: '',
  endOdometer: '',
  distanceKm: 0,
  plate: '',
  editedLater: false,
});

export const decodeOfficerPayload = (payload: string): OfficerReport => {
  // Unwrap the base64 token. Links generated before the payload was
  // obfuscated carried the plain text directly — keep reading those so an
  // already-printed QR does not suddenly die.
  let raw = payload;
  try {
    const unwrapped = fromBase64Url(payload);
    if (unwrapped.startsWith('v:1~')) raw = unwrapped;
  } catch {
    // Not base64 — fall through and let structural validation explain why.
  }

  const fields = raw.split('~');
  if (!fields.length || fields[0].indexOf('v:1') !== 0) {
    throw new Error('This link is not a Synodos inspection report.');
  }

  const header: Record<string, string> = {};
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  for (const field of fields) {
    if (field === 'x') {
      // Explicit "nothing was logged" day marker.
      records.push({});
      current = null;
      continue;
    }
    const sep = field.indexOf(':');
    const key = sep === -1 ? field : field.slice(0, sep);
    const value = sep === -1 ? '' : field.slice(sep + 1);
    if (key === 'g') {
      current = {};
      records.push(current);
      current.g = value;
      continue;
    }
    if (current) {
      current[key] = value;
      continue;
    }
    header[key] = value;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(header.st || '')) {
    throw new Error('This inspection link is missing its date range.');
  }

  const startDate = parseISO(header.st);
  const plate = dec(header.pl || '');

  const days = records.slice(0, OFFICER_DAYS * 2).map((record, index) => {
    const date = format(addDays(startDate, index), 'yyyy-MM-dd');
    if (!record.g) return emptyDay(date);
    const km = Number(record.k);
    return {
      date,
      recorded: true,
      grid: decodeGrid(record.g),
      remarks: dec(record.r || '').slice(0, MAX_REMARKS * 2),
      startOdometer: dec(record.s || ''),
      endOdometer: dec(record.e || ''),
      distanceKm: Number.isFinite(km) ? km : 0,
      plate: dec(record.p || '') || plate,
      editedLater: record.m === '1',
    } satisfies OfficerDay;
  });

  return {
    generatedAt: Number(header.gen) || 0,
    startDate: header.st,
    driver: dec(header.dv || ''),
    operator: dec(header.op || ''),
    operatorAddress: dec(header.oa || ''),
    homeTerminal: dec(header.ht || ''),
    cycle: dec(header.cy || '7-Day'),
    plate,
    trailer: dec(header.tp || ''),
    coDriver: dec(header.cd || ''),
    days,
  };
};

const linkFromToken = (token: string): OfficerLink => {
  if (!token) return { error: 'This inspection link is empty.' };
  try {
    return { report: decodeOfficerPayload(token) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'This inspection link could not be read.' };
  }
};

/**
 * Classify a location: null = ordinary app URL, otherwise the link result.
 *
 * Accepts a full href (`https://host/?o=<token>` — the current form) or a bare
 * `#/officer/<token>` fragment, so links printed before the switch keep
 * opening instead of dying on the officer's phone.
 */
export const readOfficerLink = (location: string): OfficerLink => {
  if (!location) return null;
  try {
    const url = new URL(location, 'http://local.invalid');
    const token = url.searchParams.get(OFFICER_QUERY_PARAM);
    if (token !== null) return linkFromToken(token);
  } catch {
    // Not a parsable URL — fall through to the fragment check below.
  }

  const marker = location.indexOf(OFFICER_HASH_PREFIX);
  if (marker === -1) return null;
  return linkFromToken(location.slice(marker + OFFICER_HASH_PREFIX.length));
};

/** Full URL an officer can scan: app origin + `?o=<token>` — no "#". */
export const buildOfficerUrl = (report: OfficerReport, base?: string): string => {
  const root = base ?? (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  return `${root}?${OFFICER_QUERY_PARAM}=${encodeOfficerReport(report)}`;
};

/**
 * Leave officer mode and land back in the app. The token is stripped with
 * `replaceState` (no reload, no history entry) and a synthetic `popstate` is
 * dispatched because that is how the app watches the location.
 */
export const closeOfficerReport = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(OFFICER_QUERY_PARAM);
  url.hash = ''; // legacy "#/officer/" links leave nothing behind either
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event('popstate'));
};

// --- Report construction --------------------------------------------------

const hasDayData = (day: DayEntry): boolean =>
  (day.grid || []).some(value => value !== 'off-duty') ||
  !!day.remarks ||
  !!day.startOdometer ||
  !!day.endOdometer;

const dayDistance = (day: DayEntry): number => {
  const spans = [
    { start: day.startOdometer, end: day.endOdometer },
    ...(day.additionalVehicles || []).map(vehicle => ({ start: vehicle.startOdometer, end: vehicle.endOdometer })),
  ];
  return spans.reduce((sum, span) => {
    const start = Number(span.start);
    const end = Number(span.end);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start && span.start !== '' && span.end !== ''
      ? sum + end - start
      : sum;
  }, 0);
};

const wasEditedLater = (day: DayEntry): boolean => {
  if (!day.lastEdited) return false;
  const edited = new Date(day.lastEdited);
  if (Number.isNaN(edited.getTime())) return false;
  return format(edited, 'yyyy-MM-dd') !== day.date;
};

/** Collect the same 15 days the roadside PDF renders, as an officer-friendly report. */
export const buildOfficerReport = (
  logs: WeeklyLog[],
  preferences: Preferences,
  now: Date = new Date()
): OfficerReport => {
  const dayMap = new Map<string, { day: DayEntry; metadata: WeeklyMetadata }>();

  for (const log of logs) {
    if (log.deleted) continue;
    const metadata = log.metadata || EMPTY_METADATA;
    for (const day of log.days || []) {
      const existing = dayMap.get(day.date);
      if (!existing) {
        dayMap.set(day.date, { day, metadata });
        continue;
      }
      const existingActive = hasDayData(existing.day);
      const newActive = hasDayData(day);
      if (newActive && !existingActive) {
        dayMap.set(day.date, { day, metadata });
      } else if (!newActive && !existingActive && metadata.cycle === preferences.defaultCycle) {
        dayMap.set(day.date, { day, metadata });
      }
    }
  }

  const startDate = subDays(now, OFFICER_DAYS - 1);
  const dates = Array.from({ length: OFFICER_DAYS }, (_, index) => format(addDays(startDate, index), 'yyyy-MM-dd'));

  // Header identity: newest day that actually has data wins, then this week's
  // log, then nothing — blanks fall back to the saved driver defaults below.
  let source: WeeklyMetadata | undefined;
  for (let i = dates.length - 1; i >= 0; i--) {
    const entry = dayMap.get(dates[i]);
    if (entry && hasDayData(entry.day)) {
      source = entry.metadata;
      break;
    }
  }
  if (!source) {
    const weekId = format(startOfWeek(now, { weekStartsOn: preferences.weekStartsOn }), 'yyyy-MM-dd');
    source = logs.find(log => !log.deleted && log.id === weekId)?.metadata;
  }
  const meta = source || EMPTY_METADATA;

  const days: OfficerDay[] = dates.map(date => {
    const day = dayMap.get(date)?.day;
    if (!day || !hasDayData(day)) return emptyDay(date);
    return {
      date,
      recorded: true,
      grid: normalizeGrid(day.grid),
      remarks: (day.remarks || '').slice(0, MAX_REMARKS),
      startOdometer: day.startOdometer || '',
      endOdometer: day.endOdometer || '',
      distanceKm: dayDistance(day),
      plate: day.cmvPlate || meta.cmvPlate || '',
      editedLater: wasEditedLater(day),
    };
  });

  return {
    generatedAt: now.getTime(),
    startDate: dates[0],
    driver: meta.driverName || preferences.defaultDriverName || '',
    operator: meta.operatorName || preferences.defaultOperatorName || '',
    operatorAddress: meta.operatorBusinessAddress || preferences.defaultOperatorBusinessAddress || '',
    homeTerminal: meta.homeTerminalAddress || preferences.defaultHomeTerminalAddress || '',
    cycle: meta.cycle || preferences.defaultCycle,
    plate: meta.cmvPlate || preferences.defaultCmvPlate || '',
    trailer: meta.trailerPlate || '',
    coDriver: meta.coDrivers || '',
    days,
  };
};

// --- Display helpers (shared by the officer screen and its tests) ---------

export interface OfficerTotals {
  off: number;
  sleeper: number;
  driving: number;
  onDuty: number;
}

/** Totals in whole 15-minute quarters so hour/minute rendering stays exact. */
export const officerTotals = (grid: Status[]): OfficerTotals => {
  const totals: OfficerTotals = { off: 0, sleeper: 0, driving: 0, onDuty: 0 };
  for (const slot of grid) {
    if (slot === 'driving') totals.driving++;
    else if (slot === 'sleeper') totals.sleeper++;
    else if (slot === 'on-duty') totals.onDuty++;
    else totals.off++;
  }
  return totals;
};

/** 7h / 7h 15m / 0h 30m — the large-type format used on the officer screen. */
export const formatQuarterHours = (quarters: number): string => {
  const hours = Math.floor(quarters / 4);
  const minutes = (quarters % 4) * 15;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};
