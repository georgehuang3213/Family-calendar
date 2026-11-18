export const TAIPEI_TZ = 'Asia/Taipei';

const taipeiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TAIPEI_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const taipeiTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TAIPEI_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const taipeiYearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TAIPEI_TZ,
  year: 'numeric',
});

/** Format a Date as YYYY-MM-DD in Asia/Taipei regardless of host OS timezone. */
export function formatTaipeiDate(date: Date = new Date()): string {
  return taipeiDateFormatter.format(date);
}

/** Format a Date as HH:mm (00:00..23:59) in Asia/Taipei regardless of host OS timezone. */
export function formatTaipeiHHmm(date: Date = new Date()): string {
  const formatted = taipeiTimeFormatter.format(date);
  return formatted.startsWith('24:') ? `00:${formatted.slice(3)}` : formatted;
}

/** Return the 4-digit year in Asia/Taipei regardless of host OS timezone. */
export function getTaipeiYear(date: Date = new Date()): number {
  return Number(taipeiYearFormatter.format(date));
}

/** Return weekday index (0 = Sunday .. 6 = Saturday) for a YYYY-MM-DD string. */
export function getWeekdayFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Add `days` (positive or negative) to a YYYY-MM-DD date string without host TZ drift. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Normalize "YYYY-M-D" or "YYYY/M/D" strings to zero-padded "YYYY-MM-DD". */
export function normalizeEventDate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return value;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** Check that a string is YYYY-MM-DD and represents a real calendar date (e.g. rejects 2026-02-31). */
export function isValidCalendarDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}
