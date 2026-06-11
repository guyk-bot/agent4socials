import { inboxStillImageUrl } from '@/lib/inbox/media-url';
import { threadsPostThumbnailUrl } from '@/lib/threads/post-media-type';

/** Still-image thumb from synced dashboard / history posts (same rules as Post History table). */
export function historySyncedPostThumbUrl(post: {
  platform?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
}): string | null {
  const plat = (post.platform ?? '').toUpperCase();
  if (plat === 'THREADS') {
    const thumb = threadsPostThumbnailUrl({
      media_type: post.mediaType,
      thumbnail_url: post.thumbnailUrl,
      media_url: null,
    });
    if (thumb) return thumb;
  }
  return inboxStillImageUrl(post.thumbnailUrl);
}
