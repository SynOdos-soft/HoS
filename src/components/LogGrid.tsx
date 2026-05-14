import React from 'react';
import { Status, Preferences } from '../types';
import { isToday as isDateToday, parseISO } from 'date-fns';

interface LogGridProps {
  grid: Status[];
  preferences: Preferences;
  date?: string;
}

export const LogGrid: React.FC<LogGridProps> = ({ grid, preferences, date }) => {
  const statusLabels: Status[] = preferences.showSleeper
    ? ['off-duty', 'sleeper', 'driving', 'on-duty']
    : ['off-duty', 'driving', 'on-duty'];

  const labelWidth = 70;
  const hourWidth = 50;
  const rowHeight = 35;
  const totalGridWidth = 24 * hourWidth;
  const totalHeight = statusLabels.length * rowHeight;
  const quarterWidth = hourWidth / 4;

  const getRowY = (status: Status) => {
    let idx = statusLabels.indexOf(status);
    if (idx === -1) idx = 0;
    return idx * rowHeight + rowHeight / 2;
  };

  const today = new Date();
  const isToday = date && isDateToday(parseISO(date));
  const nowHour = today.getHours();
  const nowMin = today.getMinutes();
  const nowQuarterLimit = nowHour * 4 + Math.floor(nowMin / 15);
  const nowX = (nowHour * 4 + nowMin / 15) * quarterWidth;

  const generatePath = () => {
    if (!grid || grid.length === 0) return '';
    let path = '';
    let prevX = 0;
    let currentStatus = grid[0];
    let prevY = getRowY(currentStatus);
    path += `M ${prevX} ${prevY} `;
    for (let i = 0; i < 96; i++) {
      if (isToday && i > nowQuarterLimit) break;
      const status = grid[i] || 'off-duty';
      const targetY = getRowY(status);
      const nextX = (i + 1) * quarterWidth;
      if (status !== currentStatus) {
        path += `V ${targetY} `;
        currentStatus = status;
        prevY = targetY;
      }
      path += `H ${nextX} `;
      prevX = nextX;
    }
    return path;
  };

  return (
    <div className="log-grid-outer-wrapper" style={{ 
      display: 'flex', 
      background: 'var(--bg-secondary)', 
      borderRadius: '8px', 
      border: '1px solid var(--glass-border)',
      overflow: 'hidden',
      position: 'relative',
      width: '100%'
    }}>
      {/* Sticky Labels Sidebar */}
      <div className="log-grid-labels-sidebar" style={{
        width: `${labelWidth}px`,
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderRight: '2px solid var(--text-primary)',
        zIndex: 2,
        paddingTop: '20px', // Matches hour label offset
        boxShadow: '4px 0 10px rgba(0,0,0,0.2)'
      }}>
        {statusLabels.map((status) => (
          <div key={status} style={{
            height: `${rowHeight}px`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '8px',
            fontSize: '9px',
            fontWeight: 'bold',
            color: 'var(--text-primary)',
            borderBottom: '1px solid var(--glass-border)',
            textTransform: 'uppercase'
          }}>
            {status.replace('-', ' ')}
          </div>
        ))}
      </div>

      {/* Scrollable Grid Area */}
      <div className="log-grid-scroll-area" style={{
        flexGrow: 1,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x'
      }}>
        <div style={{ minWidth: `${totalGridWidth}px`, position: 'relative' }}>
          <svg width={totalGridWidth} height={totalHeight + 30} style={{ display: 'block' }}>
            <g transform="translate(0, 20)">
              {/* Hour Labels */}
              {Array.from({ length: 25 }).map((_, h) => (
                <text
                  key={`h-${h}`}
                  x={h * hourWidth}
                  y={-5}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-secondary)"
                  fontWeight="bold"
                >
                  {h}
                </text>
              ))}

              {/* Grid Background */}
              {statusLabels.map((_, i) => (
                <rect
                  key={`bg-${i}`}
                  x={0}
                  y={i * rowHeight}
                  width={totalGridWidth}
                  height={rowHeight}
                  fill={i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'}
                  stroke="var(--glass-border)"
                  strokeWidth="0.5"
                />
              ))}

              {/* Tick Marks */}
              {statusLabels.map((_, i) => (
                <g key={`ticks-row-${i}`}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <React.Fragment key={`ticks-${h}`}>
                      <line x1={h * hourWidth + quarterWidth} y1={i * rowHeight + rowHeight} x2={h * hourWidth + quarterWidth} y2={i * rowHeight + rowHeight - (rowHeight * 0.25)} stroke="var(--text-secondary)" strokeWidth="0.5" opacity="0.4" />
                      <line x1={h * hourWidth + 2 * quarterWidth} y1={i * rowHeight + rowHeight} x2={h * hourWidth + 2 * quarterWidth} y2={i * rowHeight + rowHeight - (rowHeight * 0.5)} stroke="var(--text-secondary)" strokeWidth="0.5" opacity="0.6" />
                      <line x1={h * hourWidth + 3 * quarterWidth} y1={i * rowHeight + rowHeight} x2={h * hourWidth + 3 * quarterWidth} y2={i * rowHeight + rowHeight - (rowHeight * 0.25)} stroke="var(--text-secondary)" strokeWidth="0.5" opacity="0.4" />
                    </React.Fragment>
                  ))}
                </g>
              ))}

              {/* Vertical Hour Lines */}
              {Array.from({ length: 25 }).map((_, h) => (
                <line
                  key={`vh-${h}`}
                  x1={h * hourWidth}
                  y1={0}
                  x2={h * hourWidth}
                  y2={totalHeight}
                  stroke="var(--glass-border)"
                  strokeWidth={h % 6 === 0 ? 1 : 0.5}
                  opacity={h % 6 === 0 ? 1 : 0.5}
                />
              ))}

              {/* Graph Line */}
              <path
                d={generatePath()}
                fill="none"
                stroke="var(--accent-blue)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.4))' }}
              />

              {/* Current Time Marker */}
              {isToday && (
                <line x1={nowX} y1={0} x2={nowX} y2={totalHeight} stroke="var(--accent-red)" strokeWidth="2" />
              )}
            </g>
          </svg>
        </div>
      </div>

      <style>{`
        .log-grid-scroll-area {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .log-grid-scroll-area::-webkit-scrollbar {
          display: none;
        }
        .log-grid-outer-wrapper {
          touch-action: pan-y pinch-zoom; /* Allow vertical scroll on parent, but pan-x on the scroll-area */
        }
        .log-grid-scroll-area {
          touch-action: pan-x;
        }
      `}</style>
    </div>
  );
};
