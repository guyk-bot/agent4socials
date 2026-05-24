/** @jest-environment node */

import { mergeOptimisticInboxReplies } from '../merge-optimistic-replies';

describe('mergeOptimisticInboxReplies', () => {
  it('keeps local-reply rows when sync omits own replies', () => {
    const prior = [
      {
        commentId: 'local-reply-1',
        parentCommentId: 'parent-1',
        isFromMe: true,
        text: 'Thanks!',
        createdAt: new Date().toISOString(),
      },
    ];
    const merged = [
      {
        commentId: 'parent-1',
        parentCommentId: null as string | null,
        isFromMe: false,
        text: 'cool',
        createdAt: new Date().toISOString(),
      },
    ];
    const out = mergeOptimisticInboxReplies(merged, prior);
    expect(out.some((c) => c.commentId === 'local-reply-1')).toBe(true);
  });

  it('drops optimistic row when server returns the same parent+text reply', () => {
    const prior = [
      {
        commentId: 'local-reply-1',
        parentCommentId: 'parent-1',
        isFromMe: true,
        text: 'Thanks!',
        createdAt: new Date().toISOString(),
      },
    ];
    const merged = [
      {
        commentId: 'server-reply-1',
        parentCommentId: 'parent-1',
        isFromMe: true,
        text: 'Thanks!',
        createdAt: new Date().toISOString(),
      },
    ];
    const out = mergeOptimisticInboxReplies(merged, prior);
    expect(out.some((c) => c.commentId === 'local-reply-1')).toBe(false);
    expect(out.some((c) => c.commentId === 'server-reply-1')).toBe(true);
  });
});
