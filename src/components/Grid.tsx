import React, { useCallback } from 'react';
import { Status, Preferences } from '../types';

interface GridProps {
  grid: Status[];
  setGrid: React.Dispatch<React.SetStateAction<Status[]>>;
  preferences: Preferences;
  locked?: boolean;
}

export const Grid: React.FC<GridProps> = ({ grid, setGrid, preferences, locked }) => {
  const STATUS_OPTIONS: Status[] = preferences.showSleeper 
    ? ['off-duty', 'sleeper', 'driving', 'on-duty']
    : ['off-duty', 'driving', 'on-duty'];

  const handlePointerDown = (index: number, rowStatus: Status) => {
    if (locked) return;
    updateCell(index, rowStatus);
  };

  const handleHourClick = (h: number) => {
    if (locked) return;
    const current = grid[h * 4]; // Check first quarter of hour
    const currentIndex = STATUS_OPTIONS.indexOf(current);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % STATUS_OPTIONS.length;
    const newValue = STATUS_OPTIONS[nextIndex];
    
    setGrid((prev) => {
      const newGrid = [...prev];
      for (let i = 0; i < 4; i++) {
        newGrid[h * 4 + i] = newValue;
      }
      return newGrid;
    });
  };

  const updateCell = useCallback((index: number, value: Status) => {
    setGrid((prev) => {
      const newGrid = [...prev];
      newGrid[index] = value;
      return newGrid;
    });
  }, [setGrid]);

  const formatHour = (h: number): { line1: string; line2?: string } => {
    if (preferences.timeFormat === '24h') {
      return { line1: `${String(h).padStart(2, '0')}:00` };
    }
    if (h === 0) return { line1: '12:00', line2: 'AM' };
    if (h === 12) return { line1: '12:00', line2: 'PM' };
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h > 12 ? h - 12 : h;
    return { line1: `${String(h12).padStart(2, '0')}:00`, line2: ampm };
  };

  const formatQuarterTime = (h: number, q: number) => {
    const minutes = q === 0 ? '00' : q === 1 ? '15' : q === 2 ? '30' : '45';
    if (preferences.timeFormat === '24h') {
      return `${String(h).padStart(2, '0')}:${minutes}`;
    }
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour12).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  return (
    <div className={`grid-container ${locked ? 'locked' : ''}`} id="hos-grid-container" style={{ opacity: locked ? 0.7 : 1 }}>
      <div className="timeline-grid">
        <div className="grid-header-row">
          <div className="grid-status-label time-header">
            TIME
          </div>
          {Array.from({ length: 24 }).map((_, h) => (
            <div 
              key={h} 
              className="grid-hour-header" 
              onPointerDown={() => handleHourClick(h)}
              style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
            >
              <span className="hour-text">
                {formatHour(h).line1}
                {formatHour(h).line2 && <><br /><span style={{ fontSize: '0.55rem', opacity: 0.8 }}>{formatHour(h).line2}</span></>}
              </span>
            </div>
          ))}
        </div>

        {STATUS_OPTIONS.map((status) => (
          <div className="grid-status-row" key={status}>
            <div className="grid-status-label">
              {status.toUpperCase().replace('-', ' ')}
            </div>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={`${status}-${h}`} className="hour-block">
                {Array.from({ length: 4 }).map((_, q) => {
                  const index = h * 4 + q;
                  const isActive = grid[index] === status;
                  return (
                    <div
                      key={index}
                      className={`quarter-cell ${isActive ? `active-${status}` : ''}`}
                      onPointerDown={(e) => { e.preventDefault(); handlePointerDown(index, status); }}
                      style={{ cursor: locked ? 'not-allowed' : 'pointer', touchAction: 'manipulation' }}
                    >
                      {preferences.showTimestamps && isActive && (
                        <span className="cell-timestamp">{formatQuarterTime(h, q)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
