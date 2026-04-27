import React from 'react';
import { Status, Preferences } from '../types';

interface TotalsProps {
  grid: Status[];
  preferences: Preferences;
}

export const Totals: React.FC<TotalsProps> = ({ grid, preferences }) => {
  const counts = grid.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<Status, number>);

  const formatHours = (quarters: number) => {
    const hours = Math.floor(quarters / 4);
    const mins = (quarters % 4) * 15;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

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
      <div className="total-card driving">
        <h3>Driving</h3>
        <div className="value">{formatHours(counts['driving'] || 0)}</div>
      </div>
      <div className="total-card on-duty">
        <h3>On-Duty</h3>
        <div className="value">{formatHours(counts['on-duty'] || 0)}</div>
      </div>
    </div>
  );
};
