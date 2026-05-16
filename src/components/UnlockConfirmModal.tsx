import React from 'react';
import { LockOpen } from 'lucide-react';

interface UnlockConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const UnlockConfirmModal: React.FC<UnlockConfirmModalProps> = ({ isOpen, onConfirm, onCancel }) => {
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
      zIndex: 4000,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '450px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        border: '1px solid var(--accent-orange)',
        boxShadow: '0 0 40px rgba(245, 158, 11, 0.15)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(245, 158, 11, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
            border: '2px solid var(--accent-orange)'
          }}>
            <LockOpen size={32} color="var(--accent-orange)" />
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>Unlock Historical Log</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.75rem', lineHeight: '1.5' }}>
            <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>WARNING:</span> Unlocking a past day for editing will be recorded in the <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Forensic Audit Log</span> for compliance.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn-primary" 
            style={{ 
              width: '100%', 
              justifyContent: 'center',
              background: 'var(--accent-orange)',
              border: 'none',
              color: 'white'
            }}
            onClick={onConfirm}
          >
            Confirm Unlock
          </button>
          
          <button 
            className="btn-primary" 
            style={{ 
              width: '100%', 
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-secondary)'
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
