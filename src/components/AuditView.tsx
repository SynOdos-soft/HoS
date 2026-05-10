import { AuditEntry } from '../types';
import { ArrowLeft, Shield, Clock, FileText, User, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface AuditViewProps {
  auditLog: AuditEntry[];
  onBack: () => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ auditLog, onBack }) => {
  return (
    <div className="audit-view-container">
      <header className="header no-print" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="tool-btn" onClick={onBack} style={{ padding: '0.5rem' }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={24} color="var(--accent-orange)" />
            Audit History & Compliance
          </h1>
        </div>
      </header>

      <div className="glass-panel" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ borderLeft: '4px solid var(--accent-orange)', paddingLeft: '1rem', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Forensic Data Integrity Log</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            All modifications to historical or locked logs are recorded below with mandatory justification.
            This log ensures non-repudiation for regulatory roadside inspections.
          </p>
        </div>

        {auditLog.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', opacity: 0.5 }}>
            <AlertCircle size={48} />
            <p>No audit entries found for this week.</p>
          </div>
        ) : (
          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Affected Record</th>
                  <th>Original Value</th>
                  <th>New Value</th>
                  <th>Justification / Reason</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.slice().reverse().map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <Clock size={14} color="var(--text-secondary)" />
                        {format(parseISO(entry.timestamp), 'yyyy-MM-dd')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.4rem' }}>
                        {format(parseISO(entry.timestamp), 'HH:mm:ss')}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={14} color="var(--accent-blue)" />
                        <span style={{ fontWeight: 600 }}>{entry.field}</span>
                      </div>
                      {entry.date && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.4rem' }}>
                          Log Date: {entry.date}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="original-value">{entry.originalValue}</span>
                    </td>
                    <td>
                      <span className="new-value">{entry.newValue}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div className="audit-reason">"{entry.reason || 'No justification provided'}"</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <User size={12} />
                          <span className="audit-badge" style={{ padding: '2px 8px' }}>{entry.editedBy}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .audit-view-container {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
