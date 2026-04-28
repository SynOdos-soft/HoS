import React, { useState } from 'react';
import { WeeklyMetadata, Preferences } from '../types';

interface MetadataFormProps {
  metadata: WeeklyMetadata;
  setMetadata: (metadata: WeeklyMetadata) => void;
  preferences: Preferences;
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ metadata, setMetadata, preferences }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setMetadata({ ...metadata, [name]: value });
  };

  return (
    <div className="glass-panel no-print" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        className="day-panel-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem', cursor: 'pointer',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color)',
          userSelect: 'none',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Log Details (Weekly)</h2>
        <span style={{ color: 'var(--text-secondary)', transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
          ▼
        </span>
      </div>
      
      {!isCollapsed && (
        <div style={{ padding: '1rem' }}>
          <div className="metadata-grid">
            <div className="input-group">
              <label>Cycle</label>
              <select name="cycle" value={metadata.cycle} onChange={handleChange}>
                <option value="7-Day">7-Day</option>
                <option value="14-Day">14-Day</option>
              </select>
            </div>
            <div className="input-group">
              <label>Driver's Name</label>
              <input type="text" name="driverName" value={metadata.driverName} onChange={handleChange} placeholder="John Doe" />
            </div>
            {preferences.showCoDrivers && (
              <div className="input-group">
                <label>Co-Driver(s)</label>
                <input type="text" name="coDrivers" value={metadata.coDrivers} onChange={handleChange} placeholder="Jane Smith" />
              </div>
            )}
            <div className="input-group">
              <label>Operator Name</label>
              <input type="text" name="operatorName" value={metadata.operatorName} onChange={handleChange} placeholder="First student" />
            </div>
            <div className="input-group">
              <label>Operator Business Address</label>
              <input type="text" name="operatorBusinessAddress" value={metadata.operatorBusinessAddress} onChange={handleChange} placeholder="1470 Star top" />
            </div>
            <div className="input-group">
              <label>Home Terminal Address</label>
              <input type="text" name="homeTerminalAddress" value={metadata.homeTerminalAddress} onChange={handleChange} placeholder="83 Iber Rd" />
            </div>
            <div className="input-group">
              <label>CMV Plate</label>
              <input type="text" name="cmvPlate" value={metadata.cmvPlate} onChange={handleChange} placeholder="ABC 123" />
            </div>
            {preferences.showTrailerPlate && (
              <div className="input-group">
                <label>Trailer Plate</label>
                <input type="text" name="trailerPlate" value={metadata.trailerPlate} onChange={handleChange} />
              </div>
            )}
            {preferences.showExempt && (
              <div className="input-group">
                <label>Exempt Hrs (14-Day)</label>
                <input type="text" name="exemptHrs14Day" value={metadata.exemptHrs14Day} onChange={handleChange} />
              </div>
            )}
            <div className="input-group">
              <label>Signature (Print Name)</label>
              <input type="text" name="signature" value={metadata.signature} onChange={handleChange} placeholder="Sign here" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
