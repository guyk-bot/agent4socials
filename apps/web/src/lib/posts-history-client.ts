import {
  mergePostsHistoryLists,
  upsertPostInHistoryList,
  type PostHistoryRow,
} from '@/lib/posts-history-merge';
import { writeScheduledPostsClientCache, readScheduledPostsClientCache } from '@/lib/scheduled-posts-client-cache';

/** Push a merged History update to client cache and any open History listeners. */
export function pushPostsHistoryClientUpdate(
  incoming: PostHistoryRow[] | ((previous: PostHistoryRow[]) => PostHistoryRow[])
): PostHistoryRow[] {
  const prev = readScheduledPostsClientCache() ?? [];
  const next = typeof incoming === 'function' ? incoming(prev) : mergePostsHistoryLists(prev, incoming);
  writeScheduledPostsClientCache(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent4socials:posts-history-refresh', { detail: { posts: next } }));
  }
  return next;
}

export function upsertPostInHistoryClient(post: PostHistoryRow): PostHistoryRow[] {
  const prev = readScheduledPostsClientCache() ?? [];
  const next = upsertPostInHistoryList(prev, post);
  writeScheduledPostsClientCache(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent4socials:posts-history-refresh', { detail: { post, posts: next } }));
  }
  return next;
}

export function buildOptimisticPostingRow(input: {
  id: string;
  content?: string;
  title?: string;
  platforms: string[];
  media?: { fileUrl: string; type: string }[];
  createdAt?: string;
}): PostHistoryRow {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    id: input.id,
    status: 'POSTING',
    content: input.content ?? null,
    title: input.title ?? null,
    createdAt,
    scheduledAt: null,
    postedAt: null,
    targetPlatforms: input.platforms,
    targets: input.platforms.map((platform) => ({ platform, status: 'POSTING' })),
    media: input.media ?? [],
    _optimistic: true,
  };
}

export function replacePostIdInHistoryClient(tempId: string, post: PostHistoryRow): PostHistoryRow[] {
  return pushPostsHistoryClientUpdate((prev) => {
    const idx = prev.findIndex((p) => postIdKey(p) === tempId);
    if (idx < 0) return upsertPostInHistoryList(prev, post);
    const next = [...prev];
    next[idx] = { ...post };
    return next;
  });
}

function postIdKey(post: PostHistoryRow): string | null {
  const id = post?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
