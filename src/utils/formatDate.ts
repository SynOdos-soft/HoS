/**
 * Shared date formatting — ISO YYYY/MM/DD everywhere in the UI.
 *
 * Rationale: locale formats like 6/17/2026 are ambiguous (MM/DD vs DD/MM)
 * and differ per device; week ids in this app are already ISO. One format,
 * zero ambiguity, identical on every screen.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY/MM/DD` for any parseable date input. */
export const formatDateIso = (input: string | number | Date): string => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : String(input);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

/** `YYYY/MM/DD HH:mm` in the device's local time. */
export const formatDateTimeIso = (input: string | number | Date): string => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : String(input);
  return `${formatDateIso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
