import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Coffee, Bed, Briefcase, Route, Shield, Pencil, FileText } from 'lucide-react';
import { APP_VERSION, Status } from '../types';
import { SteeringWheel } from './Icons';
import {
  OfficerDay,
  OfficerReport as OfficerReportData,
  formatQuarterHours,
  officerTotals,
  closeOfficerReport,
} from '../utils/officerReport';

const STATUS_COLOR: Record<Status, string> = {
  'off-duty': 'var(--status-off-duty)',
  sleeper: 'var(--status-sleeper)',
  driving: 'var(--status-driving)',
  'on-duty': 'var(--status-on-duty)',
};

/** 24-hour duty bar built from the 96 quarter-hour slots. */
const DayBar: React.FC<{ grid: Status[] }> = ({ grid }) => {
  const segments = useMemo(() => {
    const out: { status: Status; length: number }[] = [];
    for (const slot of grid) {
      const last = out[out.length - 1];
      if (last && last.status === slot) last.length++;
      else out.push({ status: slot, length: 1 });
    }
    return out;
  }, [grid]);

  return (
    <div className="officer-bar" aria-hidden="true">
      {segments.map((segment, index) => (
        <span
          key={index}
          style={{ flexGrow: segment.length, background: STATUS_COLOR[segment.status] }}
        />
      ))}
    </div>
  );
};

const Total: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({
  icon,
  label,
  value,
  color,
}) => (
  <div className="officer-total">
    <b style={{ color }}>{value}</b>
    <span>{icon} {label}</span>
  </div>
);

const DayCard: React.FC<{ day: OfficerDay; cycle: string; isToday: boolean }> = ({ day, cycle, isToday }) => {
  const totals = officerTotals(day.grid);

  return (
    <article className={`officer-day${isToday ? ' officer-day-today' : ''}`}>
      <header className="officer-day-head">
        <h3 className="officer-date">{format(parseISO(day.date), 'EEEE, yyyy/MM/dd')}</h3>
        <div className="officer-day-tags">
          {isToday && <span className="officer-pill officer-pill-today">TODAY</span>}
          <span className="officer-pill">{cycle === '14-Day' ? 'C2' : 'C1'}</span>
        </div>
      </header>

      {!day.recorded ? (
        <p className="officer-empty">No log recorded for this day.</p>
      ) : (
        <>
          <div className="officer-totals">
            <Total icon={<SteeringWheel size={15} />} label="Driving" value={formatQuarterHours(totals.driving)} color="var(--status-driving)" />
            <Total icon={<Briefcase size={15} />} label="On-duty" value={formatQuarterHours(totals.onDuty)} color="var(--status-on-duty)" />
            <Total icon={<Bed size={15} />} label="Sleeper" value={formatQuarterHours(totals.sleeper)} color="var(--status-sleeper)" />
            <Total icon={<Coffee size={15} />} label="Off-duty" value={formatQuarterHours(totals.off)} color="var(--status-off-duty)" />
            <Total icon={<Route size={15} />} label="Distance" value={`${day.distanceKm ? `${Math.round(day.distanceKm)} km` : '—'}`} color="var(--text-secondary)" />
          </div>

          <DayBar grid={day.grid} />
          <div className="officer-scale" aria-hidden="true">
            <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
          </div>

          <div className="officer-meta">
            {(day.startOdometer || day.endOdometer) && (
              <span>ODO {day.startOdometer || '—'} → {day.endOdometer || '—'}</span>
            )}
            {day.plate && <span>CMV {day.plate}</span>}
            {day.editedLater && (
              <span className="officer-edited"><Pencil size={13} aria-hidden="true" /> Edited after the fact</span>
            )}
          </div>

          {day.remarks && <p className="officer-remarks">{day.remarks}</p>}
        </>
      )}
    </article>
  );
};

/**
 * The officer's screen: a large-type, read-only rendering of the handoff
 * payload. It is mounted before the sign-in gate, because the phone scanning
 * the QR code has no session — and no editing controls, by design.
 */
