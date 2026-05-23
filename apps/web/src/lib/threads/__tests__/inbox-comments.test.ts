/** @jest-environment node */

import { normalizeThreadsInboxCommentRow } from '../inbox-comments';

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
