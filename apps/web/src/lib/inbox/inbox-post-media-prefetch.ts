import { inboxStillImageUrl, isLikelyVideoMediaUrl } from '@/lib/inbox/media-url';

/** Client cache + background prefetch for inbox post thumbnails and reels. */

const CACHE_KEY = 'agent4socials_inbox_post_media_v1';
const MAX_ENTRIES = 400;

type MediaCacheEntry = {
  kind: 'image' | 'video';
  src: string;
  poster?: string;
  at: number;
};

type MediaCacheBlob = Record<string, MediaCacheEntry>;

function cacheKey(accountId: string, postId: string): string {
  return `${accountId}:${postId}`;
}

function readBlob(): MediaCacheBlob {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MediaCacheBlob;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBlob(blob: MediaCacheBlob): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const keys = Object.keys(blob);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => (blob[a]?.at ?? 0) - (blob[b]?.at ?? 0));
      for (const k of sorted.slice(0, keys.length - MAX_ENTRIES)) {
        delete blob[k];
      }
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(blob));
  } catch {
    /* quota */
  }
}

export function proxyInboxImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  if (url.startsWith('/api/')) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export function readInboxPostMediaCache(
  accountId: string,
  postId: string
): MediaCacheEntry | null {
  if (!accountId || !postId) return null;
  const hit = readBlob()[cacheKey(accountId, postId)];
  return hit ?? null;
}

export function inboxPostThumbSrc(
  accountId: string,
  postId: string,
  fallbackImageUrl?: string | null
): string | null {
  const cached = readInboxPostMediaCache(accountId, postId);
  if (cached?.kind === 'image') return cached.src;
  if (cached?.poster) return cached.poster;
  const still = inboxStillImageUrl(fallbackImageUrl);
  // Match Post History: use the synced CDN URL directly (proxy often fails for Threads).
  return still ?? null;
}

export function readInboxPostMediaForThumb(
  accountId: string,
  postId: string
): MediaCacheEntry | null {
  return readInboxPostMediaCache(accountId, postId);
}

const inflight = new Set<string>();

export function prefetchInboxPostMedia(
  accountId: string,
  postId: string,
  platform: string,
  fallbackImageUrl?: string | null
): void {
  if (typeof window === 'undefined' || !accountId || !postId) return;
  const key = cacheKey(accountId, postId);
  if (readInboxPostMediaCache(accountId, postId) || inflight.has(key)) return;

  const still = inboxStillImageUrl(fallbackImageUrl);
  if (still && !isLikelyVideoMediaUrl(fallbackImageUrl)) {
    const blob = readBlob();
    blob[key] = { kind: 'image', src: still, at: Date.now() };
    writeBlob(blob);
    window.dispatchEvent(new CustomEvent('izop-inbox-post-media-cache'));
  }

  inflight.add(key);
  const url = `/api/post-media?accountId=${encodeURIComponent(accountId)}&postId=${encodeURIComponent(postId)}`;
  void fetch(url)
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as {
        kind?: string;
        items?: Array<{ kind?: string; src?: string; poster?: string }>;
      };
      const item = data?.items?.[0];
      if (!item?.src && !item?.poster) return;
      const blob = readBlob();
      const kind = item.kind === 'video' ? 'video' : 'image';
      blob[key] = {
        kind,
        src: item.src ?? item.poster ?? '',
        poster: item.poster,
        at: Date.now(),
      };
      writeBlob(blob);
      window.dispatchEvent(new CustomEvent('izop-inbox-post-media-cache'));
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(key);
    });
}

export function prefetchInboxPostMediaBatch(
  rows: Array<{
    accountId: string;
    platformPostId: string;
    platform: string;
    postImageUrl?: string | null;
  }>
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.accountId || !row.platformPostId) continue;
    const k = `${row.accountId}:${row.platformPostId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    prefetchInboxPostMedia(row.accountId, row.platformPostId, row.platform, row.postImageUrl);
  }
}
