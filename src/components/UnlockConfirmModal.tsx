import React from 'react';
import { LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UnlockConfirmModalProps { isOpen: boolean; onConfirm: () => void; onCancel: () => void; }

export const UnlockConfirmModal: React.FC<UnlockConfirmModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal ui-modal-warning" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <div className="ui-modal-icon"><LockOpen size={26} /></div>
        <div className="ui-modal-heading">
          <h2 id="unlock-title">Unlock historical log</h2>
          <p><strong>Warning:</strong> Unlocking a past day for editing is recorded in the forensic audit log for compliance.</p>
        </div>
        <div className="ui-modal-actions">
          <Button onClick={onConfirm}>Confirm unlock</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
