import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Coffee, Bed, Briefcase, Route, ChevronDown, ChevronUp, FileText, Pencil, ArrowLeft,
} from 'lucide-react';
import { APP_VERSION, Preferences } from '../types';
import { SteeringWheel } from './Icons';
import { LogGrid } from './LogGrid';
import {
  OfficerDay,
  OfficerReport as OfficerReportData,
  formatQuarterHours,
  officerTotals,
  closeOfficerReport,
} from '../utils/officerReport';
import { useT, dateLocaleFor, getI18nLanguage } from '../utils/i18n';

/**
 * The officer's screen.
 *
 * This renders through the SAME containers, cards and class names as the
 * driver's own Inspection screen (`inspection-view-container` →
 * `inspection-toolbar` → `inspection-grid` → `inspection-card` → `card-header`
 * / `card-body`), including the shared `LogGrid`, `card-grid-scroll` and
 * `card-metadata-box`. That is deliberate: an officer checking a driver's record
 * and the driver checking the same record must be reading identical numbers in
 * identical places, so there is one layout with two data sources rather than a
 * lookalike that can drift.
 *
 * The only differences are the things a recipient must not have: no Handoff
 * button, no editing affordances, no audit trail, and a link back to the app.
 * It mounts before the sign-in gate — the phone scanning the QR has no session.
 */

