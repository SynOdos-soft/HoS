import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { DayEntry, DEFAULT_PREFS, Preferences, Status, WeeklyLog } from '../types';
import {
  MAX_OFFICER_PAYLOAD,
  OFFICER_HASH_PREFIX,
  buildOfficerReport,
  buildOfficerUrl,
  closeOfficerReport,
  decodeGrid,
  decodeOfficerPayload,
  encodeGrid,
  encodeOfficerReport,
  formatQuarterHours,
  officerTotals,
  readOfficerLink,
} from './officerReport';
import { buildQrMatrix } from './qr';
import jsQR from 'jsqr';

const NOW = new Date(2026, 9, 2, 9, 30, 0); // 2026-10-02 local
const PREFS: Preferences = { ...DEFAULT_PREFS, defaultCycle: '7-Day', defaultDriverName: 'Sam Driver' };

const makeGrid = (): Status[] =>
  [
    ...Array<Status>(32).fill('off-duty'),
    ...Array<Status>(32).fill('driving'),
    ...Array<Status>(16).fill('on-duty'),
    ...Array<Status>(16).fill('sleeper'),
  ];

const makeDay = (offsetFromToday: number, overrides: Partial<DayEntry> = {}): DayEntry => ({
  date: format(subDays(NOW, offsetFromToday), 'yyyy-MM-dd'),
  grid: makeGrid(),
  remarks: '',
  startOdometer: '100000',
  endOdometer: '100456',
  locked: true,
  sameVehicle: true,
  cmvPlate: 'ABC-123',
  ...overrides,
});

const makeLog = (days: DayEntry[], overrides: Partial<WeeklyLog> = {}): WeeklyLog => ({
  id: '2026-09-28',
  metadata: {
    homeTerminalAddress: '100 Terminal Rd, Toronto',
    month: '10',
    year: '2026',
    cycle: '7-Day',
    driverName: 'Sam Driver',
    coDrivers: '',
    weekNumber: '40',
    operatorName: 'Acme Hauling Ltd',
    operatorBusinessAddress: '55 King St W, Toronto ON',
    cmvPlate: 'ABC-123',
    trailerPlate: 'TRL-9',
    exemptHrs14Day: '',
    signature: '',
  },
  days,
  ...overrides,
});

describe('grid run-length encoding', () => {
  it('round-trips a typical working day', () => {
    const grid = makeGrid();
    const encoded = encodeGrid(grid);
    expect(encoded).toBe('32o32d16n16s');
    expect(decodeGrid(encoded)).toEqual(grid);
  });

  it('round-trips the worst case (alternating every quarter)', () => {
    const grid = Array.from({ length: 96 }, (_, i) => (i % 2 === 0 ? 'off-duty' : 'driving') as Status);
    expect(decodeGrid(encodeGrid(grid))).toEqual(grid);
  });

  it('pads short or damaged grids back to 96 slots', () => {
    const decoded = decodeGrid('10d');
    expect(decoded).toHaveLength(96);
    expect(decoded.slice(0, 10)).toEqual(Array<Status>(10).fill('driving'));
    expect(decoded[10]).toBe('off-duty');
    expect(encodeGrid([])).toBe('96o');
  });
});

