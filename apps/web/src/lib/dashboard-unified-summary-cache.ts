import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';

const PREFIX = 'agent4socials.unifiedSummary.v1';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h: aggregate DB reads; refresh on demand or when stale

function key(userId: string, start: string, end: string): string {
  return `${PREFIX}:${userId}:${start}:${end}`;
}

export function readUnifiedSummaryCache(
  userId: string,
  start: string,
  end: string
): UnifiedSummaryResponse | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(key(userId, start, end));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: UnifiedSummaryResponse };
    if (!parsed?.data || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
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
  try {
    localStorage.setItem(key(userId, start, end), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota or private mode */
  }
}
