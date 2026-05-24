/** @jest-environment node */

import {
  buildExternalPlatformCommentRows,
  isOpenOnPlatformInboxComment,
  pinterestPinUrl,
  tiktokVideoUrl,
} from '../external-platform-comments';

describe('external-platform-comments', () => {
  it('detects open-on-platform rows', () => {
    expect(isOpenOnPlatformInboxComment({ commentId: 'open-platform-tiktok-1' })).toBe(true);
    expect(isOpenOnPlatformInboxComment({ commentId: 'c1', openOnPlatformOnly: true })).toBe(true);
    expect(isOpenOnPlatformInboxComment({ commentId: 'c1' })).toBe(false);
  });

  it('builds TikTok rows with share URL', () => {
    const rows = buildExternalPlatformCommentRows({
      accountId: 'acc1',
      platform: 'TIKTOK',
      username: 'creator',
      posts: [
        {
          platformPostId: 'vid123',
          content: 'My video',
          thumbnailUrl: null,
          permalinkUrl: 'https://www.tiktok.com/@creator/video/123',
          publishedAt: new Date('2026-05-20T12:00:00Z'),
          commentsCount: 5,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.postUrl).toContain('tiktok.com');
    expect(rows[0]?.text).toContain('5 comments');
  });

  it('builds Pinterest pin URLs', () => {
    expect(pinterestPinUrl('abc')).toBe('https://www.pinterest.com/pin/abc/');
    expect(tiktokVideoUrl('v1', null, 'user')).toContain('@user');
  });
});
