import type { AysopChatSessionSummary } from '@/lib/ai/aysop-chat-sessions';

export type CachedChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: unknown[];
  attachments?: unknown[];
};

function messagesKey(userId: string, sessionId: string) {
  return `izop_aysop_chat_${userId}_${sessionId}`;
}

function listKey(userId: string) {
  return `izop_aysop_chat_list_${userId}`;
}

function lastActiveKey(userId: string) {
  return `izop_aysop_chat_last_${userId}`;
}

export function readLastActiveChatId(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(lastActiveKey(userId));
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writeLastActiveChatId(userId: string | undefined, sessionId: string): void {
  if (!userId || !sessionId.trim()) return;
  try {
    localStorage.setItem(lastActiveKey(userId), sessionId);
  } catch {
    /* quota */
  }
}

export function readCachedMessages(userId: string | undefined, sessionId: string): CachedChatMessage[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(messagesKey(userId, sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChatMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedMessages(
  userId: string | undefined,
  sessionId: string,
  messages: CachedChatMessage[]
): void {
  if (!userId) return;
  try {
    if (messages.length === 0) {
      localStorage.removeItem(messagesKey(userId, sessionId));
      return;
    }
    localStorage.setItem(messagesKey(userId, sessionId), JSON.stringify(messages));
  } catch {
    /* quota */
  }
}

export function readCachedSessionList(userId: string | undefined): AysopChatSessionSummary[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(listKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AysopChatSessionSummary[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedSessionList(userId: string | undefined, sessions: AysopChatSessionSummary[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(listKey(userId), JSON.stringify(sessions.slice(0, 100)));
  } catch {
    /* quota */
  }
}

/** Remove cached messages for each session id (e.g. before clearing all chat history). */
export function clearCachedMessagesForSessions(
  userId: string | undefined,
  sessionIds: string[]
): void {
  if (!userId) return;
  for (const id of sessionIds) {
    writeCachedMessages(userId, id, []);
  }
  try {
    localStorage.removeItem(lastActiveKey(userId));
  } catch {
    /* quota */
  }
}
