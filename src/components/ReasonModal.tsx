import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea, Field, FieldLabel } from './ui/form-controls';

interface ReasonModalProps {
  isOpen: boolean;
  onSave: (reason: string) => void;
  onDiscard?: () => void;
  onCancel: () => void;
  isNavigating?: boolean;
}

export const ReasonModal: React.FC<ReasonModalProps> = ({ isOpen, onSave, onDiscard, onCancel, isNavigating }) => {
  const [reason, setReason] = useState('');
  if (!isOpen) return null;
  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="reason-title">
        <div className="ui-modal-icon"><Shield size={26} /></div>
        <div className="ui-modal-heading">
          <h2 id="reason-title">{isNavigating ? 'Unsaved changes' : 'Reason for edit'}</h2>
          <p>{isNavigating ? 'A locked day was modified. Save a reason or discard the changes before continuing.' : 'Historical or locked data requires a justification for the audit log.'}</p>
        </div>
        <Field>
          <FieldLabel htmlFor="edit-reason">Justification / reason code</FieldLabel>
          <Textarea id="edit-reason" autoFocus placeholder="Corrected duty status mismatch from dispatch records..." value={reason} onChange={e => setReason(e.target.value)} />
        </Field>
        <div className="ui-modal-actions">
          <Button disabled={!reason.trim()} onClick={() => { onSave(reason); setReason(''); }}>{isNavigating ? 'Save & navigate' : 'Confirm & save'}</Button>
          {onDiscard && <Button variant="outline" onClick={() => { onDiscard(); setReason(''); }}>Discard changes</Button>}
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
