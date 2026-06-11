import { historySyncedPostThumbUrl } from '@/lib/inbox/dashboard-post-thumb';
import { inboxStillImageUrl } from '@/lib/inbox/media-url';
import type { InboxCommentRow } from '@/lib/inbox/inbox-db-cache';

type ImportedPostRow = {
  platformPostId: string;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
};

/** Prefer synced post-history thumbnails over live comment API URLs (Threads video reels). */
export function enrichThreadsInboxCommentThumbs(
  comments: InboxCommentRow[],
  imported: ImportedPostRow[]
): InboxCommentRow[] {
  if (comments.length === 0 || imported.length === 0) return comments;

  const importedThumbByPostId = new Map(
    imported.map((p) => [
      p.platformPostId,
      historySyncedPostThumbUrl({
        platform: 'THREADS',
        mediaType: p.mediaType,
        thumbnailUrl: p.thumbnailUrl,
      }),
    ])
  );

  return comments.map((c) => {
    const pid = (c.platformPostId ?? '').trim();
    const fromHistory = pid ? importedThumbByPostId.get(pid) : undefined;
    if (fromHistory) return { ...c, postImageUrl: fromHistory };
    const still = inboxStillImageUrl(c.postImageUrl);
    return still ? { ...c, postImageUrl: still } : c;
  });
}
