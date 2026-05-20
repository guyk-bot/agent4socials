/** @jest-environment node */

import { isConversationUnread } from '../unread-count';

describe('isConversationUnread', () => {
  const emptyRead = new Set<string>();
  const emptyLastRead: Record<string, number> = {};
  const emptySeen: Record<string, string> = {};
  const initialized = new Set(['acc-1']);

  it('returns false when message count is caught up', () => {
    expect(
      isConversationUnread(
        { id: 'c1', messageCount: 5, messageAccountId: 'acc-1', updatedTime: '2026-05-20T10:00:00Z' },
        emptyRead,
        { c1: 5 },
        { c1: '2026-05-19T10:00:00Z' },
        initialized
      )
    ).toBe(false);
  });

  it('returns false for marked-read threads without message counts (badge poll rows)', () => {
    expect(
      isConversationUnread(
        { id: 'c1', messageAccountId: 'acc-1', updatedTime: '2026-05-20T10:00:00Z' },
        new Set(['c1']),
        emptyLastRead,
        { c1: '2026-05-20T10:00:00Z' },
        initialized
      )
    ).toBe(false);
  });

  it('returns true when updatedTime is newer than last seen and not marked read', () => {
    expect(
      isConversationUnread(
        { id: 'c1', messageAccountId: 'acc-1', updatedTime: '2026-05-20T12:00:00Z' },
        emptyRead,
        emptyLastRead,
        { c1: '2026-05-20T10:00:00Z' },
        initialized
      )
    ).toBe(true);
  });

  it('does not default to unread when account is initialized but row has no counts', () => {
    expect(
      isConversationUnread(
        { id: 'c1', messageAccountId: 'acc-1', updatedTime: '2026-05-20T10:00:00Z' },
        emptyRead,
        emptyLastRead,
        { c1: '2026-05-20T10:00:00Z' },
        initialized
      )
    ).toBe(false);
  });
});
