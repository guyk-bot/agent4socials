/** @jest-environment node */

import { isThreadsMentionComment, isThreadsReplyComment } from '../threads-inbox-comment';

describe('threads inbox comment kind', () => {
  it('detects mention rows by id prefix or inboxKind', () => {
    expect(isThreadsMentionComment({ platform: 'THREADS', commentId: 'mention-abc' })).toBe(true);
    expect(
      isThreadsMentionComment({ platform: 'THREADS', commentId: 'x', inboxKind: 'threads_mention' })
    ).toBe(true);
    expect(isThreadsMentionComment({ platform: 'THREADS', commentId: 'reply-1' })).toBe(false);
  });

  it('detects reply rows', () => {
    expect(isThreadsReplyComment({ platform: 'THREADS', commentId: 'reply-1' })).toBe(true);
    expect(isThreadsReplyComment({ platform: 'THREADS', commentId: 'mention-1' })).toBe(false);
  });
});
