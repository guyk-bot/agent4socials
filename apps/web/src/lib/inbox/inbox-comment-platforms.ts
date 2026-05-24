import { INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS } from '@/lib/inbox/external-platform-comments';

/** Platforms that support loading comments in Inbox (see GET …/comments). */

export const INBOX_COMMENT_LIVE_PLATFORMS = new Set([
  'INSTAGRAM',
  'FACEBOOK',
  'TWITTER',
  'YOUTUBE',
  'LINKEDIN',
  'THREADS',
]);

export const INBOX_COMMENT_META_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK']);

/** Polled in background for nav badge + AppData cache (Meta uses cacheOnly in poll). */
export const INBOX_COMMENT_BACKGROUND_POLL_PLATFORMS = new Set([
  ...INBOX_COMMENT_LIVE_PLATFORMS,
  ...INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS,
]);

export function supportsInboxComments(platform: string): boolean {
  return INBOX_COMMENT_LIVE_PLATFORMS.has(platform);
}

/** Full comment text (API) or open-on-platform cards (TikTok, Pinterest). */
export function supportsInboxCommentsTab(platform: string): boolean {
  return supportsInboxComments(platform) || INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS.has(platform);
}

export { INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS };

export function inboxCommentsCooldownScope(platform: string, accountId: string): string {
  if (platform === 'THREADS') return 'threads-comments';
  if (INBOX_COMMENT_META_PLATFORMS.has(platform)) return `meta-comments-${accountId}`;
  return `comments-${platform}-${accountId}`;
}
