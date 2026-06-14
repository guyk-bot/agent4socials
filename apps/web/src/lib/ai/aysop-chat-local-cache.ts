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

export function clearLastActiveChatId(userId: string | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(lastActiveKey(userId));
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
    const seen = new Set<string>();
    const deduped = sessions.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    localStorage.setItem(listKey(userId), JSON.stringify(deduped.slice(0, 100)));
  } catch {
    /* quota */
  }
}

function deletedIdsKey(userId: string) {
  return `izop_aysop_chat_deleted_${userId}`;
}

/** Locally deleted server chats stay hidden until the server list no longer includes them. */
export function readDeletedChatIds(userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(deletedIdsKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function markChatDeleted(userId: string | undefined, sessionId: string): void {
  if (!userId || !sessionId.trim() || sessionId.startsWith('offline-')) return;
  const next = readDeletedChatIds(userId);
  next.add(sessionId);
  try {
    localStorage.setItem(deletedIdsKey(userId), JSON.stringify([...next].slice(-200)));
  } catch {
    /* quota */
  }
}

/** Drop tombstones once the server no longer returns that chat id. */
export function reconcileDeletedChatIds(userId: string | undefined, serverIds: Set<string>): void {
  if (!userId) return;
  const deleted = readDeletedChatIds(userId);
  if (!deleted.size) return;
  const next = new Set<string>();
  for (const id of deleted) {
    if (serverIds.has(id)) next.add(id);
  }
  try {
    if (next.size) {
      localStorage.setItem(deletedIdsKey(userId), JSON.stringify([...next]));
    } else {
      localStorage.removeItem(deletedIdsKey(userId));
    }
  } catch {
    /* quota */
  }
}

function pendingNewChatKey(userId: string) {
  return `izop_aysop_pending_new_chat_${userId}`;
}

/** Empty draft opened via New chat (shown in sidebar until first message or leave). */
export function readPendingNewChatId(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(pendingNewChatKey(userId));
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writePendingNewChatId(userId: string | undefined, sessionId: string): void {
  if (!userId || !sessionId.trim()) return;
  try {
    localStorage.setItem(pendingNewChatKey(userId), sessionId);
  } catch {
    /* quota */
  }
}

export function clearPendingNewChatId(userId: string | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(pendingNewChatKey(userId));
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
