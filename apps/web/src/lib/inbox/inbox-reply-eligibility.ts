/** When we stop suggesting in-app replies (Meta may reject very old threads). */
export const INBOX_REPLY_SUGGEST_MAX_AGE_DAYS = 14;

export function inboxCommentReplyEligibility(row: {
  platform?: string;
  createdAt?: string;
  openOnPlatformOnly?: boolean;
}): { canSuggestReply: boolean; reason: string | null } {
  if (row.openOnPlatformOnly) {
    return {
      canSuggestReply: false,
      reason: 'Open this post on the platform to read and reply to comments.',
    };
  }
  const createdMs = row.createdAt ? new Date(row.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(createdMs)) {
    const ageDays = (Date.now() - createdMs) / (24 * 60 * 60 * 1000);
    if (ageDays > INBOX_REPLY_SUGGEST_MAX_AGE_DAYS) {
      return {
        canSuggestReply: false,
        reason: `This comment is older than ${INBOX_REPLY_SUGGEST_MAX_AGE_DAYS} days. Replying from the app may not work.`,
      };
    }
  }
  return { canSuggestReply: true, reason: null };
}
