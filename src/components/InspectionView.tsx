import React from 'react';
import { WeeklyLog, DayEntry } from '../types';
import { ArrowLeft, Shield, Calendar, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface InspectionViewProps {
  logs: WeeklyLog[];
  onBack: () => void;
}

export const InspectionView: React.FC<InspectionViewProps> = ({ logs, onBack }) => {
  // Generate the last 15 days (today + 14 days)
  const today = new Date();
  const last15Days = Array.from({ length: 15 }).map((_, i) => subDays(today, i));

  // Flatten all days from all logs into a map for quick lookup
  const dayMap = new Map<string, DayEntry>();
  logs.forEach(log => {
    log.days.forEach(day => {
      dayMap.set(day.date, day);
    });
  });

  const calculateTotals = (grid: string[]) => {
    const totals = { 'off-duty': 0, 'sleeper': 0, 'driving': 0, 'on-duty': 0 };
    grid.forEach(val => {
      if (val in totals) totals[val as keyof typeof totals] += 0.25;
    });
    return totals;
  };

  return (
    <div className="inspection-view-container">
      <header className="no-print" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="tool-btn" onClick={onBack} style={{ padding: '0.6rem' }}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Shield size={32} color="var(--accent-blue)" />
              Roadside Inspection Mode
            </h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Official HOS Compliance Record • Last 15 Days (14+1)
            </p>
          </div>
        </div>
        <div className="inspection-status">
          <CheckCircle2 size={16} color="var(--accent-green)" />
          <span>Active Compliance</span>
        </div>
      </header>

      <div className="inspection-grid">
        {last15Days.map((date, idx) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const day = dayMap.get(dateStr);
          const totals = day ? calculateTotals(day.grid) : null;

          return (
            <div key={dateStr} className="inspection-card glass-panel" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="card-header">
                <div className="date-badge">
                  <Calendar size={14} />
                  <span>{format(date, 'EEE, MMM d')}</span>
                </div>
                {idx === 0 && <span className="today-label">TODAY</span>}
              </div>

              {day ? (
                <div className="card-body">
                  <div className="mini-totals">
                    <div className="total-item">
                      <label>OFF</label>
                      <span>{totals?.['off-duty'].toFixed(2)}h</span>
                    </div>
                    <div className="total-item highlight">
                      <label>DRV</label>
                      <span>{totals?.['driving'].toFixed(2)}h</span>
                    </div>
                    <div className="total-item">
                      <label>ON</label>
                      <span>{totals?.['on-duty'].toFixed(2)}h</span>
                    </div>
                    <div className="total-item">
                      <label>SLP</label>
                      <span>{totals?.['sleeper'].toFixed(2)}h</span>
                    </div>
                  </div>
                  
                  <div className="card-meta">
                    <div className="meta-item">
                      <Clock size={12} />
                      <span>Odo: {day.startOdometer || '--'} - {day.endOdometer || '--'}</span>
                    </div>
                    {day.remarks && (
                      <div className="meta-item remarks">
                        <MapPin size={12} />
                        <span>{day.remarks}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card-empty">
                  <p>No log data available</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .inspection-view-container {
          max-width: 1200px;
          margin: 0 auto;
          animation: fadeIn 0.4s ease-out;
        }

        .inspection-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(34, 197, 94, 0.1);
          color: var(--accent-green);
          padding: 0.5rem 1rem;
          border-radius: 100px;
          font-weight: 700;
          font-size: 0.85rem;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .inspection-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
          padding-bottom: 3rem;
        }

        .inspection-card {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          transition: transform 0.2s, box-shadow 0.2s;
          border: 1px solid var(--glass-border);
          animation: slideUp 0.4s ease-out both;
        }

        .inspection-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          border-color: var(--accent-blue);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .date-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 700;
          color: var(--text-primary);
          font-size: 1rem;
        }

        .today-label {
          background: var(--accent-blue);
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .mini-totals {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
          background: rgba(0,0,0,0.2);
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.75rem;
        }

        .total-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
        }

        .total-item label {
          font-size: 0.65rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .total-item span {
          font-size: 0.85rem;
          font-weight: 700;
        }

        .total-item.highlight span {
          color: var(--accent-blue);
        }

        .card-meta {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .meta-item.remarks {
          padding: 0.4rem;
          background: rgba(255,255,255,0.03);
          border-radius: 4px;
          border-left: 2px solid var(--accent-blue);
        }

        .card-empty {
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          font-style: italic;
          font-size: 0.85rem;
          background: rgba(255,255,255,0.02);
          border-radius: 8px;
          border: 1px dashed var(--glass-border);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
