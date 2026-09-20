import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { WeeklyMetadata, Preferences, OperatorCompany } from '../types';
import { Field, FieldLabel, Input, Select } from './ui/form-controls';
import { Surface } from './ui/surface';

interface MetadataFormProps {
  metadata: WeeklyMetadata;
  setMetadata: (metadata: WeeklyMetadata) => void;
  preferences: Preferences;
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ metadata, setMetadata, preferences }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [operatorAutocompleteOpen, setOperatorAutocompleteOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const companies: OperatorCompany[] = preferences.userProfile?.operatorCompanies || [];

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const openOperatorAutocomplete = () => {
    // Cancel any pending close so quick blur→refocus can't slam it shut
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (companies.length > 0) setOperatorAutocompleteOpen(true);
  };

  const scheduleCloseOperatorAutocomplete = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOperatorAutocompleteOpen(false);
      closeTimerRef.current = null;
    }, 200);
  };

  const selectCompany = (company: OperatorCompany) => {
    setMetadata({
      ...metadata,
      operatorName: company.name,
      operatorBusinessAddress: company.businessAddress || '',
      homeTerminalAddress: company.homeTerminalAddress || ''
    });
    setOperatorAutocompleteOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setMetadata({ ...metadata, [name]: value });
  };

  const filteredCompanies = companies.filter(c => {
    const search = (metadata.operatorName || '').trim().toLowerCase();
    return !search || c.name.toLowerCase().includes(search);
  });

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
            <Field style={{ position: 'relative' }}>
              <FieldLabel htmlFor="operatorName">Operator name</FieldLabel>
              <Input
                id="operatorName"
                name="operatorName"
                value={metadata.operatorName}
                onChange={(e) => { handleChange(e); openOperatorAutocomplete(); }}
                onFocus={openOperatorAutocomplete}
                onBlur={scheduleCloseOperatorAutocomplete}
                autoComplete="off"
                placeholder="Search saved companies"
              />
              {operatorAutocompleteOpen && filteredCompanies.length > 0 && (
                <div className="autocomplete-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                  {filteredCompanies.map(c => (
                    <div
                      key={c.id}
                      className="autocomplete-option"
                      onMouseDown={(e) => { e.preventDefault(); selectCompany(c); }}
                      style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-primary)', textAlign: 'left' }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {c.homeTerminalAddress && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Home terminal: {c.homeTerminalAddress}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Field>
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
