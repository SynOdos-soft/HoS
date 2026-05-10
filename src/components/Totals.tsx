import React from 'react';
import { Status, Preferences } from '../types';
import { t } from '../utils/i18n';
import { AlertTriangle } from 'lucide-react';

interface TotalsProps {
  grid: Status[];
  preferences: Preferences;
  startOdometer?: string;
  endOdometer?: string;
  homeTerminalAddress?: string;
}

export const Totals: React.FC<TotalsProps> = ({ grid, preferences, startOdometer, endOdometer, homeTerminalAddress }) => {
  const counts = grid.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<Status, number>);

  const formatHours = (quarters: number) => {
    const hours = Math.floor(quarters / 4);
    const mins = (quarters % 4) * 15;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

  const calculateTotalKm = () => {
    const start = Number(startOdometer);
    const end = Number(endOdometer);
    if (!isNaN(start) && !isNaN(end) && end >= start && startOdometer !== '' && endOdometer !== '') {
      return `${end - start} km`;
    }
    return '0 km';
  };

  const drivingQuarters = counts['driving'] || 0;
  const isUsa = homeTerminalAddress?.toUpperCase().includes('USA');
  const limitHours = isUsa ? 11 : 13;
  const isOverLimit = (drivingQuarters / 4) > limitHours;

  return (
    <div className="totals-grid no-print">
      <div className="total-card off-duty">
        <h3>Off-Duty</h3>
        <div className="value">{formatHours(counts['off-duty'] || 0)}</div>
      </div>
      {preferences.showSleeper && (
        <div className="total-card sleeper">
          <h3>Sleeper</h3>
          <div className="value">{formatHours(counts['sleeper'] || 0)}</div>
        </div>
      )}
      <div className={`total-card driving ${isOverLimit ? 'over-limit' : ''}`} style={isOverLimit ? { border: '2px solid var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)' } : {}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Driving</h3>
          {isOverLimit && <AlertTriangle size={16} color="var(--accent-red)" />}
        </div>
        <div className="value" style={isOverLimit ? { color: 'var(--accent-red)' } : {}}>{formatHours(drivingQuarters)}</div>
        {isOverLimit && <div style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 700, marginTop: '2px' }}>LIMIT: {limitHours}h</div>}
      </div>
      <div className="total-card on-duty">
        <h3>On-Duty</h3>
        <div className="value">{formatHours(counts['on-duty'] || 0)}</div>
      </div>
      <div className="total-card distance">
        <h3>{t('totalDistance', preferences.language)}</h3>
        <div className="value">{calculateTotalKm()}</div>
      </div>
    </div>
  );
};
