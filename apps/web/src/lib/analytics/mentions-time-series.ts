/** Shared helpers for @mention counts by calendar day (engagement analytics). */

export function mentionDateKey(timestamp: string | undefined): string | null {
  if (!timestamp?.trim()) return null;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function mentionInRange(dateKey: string, since?: string, until?: string): boolean {
  if (since?.trim() && dateKey < since.trim().slice(0, 10)) return false;
  if (until?.trim() && dateKey > until.trim().slice(0, 10)) return false;
  return true;
}

export function aggregateMentionsByDate(
  timestamps: Iterable<string | undefined>,
  since?: string,
  until?: string
): { total: number; series: Array<{ date: string; value: number }> } {
  const byDate = new Map<string, number>();
  for (const ts of timestamps) {
    const dateKey = mentionDateKey(ts);
    if (!dateKey || !mentionInRange(dateKey, since, until)) continue;
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + 1);
  }
  const series = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = series.reduce((s, pt) => s + pt.value, 0);
  return { total, series };
}

export type MentionsAnalyticsPayload = {
  mentionsTotal: number;
  mentionsMetricSeries: Array<{ date: string; value: number }>;
};

export function attachMentionsToInsightsExtra(
  out: { extra?: unknown },
  payload: { total: number; series: Array<{ date: string; value: number }> }
): void {
  if (payload.total === 0 && payload.series.length === 0) return;
  const prev =
    typeof out.extra === 'object' && out.extra !== null ? (out.extra as Record<string, unknown>) : {};
  out.extra = {
    ...prev,
    mentionsTotal: payload.total,
    mentionsMetricSeries: payload.series,
  };
}
