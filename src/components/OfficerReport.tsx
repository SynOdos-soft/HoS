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
import { useT, dateLocaleFor, getI18nLanguage } from '../utils/i18n';

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
  const t = useT();

  return (
    <article className={`officer-day${isToday ? ' officer-day-today' : ''}`}>
      <header className="officer-day-head">
        <h3 className="officer-date">{format(parseISO(day.date), 'EEEE, yyyy/MM/dd', { locale: dateLocaleFor(getI18nLanguage()) })}</h3>
        <div className="officer-day-tags">
          {isToday && <span className="officer-pill officer-pill-today">{t('todayPill')}</span>}
          <span className="officer-pill">{cycle === '14-Day' ? 'C2' : 'C1'}</span>
        </div>
      </header>

      {!day.recorded ? (
        <p className="officer-empty">{t('officerNoEntries')}</p>
      ) : (
        <>
          <div className="officer-totals">
            <Total icon={<SteeringWheel size={15} />} label={t('totalsDriving')} value={formatQuarterHours(totals.driving)} color="var(--status-driving)" />
            <Total icon={<Briefcase size={15} />} label={t('totalsOnDuty')} value={formatQuarterHours(totals.onDuty)} color="var(--status-on-duty)" />
            <Total icon={<Bed size={15} />} label={t('totalsSleeper')} value={formatQuarterHours(totals.sleeper)} color="var(--status-sleeper)" />
            <Total icon={<Coffee size={15} />} label={t('totalsOffDuty')} value={formatQuarterHours(totals.off)} color="var(--status-off-duty)" />
            <Total icon={<Route size={15} />} label={t('distance')} value={`${day.distanceKm ? `${Math.round(day.distanceKm)} km` : '—'}`} color="var(--text-secondary)" />
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
              <span className="officer-edited"><Pencil size={13} aria-hidden="true" /> {t('editedAfterTheFact')}</span>
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
  const t = useT();

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
              <h1>{t('fifteenDayDriverLog')}</h1>
              <p>{t('officerModeBanner')}</p>
            </div>
          </div>
          <span className="officer-readonly">{t('officerReadOnly')}</span>
        </header>

        <section className="officer-identity" aria-label={t('driverAndCarrier')}>
          <dl className="officer-facts">
            {fact(t('factDriver'), report.driver || '—')}
            {fact(t('factCycle'), report.cycle === '14-Day' ? `${t('cycle14Day')} / 120 h (C2)` : `${t('cycle7Day')} / 70 h (C1)`)}
            {fact(t('factPlate'), report.plate || '—')}
            {fact(t('factTrailer'), report.trailer)}
            {fact(t('factOperator'), report.operator, true)}
            {fact(t('factMainOffice'), report.operatorAddress, true)}
            {fact(t('factHomeTerminal'), report.homeTerminal, true)}
            {fact(t('factCoDriver'), report.coDriver)}
            {fact(
              t('factGenerated'),
              report.generatedAt ? format(new Date(report.generatedAt), 'yyyy/MM/dd HH:mm') : ''
            )}
          </dl>
        </section>

        <section className="officer-summary" aria-label={t('summary15Day')}>
          <div>
            <strong>{formatQuarterHours(summary.drivingQuarters)}</strong>
            <span>{t('totalsDriving')}</span>
          </div>
          <div>
            <strong>{summary.distanceKm ? `${Math.round(summary.distanceKm)} km` : '—'}</strong>
            <span>{t('distance')}</span>
          </div>
          <div>
            <strong>{summary.recorded} / {report.days.length}</strong>
            <span>{t('daysLogged')}</span>
          </div>
        </section>

        <section className="officer-days" aria-label={t('dailyRecords')}>
          {newestFirst.map(day => (
            <DayCard key={day.date} day={day} cycle={report.cycle} isToday={day.date === today} />
          ))}
        </section>

        <footer className="officer-footer">
          <FileText size={16} aria-hidden="true" /><span>{t('officerFooterNote')} v{APP_VERSION}</span>
        </footer>

        <button className="officer-exit" type="button" onClick={closeOfficerReport}>
          {t('officerCloseReport')}
        </button>
      </div>
    </div>
  );
};

/** Shown when the scanned link is damaged or truncated. */
export const OfficerLinkError: React.FC<{ error: string }> = ({ error }) => {
  const et = useT();
  return (
  <div className="officer-root">
    <div className="officer-shell">
      <header className="officer-banner">
        <div className="officer-banner-title">
          <span className="officer-shield"><Shield size={24} aria-hidden="true" /></span>
          <div>
            <h1>{et('fifteenDayDriverLog')}</h1>
            <p>{et('officerModeBanner')}</p>
          </div>
        </div>
        <span className="officer-readonly">{et('officerReadOnly')}</span>
      </header>
      <section className="officer-day officer-day-today">
        <h2 style={{ margin: '0 0 0.5rem' }}>{et('invalidHandoffLink')}</h2>
        <p style={{ margin: 0, fontSize: '1.05rem' }}>{error}</p>
        <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)' }}>
          {et('invalidHandoffBody')}
        </p>
        <div style={{ marginTop: '1rem' }}>
          <button className="btn-primary" type="button" onClick={closeOfficerReport}>
            {et('backToApp')}
          </button>
        </div>
      </section>
    </div>
  </div>
  );
};
