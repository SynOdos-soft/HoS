import React from 'react';
import { PaintMode, Preferences } from '../types';
import { Bed, Navigation, Briefcase, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToolbarProps { paintMode: PaintMode; setPaintMode: (mode: PaintMode) => void; preferences: Preferences; }

export const Toolbar: React.FC<ToolbarProps> = ({ paintMode, setPaintMode, preferences }) => {
  const controls: { mode: PaintMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'cycle', label: 'Cycle mode', icon: <RefreshCw /> },
    { mode: 'off-duty', label: 'Off-duty', icon: <span className="status-indicator off-duty" /> },
    ...(preferences.showSleeper ? [{ mode: 'sleeper' as PaintMode, label: 'Sleeper', icon: <Bed /> }] : []),
    { mode: 'driving', label: 'Driving', icon: <Navigation /> },
    { mode: 'on-duty', label: 'On-duty', icon: <Briefcase /> },
  ];

  return (
    <div className="toolbar no-print" role="toolbar" aria-label="Duty status paint mode">
      {controls.map(control => (
        <Button
          key={control.mode}
          type="button"
          variant="ghost"
          className={`tool-btn ${paintMode === control.mode ? 'active' : ''}`}
          data-status={control.mode}
          onClick={() => setPaintMode(control.mode)}
        >
          {control.icon} {control.label}
        </Button>
      ))}
    </div>
  );
};
