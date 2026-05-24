import React, { useCallback, useState, useEffect } from 'react';
import { Status, Preferences } from '../types';
import { Plus, ChevronUp, ChevronDown, EyeOff } from 'lucide-react';
import { isToday as isDateToday, parseISO } from 'date-fns';

interface GridProps {
  grid: Status[];
  setGrid: React.Dispatch<React.SetStateAction<Status[]>>;
  preferences: Preferences;
  locked?: boolean;
  highlightHour?: number;
  date?: string;
}

export const Grid: React.FC<GridProps> = ({ grid, setGrid, preferences, locked, highlightHour = -1, date }) => {
  const [isHiddenHoursShown, setIsHiddenHoursShown] = useState(false);
  const [collapsedHours, setCollapsedHours] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const STATUS_OPTIONS: Status[] = preferences.showSleeper 
    ? ['off-duty', 'sleeper', 'driving', 'on-duty']
    : ['off-duty', 'driving', 'on-duty'];

  // Determine the first active hour (first cell that is not off-duty)
  const firstActiveCellIndex = grid.findIndex(val => val !== 'off-duty');
  const isToday = date ? isDateToday(parseISO(date)) : false;
  const currentLocalHour = new Date().getHours();
  
  const firstActiveHour = firstActiveCellIndex === -1 
    ? (isToday ? currentLocalHour : 0) 
    : Math.floor(firstActiveCellIndex / 4);

  // hideEarlyHours: completely removes early hours from the grid
  const shouldHide = isMobile && preferences.hideEarlyHours && firstActiveHour > 0 && !isHiddenHoursShown;
  const startHour = shouldHide ? firstActiveHour : 0;
  const renderedHoursCount = 24 - startHour;

  // collapseEarlyHours: determines if individual hour chevrons are available
  const canCollapse = isMobile && preferences.collapseEarlyHours;

  const isHourCollapsed = (h: number): boolean => {
    if (!canCollapse) return false;
    if (collapsedHours[h] !== undefined) return collapsedHours[h];
    // Default: collapse hours before the first active hour
    return h < firstActiveHour;
  };

  const handlePointerDown = (index: number, rowStatus: Status) => {
    if (locked) return;
    updateCell(index, rowStatus);
  };

  const handleHourClick = (h: number) => {
    if (locked) return;
    const current = grid[h * 4];
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

  const getBannerTimeStr = (h: number) => {
    const formatted = formatHour(h);
    return `${formatted.line1}${formatted.line2 ? ' ' + formatted.line2 : ''}`;
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

  const formatQuarterShort = (h: number, q: number) => {
    const minutes = q === 0 ? '00' : q === 1 ? '15' : q === 2 ? '30' : '45';
    if (preferences.timeFormat === '24h') {
      return `:${minutes}`;
    }
    return `:${minutes}`;
  };

  return (
    <div className={`grid-container ${locked ? 'locked' : ''}`} id="hos-grid-container" style={{ opacity: locked ? 0.7 : 1 }}>
      {/* Hide early hours banner */}
      {shouldHide && (
        <div 
          className="early-hours-banner glass-panel"
          onClick={() => setIsHiddenHoursShown(true)}
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px dashed var(--accent-blue)',
            color: 'var(--accent-blue)',
            padding: '0.75rem',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            userSelect: 'none'
          }}
        >
          <Plus size={16} />
          <span>Show hidden hours (12:00 AM – {getBannerTimeStr(firstActiveHour)})</span>
        </div>
      )}

      {isMobile && preferences.hideEarlyHours && firstActiveHour > 0 && isHiddenHoursShown && (
        <div 
          className="early-hours-banner glass-panel"
          onClick={() => setIsHiddenHoursShown(false)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '0.6rem',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '0.8rem',
            cursor: 'pointer',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            userSelect: 'none'
          }}
        >
          <EyeOff size={16} />
          <span>Hide early hours (12:00 AM – {getBannerTimeStr(firstActiveHour)})</span>
        </div>
      )}

      <div className="timeline-grid">
        <div className="grid-header-row">
          <div className="grid-status-label time-header">
            TIME
          </div>
          {Array.from({ length: renderedHoursCount }).map((_, idx) => {
            const h = startHour + idx;
            const collapsed = isHourCollapsed(h);

            const toggleIndividualHour = (e: React.MouseEvent) => {
              e.stopPropagation();
              setCollapsedHours(prev => ({
                ...prev,
                [h]: !collapsed
              }));
            };

            return (
              <div
                key={h}
                className={`grid-hour-header ${h === highlightHour ? 'hour-highlight' : ''}`}
                onClick={() => handleHourClick(h)}
                style={{ 
                  cursor: locked ? 'not-allowed' : 'pointer',
                  height: isMobile && collapsed ? '40px' : undefined,
                  display: 'flex',
                  flexDirection: isMobile ? 'row' : 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: isMobile ? '0 4px' : undefined
                }}
              >
                {canCollapse && (
                  <button
                    onClick={toggleIndividualHour}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                )}
                <span className="hour-text">
                  {formatHour(h).line1}
                  {!collapsed && formatHour(h).line2 && <><br /><span style={{ fontSize: '0.55rem', opacity: 0.8 }}>{formatHour(h).line2}</span></>}
                </span>
              </div>
            );
          })}
        </div>

        {STATUS_OPTIONS.map((status) => (
          <div className="grid-status-row" key={status}>
            <div className="grid-status-label">
              {status.toUpperCase().replace('-', ' ')}
            </div>
            {Array.from({ length: renderedHoursCount }).map((_, idx) => {
              const h = startHour + idx;
              const collapsed = isHourCollapsed(h);

              return (
                <div 
                  key={`${status}-${h}`} 
                  className={`hour-block ${h === highlightHour ? 'hour-highlight' : ''}`}
                  style={{
                    height: isMobile && collapsed ? '40px' : undefined,
                    display: isMobile && collapsed ? 'flex' : undefined,
                    flexDirection: isMobile && collapsed ? 'row' : undefined
                  }}
                >
                  {isMobile && collapsed ? (
                    Array.from({ length: 4 }).map((_, q) => {
                      const index = h * 4 + q;
                      const isActive = grid[index] === status;
                      return (
                        <div
                          key={index}
                          className={`quarter-cell ${isActive ? `active-${status}` : ''}`}
                          onClick={(e) => { e.preventDefault(); handlePointerDown(index, status); }}
                          style={{ 
                            cursor: locked ? 'not-allowed' : 'pointer', 
                            touchAction: 'manipulation',
                            height: '100%',
                            flex: 1,
                            borderRight: q < 3 ? '1px solid var(--border-color)' : undefined,
                            borderBottom: '2px solid var(--border-color)',
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                          }}
                        >
                          {preferences.showTimestamps && isActive && (
                            <span style={{
                              fontSize: '0.5rem',
                              color: 'rgba(255,255,255,0.9)',
                              pointerEvents: 'none',
                              userSelect: 'none',
                              writingMode: 'vertical-rl',
                              transform: 'rotate(180deg)',
                              whiteSpace: 'nowrap',
                              lineHeight: 1
                            }}>
                              {formatQuarterShort(h, q)}
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    Array.from({ length: 4 }).map((_, q) => {
                      const index = h * 4 + q;
                      const isActive = grid[index] === status;
                      return (
                        <div
                          key={index}
                          className={`quarter-cell ${isActive ? `active-${status}` : ''}`}
                          onClick={(e) => { e.preventDefault(); handlePointerDown(index, status); }}
                          style={{ cursor: locked ? 'not-allowed' : 'pointer', touchAction: 'manipulation' }}
                        >
                          {preferences.showTimestamps && isActive && (
                            <span className="cell-timestamp">{formatQuarterTime(h, q)}</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