/** One day, laid out exactly like the driver's Inspection day card. */
const DayCard: React.FC<{
  day: OfficerDay;
  report: OfficerReportData;
  isToday: boolean;
}> = ({ day, report, isToday }) => {
  const t = useT();
  const locale = dateLocaleFor(getI18nLanguage());
  const totals = officerTotals(day.grid);
  const is24hOffDuty = day.grid.every(v => v === 'off-duty');
  const [expanded, setExpanded] = useState(!is24hOffDuty);

  // The officer page carries no preferences blob (it is a bare link); the grid
  // only ever consults this one flag.
  const gridPrefs = useMemo(() => ({ showSleeper: true }) as Preferences, []);

  if (!day.recorded) {
    return (
      <div className="inspection-card glass-panel">
        <div className="card-header">
          <div className="date-badge">
            <span>{format(parseISO(day.date), 'EEEE, MMM d', { locale })}</span>
          </div>
        </div>
        <div className="card-empty">
          <p>{t('noLogData')}</p>
        </div>
      </div>
    );
  }

  const cycleLabel = report.cycle === '14-Day' ? 'C2' : 'C1';

  return (
    <div className="inspection-card glass-panel">
      <div
        className="card-header"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
            <div className="date-badge">
              <span>{format(parseISO(day.date), 'EEEE, MMM d', { locale })}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!expanded && (
              <div className="mini-totals-compact" style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                fontSize: '0.75rem', fontWeight: 700, marginRight: '0.5rem', whiteSpace: 'nowrap',
              }}>
                {/* officerTotals counts quarter-hours (96 slots = 24h), so divide
                    by 4 here — the app's own badge is already in hours. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--status-off-duty)' }}>
                  <Coffee size={12} /> {Math.floor(totals.off / 4)}h
                </div>
                {totals.sleeper > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--status-sleeper)' }}>
                    <Bed size={12} /> {Math.floor(totals.sleeper / 4)}h
                  </div>
                )}
                {totals.driving > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--status-driving)' }}>
                    <SteeringWheel size={12} /> {Math.floor(totals.driving / 4)}h
                  </div>
                )}
                {totals.onDuty > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--status-on-duty)' }}>
                    <Briefcase size={12} /> {Math.floor(totals.onDuty / 4)}h
                  </div>
                )}
              </div>
            )}
            {isToday && <span className="today-pill">{t('todayPill')}</span>}
            <button
              className="today-pill"
              style={{
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)', padding: '2px 8px', fontSize: '0.7rem',
              }}
              onClick={(e) => e.stopPropagation()}
              disabled
            >
              {cycleLabel}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="card-body">
          <div className="card-grid-scroll" style={{ width: '100%' }}>
            <LogGrid grid={day.grid} preferences={gridPrefs} date={day.date} />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div
              className="btn-primary"
              style={{
                display: 'flex', background: 'transparent', border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)', width: '100%', justifyContent: 'space-between',
                fontSize: '0.85rem', padding: '0.5rem 1rem', overflow: 'hidden',
              }}
            >
              <div className="mini-totals-compact" style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                fontWeight: 700, marginRight: '0.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-off-duty)' }}>
                  <Coffee size={15} /> {formatQuarterHours(totals.off)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-sleeper)' }}>
                  <Bed size={15} /> {formatQuarterHours(totals.sleeper)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-driving)' }}>
                  <SteeringWheel size={15} /> {formatQuarterHours(totals.driving)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-on-duty)' }}>
                  <Briefcase size={15} /> {formatQuarterHours(totals.onDuty)}
                </div>
                {day.distanceKm > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                    <Route size={15} /> {Math.round(day.distanceKm)}km
                  </div>
                )}
              </div>
            </div>

            {day.editedLater && (
              <span className="officer-edited" style={{ marginTop: '0.6rem', display: 'inline-flex' }}>
                <Pencil size={13} aria-hidden="true" /> {t('editedAfterTheFact')}
              </span>
            )}

            <div className="card-metadata-box" style={{ marginTop: '0.75rem' }}>
              {day.remarks && (
                <div className="metadata-row">
                  <div className="metadata-tag">{t('tagRemarks')}</div>
                  <div className="metadata-value italic"><span>{day.remarks}</span></div>
                </div>
              )}
              {(day.startOdometer || day.endOdometer) && (
                <div className="metadata-row">
                  <div className="metadata-tag">{t('tagOdometer')}</div>
                  <div className="metadata-value">
                    <span>{day.startOdometer || '--'} → {day.endOdometer || '--'}</span>
                  </div>
                </div>
              )}
              {!is24hOffDuty && (
                <div className="metadata-row">
                  <div className="metadata-tag">{t('tagCmvPlate')}</div>
                  <div className="metadata-value"><span>{day.plate || report.plate || '--'}</span></div>
                </div>
              )}
              {report.trailer && (
                <div className="metadata-row">
                  <div className="metadata-tag">{t('tagTrailer')}</div>
                  <div className="metadata-value"><span>{report.trailer}</span></div>
                </div>
              )}
              {report.coDriver && (
                <div className="metadata-row">
                  <div className="metadata-tag">{t('tagCoDriver')}</div>
                  <div className="metadata-value"><span>{report.coDriver}</span></div>
                </div>
              )}
              <div className="metadata-row">
                <div className="metadata-tag">{t('tagHomeTerminal')}</div>
                <div className="metadata-value"><span>{report.homeTerminal || '--'}</span></div>
              </div>
              <div className="metadata-row">
                <div className="metadata-tag">{t('tagOperator')}</div>
                <div className="metadata-value"><span>{report.operator || '--'}</span></div>
              </div>
              <div className="metadata-row">
                <div className="metadata-tag">{t('tagMainOffice')}</div>
                <div className="metadata-value"><span>{report.operatorAddress || '--'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Shared shell for the record, loading and error screens.
 *
 * `subtitle` replaces the usual description with the date and time the record
 * was generated — the first thing an officer checks against the time on their
 * own paperwork.
 */
const OfficerShell: React.FC<{ children: React.ReactNode; subtitle?: string }> = ({ children, subtitle }) => {
  const t = useT();
  return (
    <div className="inspection-view-container officer-page">
      <div className="inspection-toolbar no-print">
        <div className="inspection-toolbar-copy">
          <h2>{t('fifteenDayRecord')}</h2>
          <p>{subtitle ?? t('officerModeBanner')}</p>
        </div>
      </div>
      {children}
    </div>
  );
};

/**
 * Whose record this is.
 *
 * The driver's own Inspection screen never has to say this — it is always their
 * record. An officer opening someone else's link absolutely does, so it is
 * stated up front rather than left for the officer to infer.
 *
 * Only the record-level facts live here. CMV plate, trailer, operator, home
 * terminal, main office and co-driver are per-day rows on each day card (as in
 * the driver's view), so repeating them here would only duplicate values that
 * can legitimately differ from day to day.
 */
const RecordIdentity: React.FC<{ report: OfficerReportData }> = ({ report }) => {
  const t = useT();
  const rows: Array<[string, string]> = [
    [t('factDriver'), report.driver || '--'],
    [t('factCycle'), report.cycle === '14-Day' ? t('cycle14Day') : t('cycle7Day')],
  ];
  

  return (
    <div className="inspection-card glass-panel" style={{ marginBottom: '1rem' }}>
      <div className="card-body">
        {/* Rows sit directly in the card: wrapping them in the metadata box
            put a bordered panel inside another bordered panel. */}
        {rows.map(([label, value]) => (
          <div className="metadata-row" key={label}>
            <div className="metadata-tag">{label}</div>
            <div className="metadata-value"><span>{value}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OfficerReport: React.FC<{ report: OfficerReportData }> = ({ report }) => {
  const t = useT();
  const locale = dateLocaleFor(getI18nLanguage());
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const generated = report.generatedAt
    ? format(new Date(report.generatedAt), 'yyyy/MM/dd HH:mm', { locale })
    : null;

  return (
    <OfficerShell subtitle={generated ? `${t('officerGeneratedAt')} ${generated}` : t('officerModeBanner')}>
      <RecordIdentity report={report} />

      <div className="inspection-grid">
        {report.days.map(day => (
          <DayCard key={day.date} day={day} report={report} isToday={day.date === todayStr} />
        ))}
      </div>

      <footer className="officer-footer no-print">
        <p className="officer-footer-note">{t('officerFooterNote')}</p>
        <p className="officer-footer-version">v{APP_VERSION}</p>
      </footer>
    </OfficerShell>
  );
};

/** Brief state while a short share link is fetched from the server. */
export const OfficerLinkLoading: React.FC = () => {
  const t = useT();
  return (
    <OfficerShell>
      <div className="glass-panel" role="status" aria-live="polite" style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto' }} aria-hidden="true" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>{t('officerLoadingRecord')}</p>
      </div>
    </OfficerShell>
  );
};

/**
 * Shown when the scanned link cannot be opened: damaged, truncated, or simply
 * past its 7-day life. An expired link is a normal outcome, not a fault, so it
 * gets its own wording instead of the generic "ask the driver" message.
 */
export const OfficerLinkError: React.FC<{ error: string; expired?: boolean }> = ({ error, expired }) => {
  const t = useT();
  return (
    <OfficerShell>
      <div className="inspection-card glass-panel">
        <div className="card-body" style={{ padding: '2rem', textAlign: 'center' }}>
          <FileText size={40} style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }} aria-hidden="true" />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
            {expired ? t('expiredHandoffLink') : t('invalidHandoffLink')}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            {expired ? t('expiredHandoffBody') : error}
          </p>
          {!expired && (
            <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)' }}>
              {t('invalidHandoffBody')}
            </p>
          )}
          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn-primary" onClick={closeOfficerReport}>
              <ArrowLeft size={16} /> {t('backToApp')}
            </button>
          </div>
        </div>
      </div>
    </OfficerShell>
  );
};