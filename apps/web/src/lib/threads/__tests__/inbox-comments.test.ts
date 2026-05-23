/** @jest-environment node */

import { normalizeThreadsInboxCommentRow, threadsReplyToMediaId } from '../inbox-comments';

describe('normalizeThreadsInboxCommentRow', () => {
  it('clears legacy parentCommentId when it equals platformPostId', () => {
    const row = normalizeThreadsInboxCommentRow({
      platform: 'THREADS',
      commentId: 'c1',
      platformPostId: 'post-1',
      parentCommentId: 'post-1',
    });
    expect(row.parentCommentId).toBeNull();
  });

  it('keeps nested reply parentCommentId', () => {
    const row = normalizeThreadsInboxCommentRow({
      platform: 'THREADS',
      commentId: 'c2',
      platformPostId: 'post-1',
      parentCommentId: 'c1',
    });
    expect(row.parentCommentId).toBe('c1');
  });
});

describe('threadsReplyToMediaId', () => {
  it('prefers explicit threadsReplyToId', () => {
    expect(
      threadsReplyToMediaId({
        commentId: 'c1',
        threadsReplyToId: 'reply-99',
        platformPostId: 'post-1',
      })
    ).toBe('reply-99');
  });

  it('strips mention- prefix from commentId', () => {
    expect(
      threadsReplyToMediaId({
        commentId: 'mention-abc123',
        platformPostId: 'post-1',
      })
    ).toBe('abc123');
  });

  it('falls back to platformPostId when commentId empty', () => {
    expect(
      threadsReplyToMediaId({
        commentId: '',
        platformPostId: 'root-post',
      })
    ).toBe('root-post');
  });
});
