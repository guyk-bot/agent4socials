import { inboxStillImageUrl } from '@/lib/inbox/media-url';
import { historySyncedPostThumbUrl } from '@/lib/inbox/dashboard-post-thumb';
import { isAnalyticsTextOnlyPost } from '@/lib/post-history-format';

type PostRow = {
  platformPostId?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  platform?: string | null;
};

/** Merge API comment thumb with synced dashboard/history posts (same source as History tab). */
export function resolveInboxCommentThumbFallback(
  accountId: string,
  platformPostId: string,
  postImageUrl: string | null | undefined,
  postsByAccountId: Record<string, PostRow[] | undefined> | undefined
): string | null {
  const targetId = platformPostId.trim().replace(/^\//, '');
  if (!targetId) return inboxStillImageUrl(postImageUrl);

  const posts = postsByAccountId?.[accountId] ?? [];
  for (const p of posts) {
    const pid = (p.platformPostId ?? '').trim().replace(/^\//, '');
    if (!pid || pid !== targetId) continue;
    const fromHistory = historySyncedPostThumbUrl({
      platform: p.platform,
      mediaType: p.mediaType,
      thumbnailUrl: p.thumbnailUrl,
    });
    if (fromHistory) return fromHistory;
  }

  return inboxStillImageUrl(postImageUrl);
}

/** True when the synced post (or comment row) is a text-only post with no image thumb. */
export function isInboxCommentTextOnlyPost(
  accountId: string,
  platformPostId: string,
  platform: string,
  postImageUrl: string | null | undefined,
  postsByAccountId: Record<string, PostRow[] | undefined> | undefined
): boolean {
  if (inboxStillImageUrl(postImageUrl)) return false;
  if (resolveInboxCommentThumbFallback(accountId, platformPostId, postImageUrl, postsByAccountId)) {
    return false;
  }

  const targetId = platformPostId.trim().replace(/^\//, '');
  const posts = postsByAccountId?.[accountId] ?? [];
  for (const p of posts) {
    const pid = (p.platformPostId ?? '').trim().replace(/^\//, '');
    if (!pid || pid !== targetId) continue;
    return isAnalyticsTextOnlyPost({
      platform: p.platform ?? platform,
      mediaType: p.mediaType,
      thumbnailUrl: p.thumbnailUrl,
    });
  }

  const plat = (platform ?? '').trim().toUpperCase();
  return plat === 'THREADS' || plat === 'FACEBOOK' || plat === 'LINKEDIN' || plat === 'TWITTER';
}
