import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Solar } from 'lunar-javascript';
import {
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { FAMILY_MEMBERS, MEMBER_COLORS } from '../../shared/constants';
import type { CalendarEvent, EventFormState } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-02-16': '除夕',
  '2026-02-17': '春節',
  '2026-02-18': '春節',
  '2026-02-19': '春節',
  '2026-02-20': '春節',
  '2026-02-21': '春節',
  '2026-02-28': '和平紀念日',
  '2026-04-04': '兒童節/清明節',
  '2026-05-01': '勞動節',
  '2026-06-19': '端午節',
  '2026-09-25': '中秋節',
  '2026-10-10': '國慶日',
};

export const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: '晴朗',
  1: '晴時多雲',
  2: '多雲',
  3: '陰天',
  45: '霧',
  48: '霧',
  51: '毛毛雨 (輕微)',
  53: '毛毛雨 (中等)',
  55: '毛毛雨 (密集)',
  61: '雨 (輕微)',
  63: '雨 (中等)',
  65: '雨 (大雨)',
  71: '雪 (輕微)',
  73: '雪 (中等)',
  75: '雪 (大雪)',
  80: '陣雨 (輕微)',
  81: '陣雨 (中等)',
  82: '陣雨 (大雨)',
  95: '雷陣雨',
  96: '雷陣雨伴有冰雹',
  99: '雷陣雨伴有強烈冰雹',
};

/** Normalize YYYY-M-D or YYYY/M/D into YYYY-MM-DD, and parse safely into a valid local Date. */
export function safeParseISO(dateStr: string | undefined | null): Date {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const trimmed = dateStr.trim();
  if (!trimmed) return new Date();

  const simpleMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (simpleMatch) {
    const padded = `${simpleMatch[1]}-${simpleMatch[2].padStart(2, '0')}-${simpleMatch[3].padStart(2, '0')}`;
    const parsed = parseISO(padded);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const normalizedDate = trimmed.replace(/\//g, '-');
  try {
    const parsed = parseISO(normalizedDate);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {
    // Fallback below
  }

  const native = new Date(normalizedDate);
  return isNaN(native.getTime()) ? new Date() : native;
}

/** Return normalized [start, end] day boundaries for an event (falling back end_date to start_date). */
export function getEventDayBounds(event: Pick<CalendarEvent, 'start_date' | 'end_date'>): { start: Date; end: Date } {
  const s = startOfDay(safeParseISO(event.start_date));
  const e = startOfDay(safeParseISO(event.end_date || event.start_date));
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

export function isEventOnDate(event: Pick<CalendarEvent, 'start_date' | 'end_date'>, date: Date): boolean {
  try {
    const { start, end } = getEventDayBounds(event);
    const current = startOfDay(date);
    return isWithinInterval(current, { start, end });
  } catch {
    return false;
  }
}

/** Count how many calendar days of an event fall inside the month of `monthDate`. */
export function countEventDaysInMonth(event: Pick<CalendarEvent, 'start_date' | 'end_date'>, monthDate: Date): number {
  const { start, end } = getEventDayBounds(event);
  const mStart = startOfDay(startOfMonth(monthDate));
  const mEnd = startOfDay(endOfMonth(monthDate));
  if (end < mStart || start > mEnd) return 0;
  const overlapStart = start > mStart ? start : mStart;
  const overlapEnd = end < mEnd ? end : mEnd;
  return differenceInCalendarDays(overlapEnd, overlapStart) + 1;
}

export function formatTimeDisplay(timeStr: string | undefined | null): string {
  if (!timeStr) return '';
  const s = String(timeStr);
  if (s.includes('T')) {
    try {
      const date = new Date(s);
      if (!isNaN(date.getTime())) {
        if (date.getFullYear() < 1920) return '';
        return format(date, 'HH:mm');
      }
    } catch {
      // ignore
    }
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.substring(0, 5);
  }
  if (s.includes(' - ')) {
    return s.replace(' - ', ' ~ ');
  }
  return s;
}

function padHHmm(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Parse event.time (supports "HH:mm", "H:mm", "HH:mm - HH:mm", "HH:mm ~ HH:mm", ISO) into <input type="time"> values. */
export function parseEventTimeRange(
  timeStr: unknown,
  dateStr?: unknown
): { startTime: string; endTime: string; displayTime: string } {
  if (!timeStr) {
    if (dateStr && String(dateStr).includes('T')) {
      const d = new Date(String(dateStr));
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1920) {
        const hhmm = format(d, 'HH:mm');
        return { startTime: hhmm, endTime: '', displayTime: hhmm };
      }
    }
    return { startTime: '', endTime: '', displayTime: '' };
  }

  const s = String(timeStr).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1920) {
      const hhmm = format(d, 'HH:mm');
      return { startTime: hhmm, endTime: '', displayTime: hhmm };
    }
  }

  const rangeMatch = s.match(/^(.*?)\s*[-~～]\s*(.*)$/);
  if (rangeMatch) {
    const startTime = padHHmm(rangeMatch[1]);
    const endTime = padHHmm(rangeMatch[2]);
    return { startTime, endTime, displayTime: s };
  }

  const single = padHHmm(s);
  return { startTime: single, endTime: '', displayTime: single || s };
}

export function normalizeDateForInput(d: unknown): string {
  if (!d) return format(new Date(), 'yyyy-MM-dd');
  const s = String(d).trim();
  if (s.includes('T')) {
    const date = new Date(s);
    if (!isNaN(date.getTime())) {
      return format(date, 'yyyy-MM-dd');
    }
    return s.split('T')[0];
  }
  const simpleMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (simpleMatch) {
    return `${simpleMatch[1]}-${simpleMatch[2].padStart(2, '0')}-${simpleMatch[3].padStart(2, '0')}`;
  }
  return s.replace(/\//g, '-').split(' ')[0];
}

export function getLunarDate(date: Date): string {
  try {
    const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const lunar = solar.getLunar();
    const jieQi = lunar.getJieQi();
    const lunarStr = lunar.getDay() === 1 ? `${lunar.getMonthInChinese()}月` : lunar.getDayInChinese();
    return jieQi ? `${lunarStr} ${jieQi}` : lunarStr;
  } catch {
    return '';
  }
}

export function createEmptyEventForm(dateStr: string = format(new Date(), 'yyyy-MM-dd')): EventFormState {
  return {
    title: '',
    description: '',
    start_date: dateStr,
    end_date: dateStr,
    time: '',
    start_time: '',
    end_time: '',
    member_name: FAMILY_MEMBERS[0],
    color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
    companions: '',
    is_important: false,
  };
}

/** Extract clean, allowlisted fields for POST/PUT /api/events payloads. */
export function buildCleanEventPayload(ev: Partial<CalendarEvent>) {
  return {
    title: ev.title ?? '',
    description: ev.description ?? '',
    start_date: ev.start_date ?? '',
    end_date: ev.end_date || ev.start_date || '',
    time: ev.time ?? '',
    member_name: ev.member_name ?? FAMILY_MEMBERS[0],
    color: ev.color || MEMBER_COLORS[ev.member_name ?? FAMILY_MEMBERS[0]] || '#4F46E5',
    companions: ev.companions ?? '',
    is_important: Boolean(ev.is_important),
  };
}
