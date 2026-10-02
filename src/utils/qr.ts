import qrcode from 'qrcode-generator';

export interface QrMatrix {
  /** Modules per side (finder patterns included, quiet zone excluded). */
  size: number;
  /** SVG path data: one `M x y h1 v1 h-1 z` sub-path per dark module. */
  path: string;
  /** Module lookup (used by tests to decode the code back to its text). */
  isDark: (row: number, col: number) => boolean;
}

/**
 * QR byte mode is 7-bit; percent-encode anything else so a surprising
 * character (an emoji in a remark, a unicode hostname) still scans.
 */
const toAscii = (value: string): string =>
  value.replace(/[^\x20-\x7E]/g, char =>
    Array.from(new TextEncoder().encode(char))
      .map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('')
  );

/**
 * Build the QR matrix for a value. Uses error-correction level M first and
 * falls back to L so long handoff links still fit; returns null when the data
 * is too large for any QR code.
 */
export const buildQrMatrix = (value: string): QrMatrix | null => {
  const ascii = toAscii(value);
  for (const level of ['M', 'L'] as const) {
    try {
      const qr = qrcode(0, level);
      qr.addData(ascii, 'Byte');
      qr.make();
      const size = qr.getModuleCount();
      let path = '';
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
        }
      }
      return { size, path, isDark: (row, col) => qr.isDark(row, col) };
    } catch {
      // Data exceeded this correction level — try the next, more tolerant one.
    }
  }
  return null;
};
