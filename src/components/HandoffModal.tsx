import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, Download, Copy, Check, Share2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Preferences, WeeklyLog } from '../types';
import { buildOfficerReport, buildOfficerUrl } from '../utils/officerReport';
import { QrCodeSvg } from './QrCodeSvg';

interface HandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: WeeklyLog[];
  preferences: Preferences;
  /** Triggers the existing roadside (15-day) PDF export. */
  onRoadsidePDF: () => void;
}

/** A phone can only scan a link it can actually reach. */
const isUnreachableHost = (hostname: string): boolean =>
  hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

const fallbackCopy = (text: string): boolean => {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

/**
 * One screen for handing the record over: download the roadside PDF, or show
 * the QR code / link so the officer can open the read-only 15-day report on
 * their own phone.
 */
export const HandoffModal: React.FC<HandoffModalProps> = ({ isOpen, onClose, logs, preferences, onRoadsidePDF }) => {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const report = useMemo(() => buildOfficerReport(logs, preferences), [logs, preferences]);
  const link = useMemo(() => {
    try {
      return { url: buildOfficerUrl(report) };
    } catch (error) {
      return { url: '', error: error instanceof Error ? error.message : 'Could not build the report link.' };
    }
  }, [report]);

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const unreachable = typeof window !== 'undefined' && isUnreachableHost(window.location.hostname);

  const handleCopy = async () => {
    if (!link.url) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link.url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = fallbackCopy(link.url);
    if (ok) {
      setCopied(true);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleShare = () => {
    if (!link.url || !canShare) return;
    void navigator
      .share({ title: '15-day driver log', text: 'Read-only hours-of-service record', url: link.url })
      .catch(() => undefined);
  };

  return (
    <div className="ui-modal-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-title"
        tabIndex={-1}
        ref={dialogRef}
        style={{ width: 'min(100%, 34rem)' }}
      >
        <div className="ui-modal-icon">
          <QrCode size={26} />
        </div>
        <div className="ui-modal-heading">
          <h2 id="handoff-title">Inspection handoff</h2>
          <p>
            Print the roadside PDF, or let the officer scan the code for a read-only copy of the last 15 days on
            their own phone.
          </p>
        </div>

        <div className="handoff-qr-wrap">
          {link.url ? (
            <>
              <div className="handoff-qr-frame">
                <QrCodeSvg value={link.url} size={232} />
              </div>
              <p className="handoff-qr-caption">Scan to open the 15-day report — large type, no editing.</p>
              {/* Full text in the DOM, ellipsised with CSS: a copied selection
                  can never be a truncated (and therefore broken) token. */}
              <code className="handoff-url" title={link.url}>{link.url}</code>
            </>
          ) : (
            <p className="handoff-qr-caption" style={{ color: 'var(--accent-red)' }}>
              {link.error || 'The report link could not be generated.'}
            </p>
          )}
        </div>

        {unreachable && (
          <div className="handoff-note handoff-note-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              This app is running on <strong>{window.location.hostname}</strong>, which a phone cannot reach. Open it
              from this device&rsquo;s network address or from the hosted app so the scan works.
            </span>
          </div>
        )}

        <div className="ui-modal-actions">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canShare && link.url && (
            <Button variant="outline" onClick={handleShare}>
              <Share2 size={16} /> Share
            </Button>
          )}
          <Button variant="outline" onClick={handleCopy} disabled={!link.url}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button
            onClick={() => {
              onRoadsidePDF();
              onClose();
            }}
          >
            <Download size={16} /> Roadside PDF
          </Button>
        </div>
        <button className="handoff-dismiss" type="button" onClick={onClose} aria-label="Close handoff dialog">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
