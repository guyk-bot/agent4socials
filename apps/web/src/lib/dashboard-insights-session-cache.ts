/** Per-account insights cache using localStorage (survives refresh + new tabs)
 *  and sessionStorage (fast fallback within same tab).
 *
 *  Every entry is wrapped with `_fetchedAt: Date.now()` so callers can reject
 *  entries that are too old to display as "instant" data.
 */

import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';

const SESSION_PREFIX = 'a4s_dash_insights_v1';
const LS_PREFIX = 'a4s_acct_insights';
const MAX_BYTES = 450_000;

/**
 * Maximum age for stale cache data shown while fresh data loads.
 * Data older than this is silently discarded so users never see a "mountain"
 * artifact from a very old snapshot being shown against the current axis.
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

function parseEntry(raw: string, maxAgeMs = Infinity): Record<string, unknown> | null {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  // Entries without a timestamp are treated as expired (could be days old).
  if (maxAgeMs < Infinity && !isFresh(obj, maxAgeMs)) return null;
  return stripLegacyInsightsHint(obj as { insightsHint?: string }) as Record<string, unknown>;
}

/**
 * Read per-account insights from localStorage.
 * Pass `maxAgeMs` to reject entries older than that threshold.
 */
export function readInsightsFromLocalStorage(
  accountId: string,
  maxAgeMs = Infinity
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(accountId));
    if (!raw) return null;
    return parseEntry(raw, maxAgeMs);
  } catch {
    return null;
  }
}

export function readDashboardInsightsSession(
  userId: string,
  accountId: string,
  maxAgeMs = Infinity
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(userId, accountId));
    if (!raw) return null;
    return parseEntry(raw, maxAgeMs);
  } catch {
    return null;
  }
}

export function writeDashboardInsightsSession(userId: string, accountId: string, payload: unknown): void {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return;
  try {
    const cleaned = stripLegacyInsightsHint(payload as { insightsHint?: string });
    const slim = slimInsights((cleaned ?? payload) as Record<string, unknown>);
    // Stamp every write so readers can enforce a max-age on stale data.
    slim._fetchedAt = Date.now();
    const str = JSON.stringify(slim);
    if (str.length > MAX_BYTES) return;
    sessionStorage.setItem(sessionKey(userId, accountId), str);
    localStorage.setItem(lsKey(accountId), str);
  } catch {
    // quota or private mode
  }
}
