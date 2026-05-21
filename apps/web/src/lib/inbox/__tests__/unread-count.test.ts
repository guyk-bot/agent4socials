/** @jest-environment node */

import {
  computeInboxHeaderUnread,
  isConversationUnread,
  stabilizeInboxHeaderUnread,
} from '../unread-count';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'window', { value: global });

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

describe('computeInboxHeaderUnread', () => {
  beforeEach(() => localStorageMock.clear());

  it('counts sticky pending conversation IDs even when thread is not in the loaded list', () => {
    localStorage.setItem(
      'agent4socials_badge_pending_conv_user-1',
      JSON.stringify(['conv-offline'])
    );
    localStorage.setItem(
      'agent4socials_badge_pending_conv_platform_user-1',
      JSON.stringify({ 'conv-offline': 'INSTAGRAM' })
    );
    const unread = computeInboxHeaderUnread([], [], 'user-1');
    expect(unread.messages).toBe(1);
    expect(unread.inbox).toBe(1);
  });
});

describe('stabilizeInboxHeaderUnread', () => {
  it('does not decrease the badge until read state version changes', () => {
    const stableRef = { version: 0, inbox: 1, messages: 1, comments: 0 };
    const held = stabilizeInboxHeaderUnread(
      { inbox: 0, messages: 0, comments: 0, byPlatform: {} },
      0,
      stableRef
    );
    expect(held.inbox).toBe(1);
    expect(held.messages).toBe(1);

    const cleared = stabilizeInboxHeaderUnread(
      { inbox: 0, messages: 0, comments: 0, byPlatform: {} },
      1,
      stableRef
    );
    expect(cleared.inbox).toBe(0);
  });
});
