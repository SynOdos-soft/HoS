import React from 'react';
import { WeeklyLog, DayEntry, AuditEntry, Preferences } from '../types';
import { FileText, User, Coffee, Bed, Truck, Briefcase, Route } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { LogGrid } from './LogGrid';

interface InspectionViewProps {
  logs: WeeklyLog[];
  preferences: Preferences;
}

export const InspectionView: React.FC<InspectionViewProps> = ({ logs, preferences }) => {
  const today = new Date();
  const last15Days = Array.from({ length: 15 }).map((_, i) => subDays(today, i));

  const dayMap = new Map<string, DayEntry>();
  logs.forEach(log => {
    log.days.forEach(day => {
      dayMap.set(day.date, day);
    });
  });

  // Collect ALL audit entries from all logs, newest first
  const allAuditEntries: AuditEntry[] = [];
  logs.forEach(log => {
    if (log.auditLog) allAuditEntries.push(...log.auditLog);
  });
  allAuditEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const calculateTotals = (grid: string[]) => {
    const totals = { 'off-duty': 0, 'sleeper': 0, 'driving': 0, 'on-duty': 0 };
    grid.forEach(val => {
      if (val in totals) totals[val as keyof typeof totals] += 0.25;
    });
    return totals;
  };

  return (
    <div className="inspection-view-container">
      {/* 15-day status grid */}
      <div className="inspection-grid">
        {last15Days.map((date, idx) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const day = dayMap.get(dateStr);
          const totals = day ? calculateTotals(day.grid) : null;

          return (
            <div key={dateStr} className="inspection-card glass-panel" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="card-header">
                <div className="date-badge">
                  <span>{format(date, 'EEEE, MMM d')}</span>
                </div>
                {idx === 0 && <span className="today-pill">TODAY</span>}
              </div>

              {day ? (
                <div className="card-body">
                  <div className="mini-totals-compact" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.75rem', 
                    flexWrap: 'nowrap', 
                    fontSize: '0.85rem', 
                    fontWeight: 700, 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-off-duty)' }}>
                      <Coffee size={14} /> {Math.floor(totals?.['off-duty'] || 0)}h{Math.round(((totals?.['off-duty'] || 0) % 1) * 60) > 0 ? ` ${Math.round(((totals?.['off-duty'] || 0) % 1) * 60)}m` : ''}
                    </div>
                    {preferences.showSleeper && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-sleeper)' }}>
                        <Bed size={14} /> {Math.floor(totals?.['sleeper'] || 0)}h{Math.round(((totals?.['sleeper'] || 0) % 1) * 60) > 0 ? ` ${Math.round(((totals?.['sleeper'] || 0) % 1) * 60)}m` : ''}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)' }}>
                      <Truck size={14} /> {Math.floor(totals?.['driving'] || 0)}h{Math.round(((totals?.['driving'] || 0) % 1) * 60) > 0 ? ` ${Math.round(((totals?.['driving'] || 0) % 1) * 60)}m` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-on-duty)' }}>
                      <Briefcase size={14} /> {Math.floor(totals?.['on-duty'] || 0)}h{Math.round(((totals?.['on-duty'] || 0) % 1) * 60) > 0 ? ` ${Math.round(((totals?.['on-duty'] || 0) % 1) * 60)}m` : ''}
                    </div>
                    {day.startOdometer && day.endOdometer && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                        <Route size={14} /> {(parseFloat(day.endOdometer) - parseFloat(day.startOdometer)).toFixed(1)}km
                      </div>
                    )}
                  </div>
                  
                  {(day.startOdometer || day.endOdometer || day.remarks) && (
                    <div className="card-metadata-box">
                      {day.remarks && (
                        <div className="metadata-row">
                          <div className="metadata-tag">REMARKS</div>
                          <div className="metadata-value italic">
                            <span>{day.remarks}</span>
                          </div>
                        </div>
                      )}
                      {(day.startOdometer || day.endOdometer) && (
                        <div className="metadata-row">
                          <div className="metadata-tag">ODOMETER</div>
                          <div className="metadata-value">
                            <span>{day.startOdometer || '--'} → {day.endOdometer || '--'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="card-grid-scroll" style={{ marginTop: '1rem', width: '100%' }}>
                    <LogGrid 
                      grid={day.grid} 
                      preferences={preferences} 
                      date={day.date}
                    />
                  </div>
                </div>
              ) : (
                <div className="card-empty">
                  <p>No log data</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Audit Trail Section */}
      <div className="audit-trail-section" style={{ marginTop: '3rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <FileText size={22} color="var(--accent-orange)" />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Audit Trail</h2>
          </div>
        </div>

        {allAuditEntries.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
            <FileText size={40} style={{ marginBottom: '0.75rem' }} />
            <p>No audit entries found. All records are original.</p>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 0 }}>
            <div className="audit-table-wrapper" style={{ 
              overflowX: 'auto', 
              WebkitOverflowScrolling: 'touch',
              display: 'block'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '100px', color: 'var(--text-secondary)', fontWeight: 600 }}>Timestamp</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '100px', color: 'var(--text-secondary)', fontWeight: 600 }}>Log Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '100px', color: 'var(--text-secondary)', fontWeight: 600 }}>Field</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '250px', color: 'var(--text-secondary)', fontWeight: 600 }}>Change</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '200px', color: 'var(--text-secondary)', fontWeight: 600 }}>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {allAuditEntries.map((entry, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)' }}>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600 }}>{format(parseISO(entry.timestamp), 'MMM d, yyyy')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{format(parseISO(entry.timestamp), 'HH:mm:ss')}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {entry.date || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                        {entry.field}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--accent-red)', textDecoration: 'line-through', marginRight: '0.5rem' }}>{entry.originalValue}</span>
                          <span style={{ color: 'var(--accent-green)' }}>→ {entry.newValue}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <User size={12} color="var(--text-secondary)" />
                          <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {entry.reason || 'No justification provided'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
