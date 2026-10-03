import React from 'react';
import { LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '../utils/i18n';

interface UnlockConfirmModalProps { isOpen: boolean; onConfirm: () => void; onCancel: () => void; }

export const UnlockConfirmModal: React.FC<UnlockConfirmModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const t = useT();
  if (!isOpen) return null;
  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal ui-modal-warning" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <div className="ui-modal-icon"><LockOpen size={26} /></div>
        <div className="ui-modal-heading">
          <h2 id="unlock-title">{t('unlockHistoricalLog')}</h2>
          <p><strong>{t('warningLabel')}</strong> {t('unlockBody')}</p>
        </div>
        <div className="ui-modal-actions">
          <Button variant="ghost" onClick={onCancel}>{t('cancel')}</Button>
          <Button onClick={onConfirm}>{t('confirmUnlock')}</Button>
        </div>
      </div>
    </div>
  );
};
