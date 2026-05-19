import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';

const PREFIX = 'agent4socials.unifiedSummary.v4';
const memoryCache = new Map<string, { at: number; data: UnifiedSummaryResponse }>();

function key(userId: string, start: string, end: string, scopeKey?: string): string {
  return `${PREFIX}:${userId}:${start}:${end}:${scopeKey || 'all'}`;
}

/** How long a unified summary cache entry is considered fresh (no background re-fetch). */
export const UNIFIED_SUMMARY_FRESH_MS = 30 * 60 * 1000; // 30 minutes

/** Returns cached summary if present. Entries are not expired on read so the Console can stale-while-revalidate. */
export function readUnifiedSummaryCache(
  userId: string,
  start: string,
  end: string,
  scopeKey?: string
): UnifiedSummaryResponse | null {
  if (typeof window === 'undefined' || !userId) return null;
  const cacheKey = key(userId, start, end, scopeKey);
  const mem = memoryCache.get(cacheKey);
  if (mem?.data) return mem.data;
  try {
    const raw = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: UnifiedSummaryResponse };
    if (!parsed?.data || typeof parsed.at !== 'number') return null;
    memoryCache.set(cacheKey, { at: parsed.at, data: parsed.data });
    return parsed.data;
  } catch {
    return null;
  }
}

/** Returns the timestamp (ms) when a cache entry was last written, or 0 if missing. */
export function getUnifiedSummaryCacheAge(
  userId: string,
  start: string,
  end: string,
  scopeKey?: string
): number {
  if (typeof window === 'undefined' || !userId) return 0;
  const cacheKey = key(userId, start, end, scopeKey);
  const mem = memoryCache.get(cacheKey);
  if (mem?.at) return mem.at;
  try {
    const raw = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { at?: number };
    return typeof parsed.at === 'number' ? parsed.at : 0;
  } catch {
    return 0;
  }
}

/** Scoped cache first, then range-only (survives account reconnect / id changes). */
export function readUnifiedSummaryCacheBest(
  userId: string,
  start: string,
  end: string,
  scopeKey?: string
): { data: UnifiedSummaryResponse | null; cachedAt: number } {
  if (typeof window === 'undefined' || !userId) return { data: null, cachedAt: 0 };
  const scoped = scopeKey ? readUnifiedSummaryCache(userId, start, end, scopeKey) : null;
  const rangeOnly = readUnifiedSummaryCache(userId, start, end);
  const data = scoped ?? rangeOnly;
  if (!data) return { data: null, cachedAt: 0 };
  const cachedAt = Math.max(
    scopeKey ? getUnifiedSummaryCacheAge(userId, start, end, scopeKey) : 0,
    getUnifiedSummaryCacheAge(userId, start, end)
  );
  return { data, cachedAt };
}

export function writeUnifiedSummaryCache(
  userId: string,
  start: string,
  end: string,
  data: UnifiedSummaryResponse,
  scopeKey?: string
): void {
  if (typeof window === 'undefined' || !userId) return;
  const cacheKey = key(userId, start, end, scopeKey);
  const payload = JSON.stringify({ at: Date.now(), data });
  memoryCache.set(cacheKey, { at: Date.now(), data });
  try {
    localStorage.setItem(cacheKey, payload);
    sessionStorage.setItem(cacheKey, payload);
    return;
  } catch {
    // Local storage can fail on quota/private mode, try session storage.
  }
  try {
    sessionStorage.setItem(cacheKey, payload);
  } catch {
    /* quota or private mode */
  }
}
