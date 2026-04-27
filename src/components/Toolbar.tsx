import React from 'react';
import { PaintMode, Preferences } from '../types';
import { Bed, Navigation, Briefcase, RefreshCw } from 'lucide-react';

interface ToolbarProps {
  paintMode: PaintMode;
  setPaintMode: (mode: PaintMode) => void;
  preferences: Preferences;
}

export const Toolbar: React.FC<ToolbarProps> = ({ paintMode, setPaintMode, preferences }) => {
  return (
    <div className="toolbar no-print">
      <button 
        className={`tool-btn ${paintMode === 'cycle' ? 'active' : ''}`}
        data-status="cycle"
        onClick={() => setPaintMode('cycle')}
      >
        <RefreshCw size={18} /> Cycle Mode
      </button>
      <button 
        className={`tool-btn ${paintMode === 'off-duty' ? 'active' : ''}`}
        data-status="off-duty"
        onClick={() => setPaintMode('off-duty')}
      >
        <div className="status-indicator off-duty" /> Off-Duty
      </button>
      {preferences.showSleeper && (
        <button 
          className={`tool-btn ${paintMode === 'sleeper' ? 'active' : ''}`}
          data-status="sleeper"
          onClick={() => setPaintMode('sleeper')}
        >
          <Bed size={18} /> Sleeper
        </button>
      )}
      <button 
        className={`tool-btn ${paintMode === 'driving' ? 'active' : ''}`}
        data-status="driving"
        onClick={() => setPaintMode('driving')}
      >
        <Navigation size={18} /> Driving
      </button>
      <button 
        className={`tool-btn ${paintMode === 'on-duty' ? 'active' : ''}`}
        data-status="on-duty"
        onClick={() => setPaintMode('on-duty')}
      >
        <Briefcase size={18} /> On-Duty
      </button>
    </div>
  );
};
