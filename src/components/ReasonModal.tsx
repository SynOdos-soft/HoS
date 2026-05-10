import { useState } from 'react';
import { Shield } from 'lucide-react';

interface ReasonModalProps {
  isOpen: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}

export const ReasonModal: React.FC<ReasonModalProps> = ({ isOpen, onSave, onCancel }) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '450px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        border: '1px solid var(--accent-red)',
        boxShadow: '0 0 40px rgba(239, 68, 68, 0.2)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(239, 68, 68, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
            border: '2px solid var(--accent-red)'
          }}>
            <Shield size={32} color="var(--accent-red)" />
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--accent-red)' }}>Reason for Edit</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Historical or locked data is being modified. A justification is required for the audit log.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Justification / Reason Code</label>
          <textarea
            autoFocus
            style={{
              width: '100%',
              minHeight: '120px',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
            }}
            placeholder="e.g., Corrected duty status mismatch from dispatch records, Odometer typo correction..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn-primary" 
            style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-color)' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            style={{ flex: 1, background: 'var(--accent-red)' }}
            disabled={!reason.trim()}
            onClick={() => {
              onSave(reason);
              setReason('');
            }}
          >
            Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
};
