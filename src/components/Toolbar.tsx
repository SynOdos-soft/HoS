import React from 'react';
import { PaintMode, Preferences } from '../types';
import { Bed, Navigation, Briefcase, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '../utils/i18n';

interface ToolbarProps { paintMode: PaintMode; setPaintMode: (mode: PaintMode) => void; preferences: Preferences; }

export const Toolbar: React.FC<ToolbarProps> = ({ paintMode, setPaintMode, preferences }) => {
  const t = useT();
  const controls: { mode: PaintMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'cycle', label: t('cycle'), icon: <RefreshCw /> },
    { mode: 'off-duty', label: t('offDuty'), icon: <span className="status-indicator off-duty" /> },
    ...(preferences.showSleeper ? [{ mode: 'sleeper' as PaintMode, label: t('sleeper'), icon: <Bed /> }] : []),
    { mode: 'driving', label: t('driving'), icon: <Navigation /> },
    { mode: 'on-duty', label: t('onDuty'), icon: <Briefcase /> },
  ];

  return (
    <div className="toolbar no-print" role="toolbar" aria-label={t('dutyStatusPaintMode')}>
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
