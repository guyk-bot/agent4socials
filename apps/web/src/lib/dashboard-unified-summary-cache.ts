import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';

const PREFIX = 'agent4socials.unifiedSummary.v4';
const memoryCache = new Map<string, { at: number; data: UnifiedSummaryResponse }>();

function key(userId: string, start: string, end: string): string {
  return `${PREFIX}:${userId}:${start}:${end}`;
}

/** Returns cached summary if present. Entries are not expired on read so the Console can stale-while-revalidate. */
export function readUnifiedSummaryCache(
  userId: string,
  start: string,
  end: string
): UnifiedSummaryResponse | null {
  if (typeof window === 'undefined' || !userId) return null;
  const cacheKey = key(userId, start, end);
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

export function writeUnifiedSummaryCache(
  userId: string,
  start: string,
  end: string,
  data: UnifiedSummaryResponse
): void {
  if (typeof window === 'undefined' || !userId) return;
  const cacheKey = key(userId, start, end);
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
