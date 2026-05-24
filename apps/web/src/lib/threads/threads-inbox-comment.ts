/** Threads inbox row kinds (replies on your posts vs @mentions). */
export type ThreadsInboxCommentKind = 'threads_reply' | 'threads_mention';

export function isThreadsMentionComment(c: {
  platform?: string;
  commentId?: string;
  inboxKind?: string | null;
}): boolean {
  if (c.platform !== 'THREADS') return false;
  if (c.inboxKind === 'threads_mention') return true;
  return (c.commentId ?? '').startsWith('mention-');
}

export function isThreadsReplyComment(c: {
  platform?: string;
  commentId?: string;
  inboxKind?: string | null;
}): boolean {
  return c.platform === 'THREADS' && !isThreadsMentionComment(c);
}
