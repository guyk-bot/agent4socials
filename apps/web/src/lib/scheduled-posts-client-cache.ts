import { mergePostsHistoryLists, type PostHistoryRow } from '@/lib/posts-history-merge';

/** Shared localStorage cache for GET /api/posts (drafts, scheduled, published). */
export const SCHEDULED_POSTS_CACHE_KEY = 'calendar_posts_cache_v1';

export function readScheduledPostsClientCache(): Record<string, unknown>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SCHEDULED_POSTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export function writeScheduledPostsClientCache(list: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SCHEDULED_POSTS_CACHE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota
  }
}

/** Merge with existing cache so in-flight POSTING rows are not dropped on refresh. */
export function mergeAndWriteScheduledPostsClientCache(incoming: PostHistoryRow[]): PostHistoryRow[] {
  const prev = readScheduledPostsClientCache() as PostHistoryRow[];
  const merged = mergePostsHistoryLists(prev, incoming);
  writeScheduledPostsClientCache(merged);
  return merged;
}
