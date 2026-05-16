import { useState } from 'react';
import { Shield } from 'lucide-react';

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
      zIndex: 3000,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '500px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'var(--bg-tertiary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
            border: '2px solid var(--glass-border)'
          }}>
            <Shield size={32} color="var(--text-secondary)" />
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            {isNavigating ? 'Unsaved Changes' : 'Reason for Edit'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {isNavigating 
              ? 'You have modified a locked day. Please provide a reason to save or discard changes.' 
              : 'Historical or locked data is being modified. A justification is required for the audit log.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Justification / Reason Code</label>
          <textarea
            autoFocus
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              fontSize: '0.9rem'
            }}
            placeholder="e.g., Corrected duty status mismatch from dispatch records..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn-primary" 
            style={{ 
              width: '100%', 
              justifyContent: 'center',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)'
            }}
            disabled={!reason.trim()}
            onClick={() => {
              onSave(reason);
              setReason('');
            }}
          >
            {isNavigating ? 'Save & Navigate' : 'Confirm & Save'}
          </button>
          
          {onDiscard && (
            <button 
              className="btn-primary" 
              style={{ 
                width: '100%', 
                justifyContent: 'center',
                background: 'transparent',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)'
              }}
              onClick={() => {
                onDiscard();
                setReason('');
              }}
            >
              Discard Changes
            </button>
          )}

          <button 
            style={{ 
              width: '100%', 
              background: 'none',
              border: 'none',
              color: 'var(--accent-blue)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '0.25rem'
            }}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
