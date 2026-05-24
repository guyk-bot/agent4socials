/**
 * X-axis date labels for analytics charts: show the month name only on the first
 * visible tick of each month (e.g. "Apr 1"), then day-only for later ticks
 * in that month (e.g. "15", "24").
 */

/** Full date for tooltips and range labels (always includes month + day). */
export function formatChartShortDate(date: string): string {
  try {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return date;
  }
}

/** First tick in a month: "Mar 5". Later ticks in the same month: "12" only. */
export function formatSparseMonthAxisTick(
  date: string,
  index: number,
  sortedTickDates: readonly string[]
): string {
  try {
    const d = new Date(`${date}T12:00:00Z`);
    const day = d.getUTCDate();
    const month = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
    if (index <= 0) return `${month} ${day}`;
    const prev = sortedTickDates[index - 1];
    if (!prev) return `${month} ${day}`;
    const pd = new Date(`${prev}T12:00:00Z`);
    const changedMonth =
      d.getUTCMonth() !== pd.getUTCMonth() || d.getUTCFullYear() !== pd.getUTCFullYear();
    return changedMonth ? `${month} ${day}` : String(day);
  } catch {
    return date;
  }
}

export function sortChartTickDates(dates: readonly string[]): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

export function sparseMonthTickLabel(date: string, sortedTickDates: readonly string[]): string {
  const idx = sortedTickDates.indexOf(date);
  if (idx < 0) return formatChartShortDate(date);
  return formatSparseMonthAxisTick(date, idx, sortedTickDates);
}

export function sparseMonthTickFormatter(sortedTickDates: readonly string[]) {
  const sorted = sortChartTickDates(sortedTickDates);
  return (value: string | number) => sparseMonthTickLabel(String(value), sorted);
}

export function chartRowDates<T extends { date: string }>(rows: readonly T[]): string[] {
  return rows.map((r) => r.date);
}

/** When every chart row gets an x label (interval=0), use row order for month grouping. */
export function sparseMonthTickFormatterFromRows<T extends { date: string }>(rows: readonly T[]) {
  const dates = chartRowDates(rows);
  return (value: string | number, index?: number) => {
    const v = String(value);
    const idx = typeof index === 'number' && index >= 0 ? index : dates.indexOf(v);
    if (idx < 0) return sparseMonthTickLabel(v, sortChartTickDates(dates));
    return formatSparseMonthAxisTick(v, idx, dates);
  };
}

/** Pick axis ticks: range ends, first visible day of each month, plus event days. */
export function buildKeyDateTicks<T extends { date: string }>(
  rows: T[],
  isEvent: (row: T) => boolean,
  maxTicks = 10
): string[] {
  if (!rows.length) return [];
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  const monthStartDates: string[] = [];
  let prevMonth = '';
  for (const r of rows) {
    const monthKey = r.date.slice(0, 7);
    if (monthKey !== prevMonth) {
      monthStartDates.push(r.date);
      prevMonth = monthKey;
    }
  }

  const eventDates = rows.filter(isEvent).map((r) => r.date);
  const combined = sortChartTickDates(Array.from(new Set([first, ...monthStartDates, ...eventDates, last])));

  if (combined.length <= maxTicks) return combined;

  const sampled: string[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const idx = Math.round((i / Math.max(1, maxTicks - 1)) * (combined.length - 1));
    sampled.push(combined[idx]!);
  }
  return sortChartTickDates(Array.from(new Set(sampled)));
}
