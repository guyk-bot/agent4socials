/** Exact copy previously returned by the insights API; may still live in localStorage/session caches. */
const LEGACY_INSTAGRAM_INSIGHTS_UNAVAILABLE =
  'Instagram insights temporarily unavailable. Try reconnecting your account from the sidebar.';

export function isLegacyInstagramInsightsUnavailableHint(h: string | undefined | null): boolean {
  if (!h) return false;
  return h.trim().toLowerCase() === LEGACY_INSTAGRAM_INSIGHTS_UNAVAILABLE.toLowerCase();
}

/** Drop retired hint text so old persisted caches cannot surface it in the UI. */
export function stripLegacyInsightsHint<T extends { insightsHint?: string }>(row: T | null | undefined): T | null | undefined {
  if (!row) return row;
  if (!isLegacyInstagramInsightsUnavailableHint(row.insightsHint)) return row;
  const { insightsHint: _removed, ...rest } = row;
  return rest as T;
}
