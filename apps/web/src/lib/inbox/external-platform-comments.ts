/**
 * TikTok and Pinterest do not expose comment text via our APIs.
 * We surface posts with comment activity and deep links to open them on-platform.
 */

import type { InboxCommentRow } from '@/lib/inbox/inbox-db-cache';

export const INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS = new Set(['TIKTOK', 'PINTEREST']);

export function isExternalOpenPlatform(platform: string | undefined | null): boolean {
  return !!platform && INBOX_COMMENT_EXTERNAL_OPEN_PLATFORMS.has(platform);
}

export function isOpenOnPlatformInboxComment(
  row: { openOnPlatformOnly?: boolean; commentId?: string } | null | undefined
): boolean {
  if (!row) return false;
  if (row.openOnPlatformOnly === true) return true;
  return (row.commentId ?? '').startsWith('open-platform-');
}

export type ImportedPostForExternalComments = {
  platformPostId: string | null;
  content: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
  publishedAt: Date;
  commentsCount: number | null;
};

export function pinterestPinUrl(platformPostId: string, permalinkUrl?: string | null): string {
  const fromDb = permalinkUrl?.trim();
  if (fromDb && fromDb.startsWith('http')) return fromDb;
  return `https://www.pinterest.com/pin/${encodeURIComponent(platformPostId)}/`;
}

export function tiktokVideoUrl(
  platformPostId: string,
  permalinkUrl?: string | null,
  username?: string | null
): string {
  const fromDb = permalinkUrl?.trim();
  if (fromDb && fromDb.startsWith('http')) return fromDb;
  const handle = (username ?? '').replace(/^@/, '').trim();
  if (handle) {
    return `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(platformPostId)}`;
  }
  return `https://www.tiktok.com/video/${encodeURIComponent(platformPostId)}`;
}

export function externalPlatformProfileUrl(platform: string, username?: string | null): string | null {
  const handle = (username ?? '').replace(/^@/, '').trim();
  if (!handle) return null;
  if (platform === 'TIKTOK') return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
  if (platform === 'PINTEREST') return `https://www.pinterest.com/${encodeURIComponent(handle)}/`;
  return null;
}

function platformLabel(platform: string): string {
  if (platform === 'TIKTOK') return 'TikTok';
  if (platform === 'PINTEREST') return 'Pinterest';
  return platform;
}

function postKind(platform: string): string {
  return platform === 'PINTEREST' ? 'pin' : 'video';
}

/** Build inbox rows for posts that have comments (open on platform to read/reply). */
export function buildExternalPlatformCommentRows(args: {
  accountId: string;
  platform: 'TIKTOK' | 'PINTEREST';
  username?: string | null;
  posts: ImportedPostForExternalComments[];
  /** Include recent posts with 0 comments when nothing has activity (shows open links). */
  includeZeroCommentPosts?: number;
}): InboxCommentRow[] {
  const { accountId, platform, username, posts } = args;
  const label = platformLabel(platform);
  const kind = postKind(platform);

  const withActivity = posts
    .filter((p) => p.platformPostId && (p.commentsCount ?? 0) > 0)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  let source = withActivity;
  if (source.length === 0 && (args.includeZeroCommentPosts ?? 0) > 0) {
    source = posts
      .filter((p) => p.platformPostId)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, args.includeZeroCommentPosts ?? 0);
  }

  return source.map((p) => {
    const postId = p.platformPostId!.trim();
    const count = Math.max(0, p.commentsCount ?? 0);
    const postUrl =
      platform === 'PINTEREST'
        ? pinterestPinUrl(postId, p.permalinkUrl)
        : tiktokVideoUrl(postId, p.permalinkUrl, username);
    const preview = (p.content ?? '').trim() || `${label} ${kind}`;
    const hasComments = count > 0;

    return {
      commentId: `open-platform-${platform.toLowerCase()}-${postId}`,
      accountId,
      platform,
      authorName: `${label} comments`,
      authorPictureUrl: null,
      text: hasComments
        ? `${count} comment${count === 1 ? '' : 's'} on this ${kind}. Reply in the ${label} app.`
        : `Open this ${kind} on ${label} to view comments.`,
      createdAt: p.publishedAt.toISOString(),
      isFromMe: false,
      parentCommentId: null,
      postTargetId: `external-${postId}`,
      platformPostId: postId,
      postPreview: preview.slice(0, 120),
      postImageUrl: p.thumbnailUrl,
      postPublishedAt: p.publishedAt.toISOString(),
      postUrl,
      openOnPlatformOnly: true,
      externalCommentCount: count,
    } as InboxCommentRow & { openOnPlatformOnly: boolean; externalCommentCount: number };
  });
}