describe('officer report payload', () => {
  it('round-trips identity, days and remarks through the encoded payload', () => {
    const remarks = 'Dropped trailer at yard ~ 100% ready; 2h delay #traffic é';
    const logs = [makeLog([makeDay(0, { remarks }), makeDay(2)])];
    const report = buildOfficerReport(logs, PREFS, NOW);

    const payload = encodeOfficerReport(report);
    const decoded = decodeOfficerPayload(payload);

    expect(decoded.driver).toBe('Sam Driver');
    expect(decoded.operator).toBe('Acme Hauling Ltd');
    expect(decoded.plate).toBe('ABC-123');
    expect(decoded.trailer).toBe('TRL-9');
    expect(decoded.cycle).toBe('7-Day');
    expect(decoded.startDate).toBe(format(subDays(NOW, 14), 'yyyy-MM-dd'));
    expect(decoded.days).toHaveLength(15);

    const today = decoded.days[14];
    expect(today.recorded).toBe(true);
    expect(today.remarks).toBe(remarks);
    expect(today.startOdometer).toBe('100000');
    expect(today.endOdometer).toBe('100456');
    expect(today.distanceKm).toBe(456);
    expect(today.grid).toEqual(makeGrid());
    expect(today.plate).toBe('ABC-123');
  });

  it('marks empty days explicitly instead of inventing data', () => {
    const report = buildOfficerReport([makeLog([makeDay(1)])], PREFS, NOW);
    const decoded = decodeOfficerPayload(encodeOfficerReport(report));

    expect(decoded.days[14].recorded).toBe(false);
    expect(decoded.days[14].date).toBe(format(NOW, 'yyyy-MM-dd'));
    expect(decoded.days[14].grid.every(slot => slot === 'off-duty')).toBe(true);
    expect(decoded.days[13].recorded).toBe(true);
  });

  it('flags days edited after the fact', () => {
    // A stamp clearly on the following day, independent of the runner's TZ.
    const laterEdit = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const report = buildOfficerReport(
      [makeLog([makeDay(1, { lastEdited: laterEdit })])],
      PREFS,
      NOW
    );
    const decoded = decodeOfficerPayload(encodeOfficerReport(report));
    expect(decoded.days[13].editedLater).toBe(true);
    expect(decoded.days[14].editedLater).toBe(false);
  });

  it('stays under the QR ceiling by trimming the longest remarks', () => {
    const report = buildOfficerReport([makeLog([makeDay(0)])], PREFS, NOW);
    const original = report.days.map((_, i) => `Leg ${i} ` + `${i}ab `.repeat(60));
    report.days.forEach((day, i) => {
      day.recorded = true;
      day.remarks = original[i];
    });

    const payload = encodeOfficerReport(report);
    expect(payload.length).toBeLessThanOrEqual(MAX_OFFICER_PAYLOAD);

    const decoded = decodeOfficerPayload(payload);
    expect(decoded.days).toHaveLength(15);
    decoded.days.forEach((day, i) => {
      if (day.remarks) expect(day.remarks.startsWith(`Leg ${i} `)).toBe(true);
    });
    // Trimming really happened rather than the payload quietly overflowing.
    expect(decoded.days.some((day, i) => day.remarks.length < original[i].length)).toBe(true);
  });

  it('prefers the newest day that has real data for the header identity', () => {
    const logs = [
      makeLog([makeDay(0)], {
        metadata: { ...makeLog([]).metadata, operatorName: 'Fresh Carrier Inc', driverName: 'New Driver' },
      }),
    ];
    const report = buildOfficerReport(logs, PREFS, NOW);
    expect(report.operator).toBe('Fresh Carrier Inc');
    expect(report.driver).toBe('New Driver');
  });
});

