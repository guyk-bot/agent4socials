import { inboxStillImageUrl } from '@/lib/inbox/media-url';
import { historySyncedPostThumbUrl } from '@/lib/inbox/dashboard-post-thumb';

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
  const targetId = platformPostId.trim();
  const posts = postsByAccountId?.[accountId] ?? [];
  for (const p of posts) {
    const pid = (p.platformPostId ?? '').trim();
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
