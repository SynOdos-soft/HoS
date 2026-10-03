import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { DayEntry, DEFAULT_PREFS, Preferences, Status, WeeklyLog } from '../types';
import {
  buildOfficerReport,
  buildOfficerUrl,
  readOfficerLink,
  decodeGrid,
  decodeOfficerPayload,

  encodeGridCompact,
  encodeOfficerReport,
  MAX_OFFICER_PAYLOAD,
} from './officerReport';
import { daysUntilExpiry, hashToken, isShortToken, readShortToken } from './officerShare';

const NOW = new Date(2026, 9, 2, 9, 30, 0);
const PREFS: Preferences = { ...DEFAULT_PREFS, defaultCycle: '7-Day', defaultDriverName: 'Sam Driver' };

const makeGrid = (): Status[] =>
  [...Array<Status>(32).fill('off-duty'), ...Array<Status>(32).fill('driving'),
   ...Array<Status>(16).fill('on-duty'), ...Array<Status>(16).fill('sleeper')];

/** Worst realistic case: short alternating runs defeat run-length encoding. */
const fragmentedGrid = (): Status[] =>
  Array.from({ length: 96 }, (_, i) =>
    i % 7 === 0 ? 'driving' : i % 5 === 0 ? 'on-duty' : i % 3 === 0 ? 'sleeper' : 'off-duty'
  ) as Status[];

const makeDay = (offset: number, overrides: Partial<DayEntry> = {}): DayEntry => ({
  date: format(subDays(NOW, offset), 'yyyy-MM-dd'),
  grid: makeGrid(), remarks: '', startOdometer: '100000', endOdometer: '100456',
  locked: true, sameVehicle: true, cmvPlate: 'ABC-123', ...overrides,
});

const makeLog = (days: DayEntry[]): WeeklyLog => ({
  id: '2026-09-28',
  metadata: {
    homeTerminalAddress: '100 Terminal Rd, Toronto', month: '10', year: '2026',
    cycle: '7-Day', driverName: 'Sam Driver', coDrivers: '', weekNumber: '40',
    operatorName: 'Acme Hauling Ltd', operatorBusinessAddress: '55 King St W, Toronto ON',
    cmvPlate: 'ABC-123', trailerPlate: 'TRL-9', exemptHrs14Day: '', signature: '',
  },
  days,
});

describe('compact grid encoding', () => {
  it('keeps run-length encoding when it is already compact', () => {
    const encoded = encodeGridCompact(makeGrid());
    expect(encoded.startsWith('!')).toBe(false);
    expect(decodeGrid(encoded)).toEqual(makeGrid());
  });

  it('falls back to the fixed-width form when runs are fragmented', () => {
    const grid = fragmentedGrid();
    const encoded = encodeGridCompact(grid);
    expect(encoded.startsWith('!')).toBe(true);
    // Bounded: 96 two-bit slots is always 32 base64 characters.
    expect(encoded.length).toBe(33); // "!" + 32 base64 chars
  });

  it('round-trips a fragmented grid exactly', () => {
    const grid = fragmentedGrid();
    const compact = encodeGridCompact(grid);
    const { report } = { report: decodeOfficerPayload(toPayload(grid)) };
    expect(report.days[0].grid).toEqual(grid);
    expect(compact.startsWith('!')).toBe(true);
  });

  it('round-trips every status code through the packed form', () => {
    const grid = Array.from({ length: 96 }, (_, i) => (i % 4) as 0 | 1 | 2 | 3)
      .map(i => (['off-duty', 'sleeper', 'driving', 'on-duty'] as Status[])[i]) as Status[];
    const payload = toPayload(grid);
    expect(decodeOfficerPayload(payload).days[0].grid).toEqual(grid);
  });

  const toPayload = (grid: Status[]) =>
    serializeReport([makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i, { grid })))]);
});

const serializeReport = (logs: WeeklyLog[]) =>
  encodeOfficerReport(buildOfficerReport(logs, PREFS, NOW));

