import { inboxStillImageUrl } from '@/lib/inbox/media-url';

type PostRow = {
  platformPostId?: string | null;
  thumbnailUrl?: string | null;
};

/** Merge API comment thumb with synced dashboard/history posts (same source as History tab). */
export function resolveInboxCommentThumbFallback(
  accountId: string,
  platformPostId: string,
  postImageUrl: string | null | undefined,
  postsByAccountId: Record<string, PostRow[] | undefined> | undefined
): string | null {
  const fromComment = inboxStillImageUrl(postImageUrl);
  if (fromComment) return fromComment;

  const posts = postsByAccountId?.[accountId] ?? [];
  for (const p of posts) {
    const pid = (p.platformPostId ?? '').trim();
    if (!pid || pid !== platformPostId) continue;
    const thumb = inboxStillImageUrl(p.thumbnailUrl);
    if (thumb) return thumb;
  }
  return null;
}
