/** Per-account insights cache using localStorage (survives refresh + new tabs)
 *  and sessionStorage (fast fallback within same tab).
 *
 *  Every entry carries `_fetchedAt: Date.now()` and `_dateRange: {start, end}`.
 *  This lets callers distinguish two cases:
 *
 *  1. EXACT match (same account + same date range) → show immediately, no TTL.
 *     The background SWR will silently update when fresh data arrives.
 *
 *  2. STALE match (same account, different date range) → only show if < 10 min old.
 *     Older stale data from a different range causes the "mountain" artifact
 *     (all time-series points cluster at wrong x-axis positions) so we reject it.
 */

import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';

const SESSION_PREFIX = 'a4s_dash_insights_v1';
const LS_PREFIX = 'a4s_acct_insights';
const MAX_BYTES = 450_000;

/**
 * Maximum age for stale-but-wrong-range cache data shown while fresh data loads.
 * Data for a DIFFERENT date range older than this is silently discarded to prevent
 * the "mountain" artifact. Data for the EXACT same range is always shown (no TTL).
 */
export const STALE_CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function sessionKey(userId: string, accountId: string) {
  return `${SESSION_PREFIX}_${userId}_${accountId}`;
}

function lsKey(accountId: string) {
  return `${LS_PREFIX}_${accountId}`;
}

function slimInsights(payload: Record<string, unknown>): Record<string, unknown> {
  const o = { ...payload };
  for (const k of ['raw', 'facebookInsightsSync', 'facebookInsightPersistence', 'facebookDataSourceDebug'] as const) {
    delete o[k];
  }
  return o;
}

function isFresh(parsed: Record<string, unknown>, maxAgeMs: number): boolean {
  const t = parsed._fetchedAt;
  return typeof t === 'number' && Number.isFinite(t) && Date.now() - t <= maxAgeMs;
}

function isExactRangeMatch(
  parsed: Record<string, unknown>,
  dateRange: { start: string; end: string }
): boolean {
  const dr = parsed._dateRange as { start?: string; end?: string } | undefined;
  return dr?.start === dateRange.start && dr?.end === dateRange.end;
}

function parseEntry(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return stripLegacyInsightsHint(parsed as { insightsHint?: string }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readRaw(key: string, storage: Storage): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return parseEntry(raw);
  } catch {
    return null;
  }
}

/**
 * Read per-account insights from localStorage.
 *
 * - If `dateRange` is provided and matches the stored range → return immediately (no TTL).
 * - If `dateRange` is provided but DOESN'T match → only return if fresh (< STALE_CACHE_MAX_AGE_MS).
 * - If `dateRange` is not provided → return with `maxAgeMs` TTL (default: Infinity).
 */
export function readInsightsFromLocalStorage(
  accountId: string,
  maxAgeMs?: number,
  dateRange?: { start: string; end: string }
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const obj = readRaw(lsKey(accountId), localStorage);
  if (!obj) return null;
  if (dateRange) {
    // Exact range match: always valid regardless of age.
    if (isExactRangeMatch(obj, dateRange)) return obj;
    // Different range: apply stale TTL.
    return isFresh(obj, STALE_CACHE_MAX_AGE_MS) ? obj : null;
  }
  // Fallback: legacy callers that don't pass dateRange.
  if (maxAgeMs !== undefined && maxAgeMs < Infinity) {
    // Entries without a timestamp are treated as expired.
    if (!isFresh(obj, maxAgeMs)) return null;
  }
  return obj;
}

export function readDashboardInsightsSession(
  userId: string,
  accountId: string,
  maxAgeMs?: number,
  dateRange?: { start: string; end: string }
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const obj = readRaw(sessionKey(userId, accountId), sessionStorage);
  if (!obj) return null;
  if (dateRange) {
    if (isExactRangeMatch(obj, dateRange)) return obj;
    return isFresh(obj, STALE_CACHE_MAX_AGE_MS) ? obj : null;
  }
  if (maxAgeMs !== undefined && maxAgeMs < Infinity) {
    if (!isFresh(obj, maxAgeMs)) return null;
  }
  return obj;
}

export function writeDashboardInsightsSession(
  userId: string,
  accountId: string,
  payload: unknown,
  dateRange?: { start: string; end: string }
): void {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return;
  try {
    const cleaned = stripLegacyInsightsHint(payload as { insightsHint?: string });
    const slim = slimInsights((cleaned ?? payload) as Record<string, unknown>);
    slim._fetchedAt = Date.now();
    if (dateRange) slim._dateRange = dateRange;
    const str = JSON.stringify(slim);
    if (str.length > MAX_BYTES) return;
    sessionStorage.setItem(sessionKey(userId, accountId), str);
    localStorage.setItem(lsKey(accountId), str);
  } catch {
    // quota or private mode
  }
}
