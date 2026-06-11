/**
 * When in-app public comment replies are not recommended (platform API limits).
 * Public IG/FB/Threads/X replies have no fixed age window; private DM-from-comment windows
 * are not used by this app.
 */

/** LinkedIn: comment threads are typically available for ~30 days after the post was published. */
export const LINKEDIN_POST_COMMENT_WINDOW_DAYS = 30;

export function inboxCommentReplyEligibility(row: {
  platform?: string;
  createdAt?: string;
  postPublishedAt?: string | null;
  openOnPlatformOnly?: boolean;
}): { canSuggestReply: boolean; reason: string | null } {
  if (row.openOnPlatformOnly) {
    return {
      canSuggestReply: false,
      reason: 'Open this post on the platform to read and reply to comments.',
    };
  }

  const platform = (row.platform ?? '').trim().toUpperCase();

  // No fixed reply age limit (API rate limits still apply).
  if (
    platform === 'THREADS' ||
    platform === 'TWITTER' ||
    platform === 'PINTEREST' ||
    platform === 'INSTAGRAM' ||
    platform === 'FACEBOOK' ||
    platform === 'YOUTUBE'
  ) {
    return { canSuggestReply: true, reason: null };
  }

  if (platform === 'LINKEDIN') {
    const postMs = row.postPublishedAt ? new Date(row.postPublishedAt).getTime() : Number.NaN;
    if (Number.isFinite(postMs)) {
      const postAgeDays = (Date.now() - postMs) / (24 * 60 * 60 * 1000);
      if (postAgeDays > LINKEDIN_POST_COMMENT_WINDOW_DAYS) {
        return {
          canSuggestReply: false,
          reason: `This LinkedIn post is older than ${LINKEDIN_POST_COMMENT_WINDOW_DAYS} days. LinkedIn may not allow new replies through the API on older posts.`,
        };
      }
    }
    return { canSuggestReply: true, reason: null };
  }

  return { canSuggestReply: true, reason: null };
}
