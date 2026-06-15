import { syncChatSessionsWithServer, type IzopChatSessionSummary } from '@/lib/ai/izop-chat-sessions';

jest.mock('@/lib/ai/izop-chat-local-cache', () => ({
  readCachedMessages: jest.fn(() => null),
  readCachedSessionList: jest.fn(() => null),
  readDeletedChatIds: jest.fn(() => new Set<string>()),
  readLastActiveChatId: jest.fn(() => null),
  readPendingNewChatId: jest.fn(() => null),
  reconcileDeletedChatIds: jest.fn(),
  writeCachedMessages: jest.fn(),
  writeCachedSessionList: jest.fn(),
  clearLastActiveChatId: jest.fn(),
}));

import {
  readCachedSessionList,
  readDeletedChatIds,
  readPendingNewChatId,
  reconcileDeletedChatIds,
  writeCachedSessionList,
} from '@/lib/ai/izop-chat-local-cache';

const userId = 'user-1';

function serverChat(id: string): IzopChatSessionSummary {
  const now = new Date().toISOString();
  return { id, title: `Chat ${id}`, updatedAt: now, createdAt: now, preview: 'hello' };
}

describe('syncChatSessionsWithServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readDeletedChatIds).mockReturnValue(new Set());
    jest.mocked(readCachedSessionList).mockReturnValue([]);
    jest.mocked(readPendingNewChatId).mockReturnValue(null);
  });

  it('does not resurrect deleted server chats from stale local cache', () => {
    const stale = serverChat('deleted-1');
    jest.mocked(readCachedSessionList).mockReturnValue([stale, serverChat('live-1')]);

    const merged = syncChatSessionsWithServer(userId, [serverChat('live-1')]);

    expect(merged.map((s) => s.id)).toEqual(['live-1']);
    expect(writeCachedSessionList).toHaveBeenCalledWith(
      userId,
      expect.arrayContaining([expect.objectContaining({ id: 'live-1' })])
    );
    expect(merged.some((s) => s.id === 'deleted-1')).toBe(false);
    expect(reconcileDeletedChatIds).toHaveBeenCalled();
  });

  it('keeps offline drafts that are not on the server yet', () => {
    const now = new Date().toISOString();
    const offline = {
      id: 'offline-123',
      title: 'New chat',
      updatedAt: now,
      createdAt: now,
      preview: null,
    } satisfies IzopChatSessionSummary;
    jest.mocked(readCachedSessionList).mockReturnValue([offline]);
    jest.mocked(readPendingNewChatId).mockReturnValue('offline-123');

    const merged = syncChatSessionsWithServer(userId, []);

    expect(merged.map((s) => s.id)).toContain('offline-123');
  });
});