describe('report size is bounded by the data, not the grid shape', () => {
  it('encodes a fully fragmented 15-day report instead of throwing', () => {
    const payload = serializeReport([
      makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i, { grid: fragmentedGrid() }))),
    ]);
    expect(payload.length).toBeLessThanOrEqual(MAX_OFFICER_PAYLOAD);
  });

  it('stays within budget with long remarks on fragmented days', () => {
    const payload = serializeReport([
      makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i, {
        grid: fragmentedGrid(),
        remarks: 'Long roadside note about traffic, weather and a delay at the border crossing.',
      }))),
    ]);
    expect(payload.length).toBeLessThanOrEqual(MAX_OFFICER_PAYLOAD);
  });

  it('keeps the decoded report faithful after packing', () => {
    const grid = fragmentedGrid();
    const decoded = decodeOfficerPayload(
      serializeReport([makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i, { grid })))]),
    );
    expect(decoded.days).toHaveLength(15);
    decoded.days.forEach(day => expect(day.grid).toEqual(grid));
  });

  it('still produces a QR-safe URL', () => {
    const url = buildOfficerUrl(
      buildOfficerReport([makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i, { grid: fragmentedGrid() })))], PREFS, NOW),
      'https://log.example.com/',
    );
    expect(url).not.toMatch(/[<>{}|^"#]/);
  });
});

describe('officer share tokens', () => {
  it('hashes a token to 64 lowercase hex characters', async () => {
    const hash = await hashToken('some-token-value');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes deterministically', async () => {
    expect(await hashToken('abc')).toBe(await hashToken('abc'));
  });

  it('recognises a short token but not an inline payload', () => {
    expect(isShortToken('a'.repeat(43))).toBe(true);
    // Inline tokens are long base64 and routinely contain a dot.
    expect(isShortToken('djoxfmdlbjoxNzkwOTQ3ODAwMDAwfnN0OjIwMjYtMDktMTh-ZHY6U2FtJTIwRHJpdmVy')).toBe(false);
    expect(isShortToken('short')).toBe(false);
  });

  it('reads a short token out of a URL and ignores anything else', () => {
    const token = 'a'.repeat(43);
    expect(readShortToken(`https://hos.synodos.app/?o=${token}`)).toBe(token);
    expect(readShortToken('https://hos.synodos.app/')).toBe('');
    expect(readShortToken('https://hos.synodos.app/#/officer/abc')).toBe('');
  });

  it('computes whole days until expiry', () => {
    const now = Date.parse('2026-10-02T00:00:00Z');
    expect(daysUntilExpiry('2026-10-09T00:00:00Z', now)).toBe(7);
    expect(daysUntilExpiry('2026-10-05T00:00:00Z', now)).toBe(3);
    expect(daysUntilExpiry('2026-09-01T00:00:00Z', now)).toBe(0);
    expect(daysUntilExpiry(null)).toBeNull();
  });
});
describe('offline inline QR is disabled', () => {
  it('no longer generates inline-token links from the app', async () => {
    // The handoff modal publishes to the server and offers the printed PDF when
    // that fails. Guard against a regression reintroducing the long offline QR,
    // which could neither be shortened nor expired.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/components/HandoffModal.tsx', 'utf8');
    expect(source).not.toContain('buildOfficerUrl');
    expect(source).not.toContain('linkOfflineFallback');
  });

  it('still opens an inline token from an already-printed QR', () => {
    // Disabling generation must not break codes printed by earlier versions.
    const report = buildOfficerReport([makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i)))], PREFS, NOW);
    const legacy = buildOfficerUrl(report, 'https://log.example.com/');
    const link = readOfficerLink(legacy);
    expect(link && 'report' in link).toBe(true);
  });

  it('still opens a legacy hash-fragment officer link', () => {
    const report = buildOfficerReport([makeLog(Array.from({ length: 15 }, (_, i) => makeDay(i)))], PREFS, NOW);
    const token = encodeOfficerReport(report);
    const link = readOfficerLink(`https://log.example.com/#/officer/${token}`);
    expect(link && 'report' in link).toBe(true);
  });
});
