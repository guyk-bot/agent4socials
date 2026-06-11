import { isLikelyVideoMediaUrl } from '@/lib/inbox/media-url';
import { isAnalyticsTextOnlyPost } from '@/lib/post-history-format';

/** Still-image thumb from synced dashboard / history posts (same rules as PostContentPreviewThumb). */
export function historySyncedPostThumbUrl(post: {
  platform?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
}): string | null {
  if (isAnalyticsTextOnlyPost(post)) return null;
  const thumb = (post.thumbnailUrl ?? '').trim();
  if (!thumb || isLikelyVideoMediaUrl(thumb)) return null;
  return thumb;
}