describe('readOfficerLink', () => {
  it('ignores ordinary app locations', () => {
    expect(readOfficerLink('')).toBeNull();
    expect(readOfficerLink('#/dashboard')).toBeNull();
    expect(readOfficerLink('#')).toBeNull();
    expect(readOfficerLink('https://log.example.com/dashboard?code=abc&state=xyz')).toBeNull();
  });

  it('returns the report for a generated ?o= link', () => {
    const report = buildOfficerReport([makeLog([makeDay(0)])], PREFS, NOW);
    const url = buildOfficerUrl(report, 'https://log.example.com/');
    expect(url.startsWith('https://log.example.com/?o=')).toBe(true);
    expect(url).not.toContain('#'); // the point of this link shape

    const link = readOfficerLink(url);
    expect(link).not.toBeNull();
    expect('report' in link! && link.report.days[14].recorded).toBe(true);
  });

  it('reports a readable error instead of crashing on a damaged payload', () => {
    const damaged = readOfficerLink('https://log.example.com/?o=not-a-real-payload');
    expect(damaged).not.toBeNull();
    expect('error' in damaged!).toBe(true);

    const legacyDamaged = readOfficerLink(`${OFFICER_HASH_PREFIX}not-a-real-payload`);
    expect(legacyDamaged).not.toBeNull();
    expect('error' in legacyDamaged!).toBe(true);
  });

  it('hides the report behind an opaque token in the URL', () => {
    const report = buildOfficerReport(
      [makeLog([makeDay(0, { remarks: 'Delayed at the scale' })])],
      PREFS,
      NOW
    );
    const url = buildOfficerUrl(report, 'https://log.example.com/');
    const token = new URL(url).searchParams.get('o') || '';

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // No percent-escapes, colons or spaces survive — so no readable
    // names, dates or remarks in the address bar or in browser history.
    expect(url).not.toContain('%');
    expect(url).not.toContain('v:1'); // no readable payload structure
    expect(url).not.toContain(' ');
    expect(url).not.toContain('Sam Driver');
    expect(url).not.toContain('Delayed at the scale');

    const link = readOfficerLink(url);
    expect('report' in link! && link.report.driver).toBe('Sam Driver');
    expect('report' in link! && link.report.days[14].remarks).toBe('Delayed at the scale');
  });

  it('still reads a link generated before the payload was obfuscated', () => {
    const legacy =
      'v:1~gen:1790947800000~st:2026-09-18~dv:Sam%20Driver~op:~oa:~ht:~cy:7-Day~pl:ABC-123~tp:~cd:~x~g:96o';
    const link = readOfficerLink(`${OFFICER_HASH_PREFIX}${legacy}`);
    expect('report' in link!).toBe(true);
    expect('report' in link! && link.report.driver).toBe('Sam Driver');
    expect('report' in link! && link.report.days).toHaveLength(2);
  });

  it('closes officer mode by stripping the token, leaving history clean', () => {
    window.history.replaceState(null, '', '/?o=abc123&keep=1#legacy');
    let popped = 0;
    window.addEventListener('popstate', () => popped++);

    closeOfficerReport();

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('');
    expect(popped).toBe(1);
    expect(readOfficerLink(window.location.href)).toBeNull();

    window.history.replaceState(null, '', '/');
  });

  it('produces an ASCII-only, query-safe URL', () => {
    const report = buildOfficerReport([makeLog([makeDay(0, { remarks: 'café & 100% "quoted" ~' })])], PREFS, NOW);
    const url = buildOfficerUrl(report, 'https://log.example.com/');
    expect(url).toMatch(/^[\x20-\x7E]+$/);
    // Nothing RFC 3986 would make a browser or scanner mangle.
    expect(url).not.toMatch(/[<>{}|\\^`"#]/);
  });
});

describe('officer display helpers', () => {
  it('totals quarters per status', () => {
    expect(officerTotals(makeGrid())).toEqual({ off: 32, driving: 32, onDuty: 16, sleeper: 16 });
  });

  it('formats quarter-hours for large type', () => {
    expect(formatQuarterHours(32)).toBe('8h');
    expect(formatQuarterHours(33)).toBe('8h 15m');
    expect(formatQuarterHours(2)).toBe('0h 30m');
  });
});

describe('buildQrMatrix', () => {
  it('renders a scannable-size matrix with finder patterns', () => {
    const matrix = buildQrMatrix('https://log.example.com/#/officer/abc123');
    expect(matrix).not.toBeNull();
    expect(matrix!.size).toBeGreaterThanOrEqual(21);
    expect(matrix!.path).toContain('M0 0h1v1h-1z'); // top-left finder corner
    expect(matrix!.path).toContain('M0 6h1v1h-1z'); // bottom-left of that finder
  });

  it('gives up cleanly when the data cannot fit any QR version', () => {
    expect(buildQrMatrix('x'.repeat(4000))).toBeNull();
  });

  it('percent-encodes non-ASCII input instead of throwing', () => {
    const matrix = buildQrMatrix('https://log.example.com/#/officer/caf%C3%A9-é');
    expect(matrix).not.toBeNull();
    expect(matrix!.path.length).toBeGreaterThan(0);
  });

  it('decodes back to the exact handoff URL an officer would scan', () => {
    const report = buildOfficerReport(
      [makeLog([makeDay(0, { remarks: 'Delayed at the scale ~ 100% paperwork #weather' })])],
      PREFS,
      NOW
    );
    const url = buildOfficerUrl(report, 'https://log.example.com/');
    const matrix = buildQrMatrix(url);
    expect(matrix).not.toBeNull();

    // Rasterise the matrix the way a phone camera would see it.
    const quiet = 4;
    const scale = 6;
    const dim = (matrix!.size + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let row = 0; row < matrix!.size; row++) {
      for (let col = 0; col < matrix!.size; col++) {
        if (!matrix!.isDark(row, col)) continue;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) {
            const px = ((quiet + row) * scale + y) * dim + ((quiet + col) * scale + x);
            pixels[px * 4] = 15;
            pixels[px * 4 + 1] = 23;
            pixels[px * 4 + 2] = 42;
            pixels[px * 4 + 3] = 255;
          }
        }
      }
    }

    const decoded = jsQR(pixels, dim, dim);
    expect(decoded?.data).toBe(url);
  });
});
