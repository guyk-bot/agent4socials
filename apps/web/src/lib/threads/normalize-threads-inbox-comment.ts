/** Client-safe: legacy inbox cache stored post id as parentCommentId. */
export function normalizeThreadsInboxCommentRow<
  T extends { platform?: string; parentCommentId?: string | null; platformPostId?: string },
>(row: T): T {
  if (
    row.platform === 'THREADS' &&
    row.parentCommentId &&
    row.platformPostId &&
    row.parentCommentId === row.platformPostId
  ) {
    return { ...row, parentCommentId: null };
  }
  return row;
}
