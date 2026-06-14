import {
  sanitizeChatSessionList,
  sessionShouldShowInSidebar,
  type IzopChatSessionSummary,
} from '@/lib/ai/izop-chat-sessions';

jest.mock('@/lib/ai/izop-chat-local-cache', () => ({
  readCachedMessages: jest.fn(() => null),
  readCachedSessionList: jest.fn(() => null),
  readDeletedChatIds: jest.fn(() => new Set<string>()),
  readLastActiveChatId: jest.fn(() => null),
  readPendingNewChatId: jest.fn(() => null),
  clearPendingNewChatId: jest.fn(),
  reconcileDeletedChatIds: jest.fn(),
  writeCachedMessages: jest.fn(),
  writeCachedSessionList: jest.fn(),
  clearLastActiveChatId: jest.fn(),
}));

import {
  readCachedMessages,
  readDeletedChatIds,
  readPendingNewChatId,
} from '@/lib/ai/izop-chat-local-cache';

const userId = 'user-1';

function shell(id: string, title = 'New chat'): IzopChatSessionSummary {
  const now = new Date().toISOString();
  return { id, title, updatedAt: now, createdAt: now, preview: null };
}

describe('sessionShouldShowInSidebar', () => {
  beforeEach(() => {
    jest.mocked(readDeletedChatIds).mockReturnValue(new Set());
    jest.mocked(readPendingNewChatId).mockReturnValue(null);
    jest.mocked(readCachedMessages).mockReturnValue(null);
  });

  it('hides deleted chats', () => {
    jest.mocked(readDeletedChatIds).mockReturnValue(new Set(['server-1']));
    expect(sessionShouldShowInSidebar(shell('server-1', 'Threads post'), userId)).toBe(false);
  });

  it('shows only pending or content-bearing offline drafts', () => {
    jest.mocked(readPendingNewChatId).mockReturnValue('offline-pending');
    expect(sessionShouldShowInSidebar(shell('offline-pending'), userId)).toBe(true);
    expect(sessionShouldShowInSidebar(shell('offline-empty'), userId)).toBe(false);
    jest.mocked(readCachedMessages).mockReturnValue([
      { id: '1', role: 'assistant', content: 'Hello' },
    ]);
    expect(sessionShouldShowInSidebar(shell('offline-with-reply'), userId)).toBe(true);
  });

  it('shows server chats from summary metadata without local cache', () => {
    expect(
      sessionShouldShowInSidebar(
        { ...shell('server-2'), title: 'Threads post', preview: 'hello' },
        userId
      )
    ).toBe(true);
  });
});

describe('sanitizeChatSessionList', () => {
  beforeEach(() => {
    jest.mocked(readDeletedChatIds).mockReturnValue(new Set());
    jest.mocked(readPendingNewChatId).mockReturnValue('offline-pending');
    jest.mocked(readCachedMessages).mockReturnValue(null);
  });

  it('removes duplicate and empty offline drafts', () => {
    const list = sanitizeChatSessionList(userId, [
      shell('offline-pending'),
      shell('offline-empty'),
      shell('offline-empty-2'),
      { ...shell('server-1'), title: 'Threads post', preview: 'hi' },
      shell('offline-pending'),
    ]);
    expect(list.map((s) => s.id)).toEqual(['offline-pending', 'server-1']);
  });
});
