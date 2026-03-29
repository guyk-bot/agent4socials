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