export const OfficerReport: React.FC<{ report: OfficerReportData }> = ({ report }) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  const summary = useMemo(() => {
    let drivingQuarters = 0;
    let distanceKm = 0;
    let recorded = 0;
    for (const day of report.days) {
      if (!day.recorded) continue;
      recorded++;
      drivingQuarters += officerTotals(day.grid).driving;
      distanceKm += day.distanceKm;
    }
    return { drivingQuarters, distanceKm, recorded };
  }, [report]);

  const fact = (label: string, value: string, wide = false) =>
    value ? (
      <div className={`officer-fact${wide ? ' officer-fact-wide' : ''}`}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;

  const newestFirst = [...report.days].reverse();

  return (
    <div className="officer-root">
      <div className="officer-shell">
        <header className="officer-banner">
          <div className="officer-banner-title">
            <span className="officer-shield"><Shield size={24} aria-hidden="true" /></span>
            <div>
              <h1>15-Day Driver Log</h1>
              <p>Roadside inspection copy</p>
            </div>
          </div>
          <span className="officer-readonly">READ ONLY</span>
        </header>

        <section className="officer-identity" aria-label="Driver and carrier">
          <dl className="officer-facts">
            {fact('Driver', report.driver || '—')}
            {fact('Cycle', report.cycle === '14-Day' ? '14-Day / 120 h (C2)' : '7-Day / 70 h (C1)')}
            {fact('CMV plate', report.plate || '—')}
            {fact('Trailer', report.trailer)}
            {fact('Operator', report.operator, true)}
            {fact('Main office', report.operatorAddress, true)}
            {fact('Home terminal', report.homeTerminal, true)}
            {fact('Co-driver', report.coDriver)}
            {fact(
              'Generated',
              report.generatedAt ? format(new Date(report.generatedAt), 'yyyy/MM/dd HH:mm') : ''
            )}
          </dl>
        </section>

        <section className="officer-summary" aria-label="15-day summary">
          <div>
            <strong>{formatQuarterHours(summary.drivingQuarters)}</strong>
            <span>Driving</span>
          </div>
          <div>
            <strong>{summary.distanceKm ? `${Math.round(summary.distanceKm)} km` : '—'}</strong>
            <span>Distance</span>
          </div>
          <div>
            <strong>{summary.recorded} / {report.days.length}</strong>
            <span>Days logged</span>
          </div>
        </section>

        <section className="officer-days" aria-label="Daily records">
          {newestFirst.map(day => (
            <DayCard key={day.date} day={day} cycle={report.cycle} isToday={day.date === today} />
          ))}
        </section>

        <footer className="officer-footer">
          <FileText size={16} aria-hidden="true" />
          <span>
            Read-only copy — no records can be changed from this screen. Generated by Synodos Log v{APP_VERSION}.
          </span>
        </footer>

        <button className="officer-exit" type="button" onClick={closeOfficerReport}>
          Close report
        </button>
      </div>
    </div>
  );
};

/** Shown when the scanned link is damaged or truncated. */
export const OfficerLinkError: React.FC<{ error: string }> = ({ error }) => (
  <div className="officer-root">
    <div className="officer-shell">
      <header className="officer-banner">
        <div className="officer-banner-title">
          <span className="officer-shield"><Shield size={24} aria-hidden="true" /></span>
          <div>
            <h1>15-Day Driver Log</h1>
            <p>Roadside inspection copy</p>
          </div>
        </div>
        <span className="officer-readonly">READ ONLY</span>
      </header>
      <section className="officer-day officer-day-today">
        <h2 style={{ margin: '0 0 0.5rem' }}>This inspection link could not be opened</h2>
        <p style={{ margin: 0, fontSize: '1.05rem' }}>{error}</p>
        <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)' }}>
          Ask the driver to generate a fresh QR code or link from the Inspection screen.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <button className="btn-primary" type="button" onClick={closeOfficerReport}>
            Back to the app
          </button>
        </div>
      </section>
    </div>
  </div>
);
