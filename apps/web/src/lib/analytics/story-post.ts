/** Detect Instagram / Facebook Story posts in analytics and imported-post lists. */

type StoryPostLike = {
  platform?: string | null;
  mediaType?: string | null;
  permalinkUrl?: string | null;
  platformMetadata?: unknown;
};

function metaRecord(platformMetadata: unknown): Record<string, unknown> {
  if (!platformMetadata || typeof platformMetadata !== 'object' || Array.isArray(platformMetadata)) {
    return {};
  }
  return platformMetadata as Record<string, unknown>;
}

export function isStoryPost(p: StoryPostLike): boolean {
  const mt = String(p.mediaType ?? '').toUpperCase();
  if (mt === 'STORY' || mt === 'STORIES') return true;

  const meta = metaRecord(p.platformMetadata);
  const product = String(meta.media_product_type ?? meta.mediaProductType ?? '').toUpperCase();
  if (product === 'STORY' || product === 'STORIES') return true;

  const status = String(meta.status_type ?? meta.statusType ?? '').toUpperCase();
  if (status.includes('STORY')) return true;

  const url = (p.permalinkUrl ?? '').toLowerCase();
  if (url.includes('story_fbid=') || url.includes('/stories/')) return true;

  return false;
}

export function storyPostInteractions(p: {
  likeCount?: number | null;
  commentsCount?: number | null;
  sharesCount?: number | null;
  interactions?: number | null;
  facebookInsights?: Record<string, number> | null;
}): number {
  const fi = p.facebookInsights ?? {};
  const replies = typeof fi.story_replies === 'number' ? fi.story_replies : 0;
  const shares = typeof fi.story_shares === 'number' ? fi.story_shares : (p.sharesCount ?? 0);
  const likes = p.likeCount ?? (typeof fi.post_reactions_like_total === 'number' ? fi.post_reactions_like_total : 0);
  const comments = p.commentsCount ?? (typeof fi.post_comments === 'number' ? fi.post_comments : 0);
  const rolled = likes + comments + shares + replies;
  if (rolled > 0) return rolled;
  return p.interactions ?? 0;
}
