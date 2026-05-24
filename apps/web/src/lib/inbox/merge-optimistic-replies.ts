/** Keep outbound inbox replies visible until the platform API returns them (Threads skips own replies). */

export function isLocalOptimisticReplyId(commentId: string): boolean {
  return commentId.startsWith('local-reply-') || commentId.startsWith('sent-');
}

type ReplyRow = {
  commentId: string;
  parentCommentId?: string | null;
  isFromMe?: boolean;
  text?: string;
  createdAt?: string;
};

function replyDedupeKey(parentCommentId: string, text: string): string {
  return `${parentCommentId}\0${text.trim()}`;
}

/** Merge optimistic / DB-persisted outbound replies into a freshly synced comment list. */
export function mergeOptimisticInboxReplies<T extends ReplyRow>(merged: T[], prior: T[]): T[] {
  const mergedKeys = new Set(
    merged
      .filter((c) => c.isFromMe && c.parentCommentId)
      .map((c) => replyDedupeKey(c.parentCommentId!, c.text ?? ''))
  );

  const toKeep = prior.filter((c) => {
    if (!c.isFromMe || !c.parentCommentId) return false;
    const key = replyDedupeKey(c.parentCommentId, c.text ?? '');
    if (mergedKeys.has(key)) return false;
    if (isLocalOptimisticReplyId(c.commentId)) return true;
    const t = Date.parse(c.createdAt ?? '');
    return Number.isFinite(t) && Date.now() - t < 7 * 24 * 60 * 60 * 1000;
  });

  if (toKeep.length === 0) return merged;

  const byId = new Map(merged.map((c) => [c.commentId, c]));
  for (const row of toKeep) {
    if (!byId.has(row.commentId)) byId.set(row.commentId, row);
  }
  return [...byId.values()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
