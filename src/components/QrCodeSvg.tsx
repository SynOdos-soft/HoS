import React, { useMemo } from 'react';
import { QrCode } from 'lucide-react';
import { buildQrMatrix } from '../utils/qr';

interface QrCodeSvgProps {
  value: string;
  /** Rendered width/height in px (the SVG scales with it). */
  size?: number;
  label?: string;
}

/** Quiet zone: QR spec wants at least four light modules around the code. */
const QUIET_ZONE = 4;

/**
 * Read-only QR code for the officer handoff. Falls back to a clear message
 * instead of rendering a broken square when the payload will not fit.
 */
export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 240, label = 'QR code linking to the 15-day report' }) => {
  const matrix = useMemo(() => buildQrMatrix(value), [value]);

  if (!matrix) {
    return (
      <div
        className="handoff-qr-fallback"
        style={{ width: size, minHeight: size, fontSize: '0.8rem' }}
        role="img"
        aria-label="QR code unavailable"
      >
        <QrCode size={28} aria-hidden="true" />
        <span>QR code unavailable — use “Copy link” instead.</span>
      </div>
    );
  }

  const span = matrix.size + QUIET_ZONE * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      style={{ display: 'block', background: '#ffffff', borderRadius: 8 }}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <g transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`}>
        <path d={matrix.path} fill="#0f172a" />
      </g>
    </svg>
  );
};
