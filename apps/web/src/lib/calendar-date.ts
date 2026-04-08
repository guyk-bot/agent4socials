/**
 * Analytics date strings (YYYY-MM-DD) aligned with the user's local calendar.
 * Using toISOString().slice(0, 10) is UTC and can shift the day vs <input type="date"> and presets.
 */

export function toLocalCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO or Graph timestamp to local calendar date for range filters. */
export function localCalendarDateFromIso(iso: string): string {
  if (!iso || typeof iso !== 'string') return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
    return m ? m[1] : '';
  }
  return toLocalCalendarDate(new Date(t));
}

/** Last 30 local days inclusive (same span as previous default, without UTC drift). */
export function getDefaultAnalyticsDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
}

const ANALYTICS_DATE_RANGE_KEY = 'agent4socials.dashboardAnalyticsDateRange';

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function analyticsDateRangeStorageKey(userId: string): string {
  return `${ANALYTICS_DATE_RANGE_KEY}.u:${userId}`;
}

/** Restores last analytics range after a full page refresh (same tab). Scoped per logged-in user. */
export function readStoredAnalyticsDateRange(userId: string): { start: string; end: string } | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = sessionStorage.getItem(analyticsDateRangeStorageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { start?: unknown; end?: unknown };
    const start = typeof p.start === 'string' ? p.start : '';
    const end = typeof p.end === 'string' ? p.end : '';
    if (!isYmd(start) || !isYmd(end) || start > end) return null;
    const today = toLocalCalendarDate(new Date());
    const endClamped = end > today ? today : end;
    return { start, end: endClamped };
  } catch {
    return null;
  }
}

export function writeStoredAnalyticsDateRange(range: { start: string; end: string }, userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  if (!isYmd(range.start) || !isYmd(range.end) || range.start > range.end) return;
  try {
    sessionStorage.setItem(analyticsDateRangeStorageKey(userId), JSON.stringify(range));
  } catch {
    /* quota or private mode */
  }
}
