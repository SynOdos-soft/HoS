import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { WeeklyMetadata, Preferences } from '../types';
import { Field, FieldLabel, Input, Select } from './ui/form-controls';
import { Surface } from './ui/surface';

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
    <Surface className="no-print metadata-surface">
      <button className="ui-collapsible-trigger" type="button" onClick={() => setIsCollapsed(!isCollapsed)} aria-expanded={!isCollapsed}>
        <span>
          <span className="ui-eyebrow">Weekly record</span>
          <strong>Log details</strong>
        </span>
        {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>
      {!isCollapsed && (
        <div className="ui-collapsible-content">
          <div className="metadata-grid">
            <Field><FieldLabel htmlFor="cycle">Cycle</FieldLabel><Select id="cycle" name="cycle" value={metadata.cycle} onChange={handleChange}><option value="7-Day">7-Day</option><option value="14-Day">14-Day</option></Select></Field>
            {preferences.showCoDrivers && <Field><FieldLabel htmlFor="coDrivers">Co-driver(s)</FieldLabel><Input id="coDrivers" name="coDrivers" value={metadata.coDrivers} onChange={handleChange} placeholder="Jane Smith" /></Field>}
            <Field><FieldLabel htmlFor="operatorName">Operator name</FieldLabel><Input id="operatorName" name="operatorName" value={metadata.operatorName} onChange={handleChange} /></Field>
            <Field><FieldLabel htmlFor="operatorBusinessAddress">Business address</FieldLabel><Input id="operatorBusinessAddress" name="operatorBusinessAddress" value={metadata.operatorBusinessAddress} onChange={handleChange} /></Field>
            <Field><FieldLabel htmlFor="homeTerminalAddress">Home terminal</FieldLabel><Input id="homeTerminalAddress" name="homeTerminalAddress" value={metadata.homeTerminalAddress} onChange={handleChange} /></Field>
            {preferences.showTrailerPlate && <Field><FieldLabel htmlFor="trailerPlate">Trailer plate</FieldLabel><Input id="trailerPlate" name="trailerPlate" value={metadata.trailerPlate} onChange={handleChange} /></Field>}
            {preferences.showExempt && <Field><FieldLabel htmlFor="exemptHrs14Day">Exempt hours (14-day)</FieldLabel><Input id="exemptHrs14Day" name="exemptHrs14Day" value={metadata.exemptHrs14Day} onChange={handleChange} /></Field>}
            <Field><FieldLabel htmlFor="signature">Signature / print name</FieldLabel><Input id="signature" name="signature" value={metadata.signature} onChange={handleChange} placeholder="Sign here" /></Field>
          </div>
        </div>
      )}
    </Surface>
  );
};
