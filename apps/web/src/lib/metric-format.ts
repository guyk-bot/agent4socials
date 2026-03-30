/**
 * Full numeric display for dashboard metrics (grouped digits, no K/M suffix).
 * Use for follower counts, impressions, and other KPIs across platforms.
 */
export function formatMetricNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
}
