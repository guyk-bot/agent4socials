import type { IzopChatAttachment } from '@/lib/ai/izop-attachments';
import { isIzopQuickReplyMessage } from '@/lib/ai/izop-quick-replies';
import {
  clearLastActiveChatId,
  readCachedMessages,
  readCachedSessionList,
  readDeletedChatIds,
  readLastActiveChatId,
  readPendingNewChatId,
  clearPendingNewChatId,
  reconcileDeletedChatIds,
  writeCachedMessages,
  writeCachedSessionList,
} from '@/lib/ai/izop-chat-local-cache';

export type StoredIzopMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: unknown[];
  attachments?: IzopChatAttachment[];
};

export type IzopChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  preview: string | null;
};

const CHAT_TITLE_SKIP =
  /^(delete|remove|erase|clear|wipe)\b[\s\S]{0,80}\b(all\s+)?(the\s+)?brand\s+context\b|\bbrand\s+context\b[\s\S]{0,80}\b(delete|remove|erase|clear|wipe)\b|^(set up brand context|just create this post|let'?s upload|continue without)/i;

function trimChatTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 52) return trimmed;
  return `${trimmed.slice(0, 52).trim()}…`;
}

function mediaTitleFromMessage(m: StoredIzopMessage): string | null {
  const att = m.attachments?.find((a) => a.kind === 'image' || a.kind === 'video');
  if (!att) return null;
  const platformHint = /\bthreads?\b/i.test(m.content) ? 'Threads post' : 'Post';
  if (att.kind === 'video') return trimChatTitle(`${platformHint}: ${att.fileName}`);
  return trimChatTitle(`${platformHint}: ${att.fileName}`);
}

/** Pick a sidebar title that reflects the current task, not an old "delete brand context" message. */
export function titleFromMessages(messages: StoredIzopMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    const mediaTitle = mediaTitleFromMessage(m);
    if (mediaTitle) return mediaTitle;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    const text = m.content.trim();
    if (!text || isIzopQuickReplyMessage(text) || CHAT_TITLE_SKIP.test(text)) continue;
    if (/\b(post|upload|publish|caption|threads|instagram|tiktok|schedule)\b/i.test(text)) {
      return trimChatTitle(text);
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    const text = m.content.trim();
    if (!text || isIzopQuickReplyMessage(text) || CHAT_TITLE_SKIP.test(text)) continue;
    return trimChatTitle(text);
  }

  const firstUser = messages.find(
    (m) => m.role === 'user' && (m.content.trim() || (m.attachments?.length ?? 0) > 0)
  );
  if (!firstUser) return 'New chat';
  if (firstUser.content.trim()) return trimChatTitle(firstUser.content);
  const firstAtt = firstUser.attachments?.[0];
  if (firstAtt) {
    const label =
      firstAtt.kind === 'image'
        ? `Image: ${firstAtt.fileName}`
        : firstAtt.kind === 'video'
          ? `Video: ${firstAtt.fileName}`
          : firstAtt.fileName;
    return trimChatTitle(label);
  }
  return 'New chat';
}

export function shouldReplaceChatTitle(existingTitle: string, nextTitle: string): boolean {
  if (!nextTitle.trim() || nextTitle === 'New chat') return false;
  const existing = existingTitle.trim();
  if (!existing || existing === 'New chat') return true;
  if (CHAT_TITLE_SKIP.test(existing) && !CHAT_TITLE_SKIP.test(nextTitle)) return true;
  return false;
}

export function previewFromMessages(messages: StoredIzopMessage[]): string | null {
  const last = [...messages]
    .reverse()
    .find((m) => m.content.trim() || (m.attachments?.length ?? 0) > 0);
  if (!last) return null;
  if (last.content.trim()) {
    const t = last.content.trim();
    return t.length <= 80 ? t : `${t.slice(0, 80).trim()}…`;
  }
  const att = last.attachments?.[0];
  if (!att) return null;
  if (att.kind === 'image') return `Image: ${att.fileName}`;
  if (att.kind === 'video') return `Video: ${att.fileName}`;
  return `File: ${att.fileName}`;
}

export type ChatDateGroup = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Previous 30 Days' | 'Older';

export function chatDateGroup(updatedAtIso: string, now = new Date()): ChatDateGroup {
  const d = new Date(updatedAtIso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const start7 = new Date(startOfToday);
  start7.setDate(start7.getDate() - 7);
  const start30 = new Date(startOfToday);
  start30.setDate(start30.getDate() - 30);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= start7) return 'Previous 7 Days';
  if (d >= start30) return 'Previous 30 Days';
  return 'Older';
}

const GROUP_ORDER: ChatDateGroup[] = [
  'Today',
  'Yesterday',
  'Previous 7 Days',
  'Previous 30 Days',
  'Older',
];

/** True when cached messages contain any user or assistant content. */
export function sessionHasChatContent(userId: string | undefined, sessionId: string): boolean {
  if (!userId || !sessionId) return false;
  const msgs = readCachedMessages(userId, sessionId);
  return Boolean(
    msgs?.some(
      (m) =>
        Boolean(m.content?.trim()) ||
        (m.attachments?.length ?? 0) > 0 ||
        (m.artifacts?.length ?? 0) > 0
    )
  );
}

/** True once the user has sent at least one message (not assistant-only). */
export function sessionHasConversation(
  s: IzopChatSessionSummary,
  userId?: string
): boolean {
  if (s.preview?.trim()) return true;
  if (s.title.trim() !== '' && s.title !== 'New chat') return true;
  if (!userId) return false;
  return sessionHasChatContent(userId, s.id);
}

/** True when the user has sent at least one message in this session (cached). */
export function sessionHasUserMessages(userId: string | undefined, sessionId: string): boolean {
  if (!userId || !sessionId) return false;
  const msgs = readCachedMessages(userId, sessionId);
  return Boolean(
    msgs?.some(
      (m) => m.role === 'user' && (m.content?.trim() || (m.attachments?.length ?? 0) > 0)
    )
  );
}

/** Sidebar: pending empty draft, offline chats with user messages, or server chats with content. */
export function sessionShouldShowInSidebar(
  s: IzopChatSessionSummary,
  userId?: string
): boolean {
  if (!userId) return sessionHasConversation(s, userId);
  if (readDeletedChatIds(userId).has(s.id)) return false;
  if (s.id.startsWith('offline-')) {
    if (s.id === readPendingNewChatId(userId)) return true;
    return sessionHasChatContent(userId, s.id);
  }
  return sessionHasConversation(s, userId);
}

/** Drop deleted, duplicate, and stale empty offline drafts before rendering or caching. */
export function sanitizeChatSessionList(
  userId: string,
  sessions: IzopChatSessionSummary[]
): IzopChatSessionSummary[] {
  return dedupeChatSessions(sessions).filter((s) => sessionShouldShowInSidebar(s, userId));
}

/** Ensure the pending empty New chat draft is in the session list for sidebar/restore. */
export function withPendingNewChatSession(
  sessions: IzopChatSessionSummary[],
  userId: string
): IzopChatSessionSummary[] {
  const pendingId = readPendingNewChatId(userId);
  if (!pendingId) return sessions;
  if (sessions.some((s) => s.id === pendingId)) return sessions;

  const cached = readCachedSessionList(userId)?.find((s) => s.id === pendingId);
  const now = new Date().toISOString();
  const shell: IzopChatSessionSummary =
    cached ??
    ({
      id: pendingId,
      title: 'New chat',
      updatedAt: now,
      createdAt: now,
      preview: null,
    } satisfies IzopChatSessionSummary);

  return dedupeChatSessions([shell, ...sessions]);
}

/** Whether this chat id may be opened (not tombstoned / deleted). */
export function isChatSessionAccessible(
  userId: string,
  sessionId: string,
  sessions: IzopChatSessionSummary[] = []
): boolean {
  if (readDeletedChatIds(userId).has(sessionId)) return false;
  if (sessionId === readPendingNewChatId(userId)) return true;
  if (sessions.some((s) => s.id === sessionId)) return true;
  return sessionHasUserMessages(userId, sessionId);
}

/** Pick the chat to open from URL param, pending draft, or restore heuristics. */
export function resolveActiveChatId(
  userId: string,
  sessions: IzopChatSessionSummary[],
  chatParam: string | null
): string | null {
  const withPending = withPendingNewChatSession(sessions, userId);
  const pendingId = readPendingNewChatId(userId);
  const hidden = readDeletedChatIds(userId);

  if (chatParam && !hidden.has(chatParam) && isChatSessionAccessible(userId, chatParam, withPending)) {
    return chatParam;
  }

  if (pendingId && !hidden.has(pendingId)) return pendingId;

  return pickRestoreChatId(userId, withPending);
}

export function dedupeChatSessions(
  sessions: IzopChatSessionSummary[]
): IzopChatSessionSummary[] {
  const map = new Map<string, IzopChatSessionSummary>();
  for (const s of sessions) {
    const existing = map.get(s.id);
    if (!existing || new Date(s.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      map.set(s.id, s);
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Sidebar list: started chats plus empty server sessions (not offline drafts). */
export function visibleChatSessions(
  sessions: IzopChatSessionSummary[],
  userId?: string
): IzopChatSessionSummary[] {
  return sessions.filter((s) => sessionShouldShowInSidebar(s, userId));
}

/** Keep the open chat in the sidebar even when only message cache exists (offline URL restore). */
export function ensureActiveChatInSessionList(
  userId: string | undefined,
  sessions: IzopChatSessionSummary[],
  activeId: string | null
): IzopChatSessionSummary[] {
  if (!userId || !activeId) return sessions;
  if (readDeletedChatIds(userId).has(activeId)) return sessions;
  if (sessions.some((s) => s.id === activeId)) return sessions;
  if (!isChatSessionAccessible(userId, activeId, sessions)) return sessions;

  const existing = readCachedSessionList(userId)?.find((s) => s.id === activeId);
  const msgs = readCachedMessages(userId, activeId) as StoredIzopMessage[] | null;
  const now = new Date().toISOString();

  if (existing && sessionShouldShowInSidebar(existing, userId)) {
    return dedupeChatSessions([existing, ...sessions]);
  }

  if (msgs?.length) {
    const shell: IzopChatSessionSummary = {
      id: activeId,
      title: titleFromMessages(msgs),
      preview: previewFromMessages(msgs),
      updatedAt: now,
      createdAt: now,
    };
    return dedupeChatSessions([shell, ...sessions]);
  }

  if (activeId.startsWith('offline-') && activeId === readPendingNewChatId(userId)) {
    const shell: IzopChatSessionSummary = {
      id: activeId,
      title: 'New chat',
      preview: null,
      updatedAt: now,
      createdAt: now,
    };
    return dedupeChatSessions([shell, ...sessions]);
  }

  return sessions;
}

/** Drop deleted server chats from localStorage; server list is source of truth. */
export function syncChatSessionsWithServer(
  userId: string,
  serverSessions: IzopChatSessionSummary[]
): IzopChatSessionSummary[] {
  const serverIds = new Set(serverSessions.map((s) => s.id));
  reconcileDeletedChatIds(userId, serverIds);
  const hidden = readDeletedChatIds(userId);
  const cached = readCachedSessionList(userId) ?? [];

  // Drop server chats that no longer exist remotely; keep offline drafts only.
  const prunedCache = cached.filter((s) => s.id.startsWith('offline-') || serverIds.has(s.id));

  for (const s of cached) {
    if (!s.id.startsWith('offline-') && !serverIds.has(s.id)) {
      writeCachedMessages(userId, s.id, []);
    }
  }

  const merged = sanitizeChatSessionList(userId, [
    ...serverSessions.filter((s) => !hidden.has(s.id)),
    ...prunedCache.filter(
      (s) => s.id.startsWith('offline-') && !hidden.has(s.id) && !serverIds.has(s.id)
    ),
  ]);

  writeCachedSessionList(userId, merged);

  for (const s of prunedCache) {
    if (s.id.startsWith('offline-') && !merged.some((m) => m.id === s.id)) {
      writeCachedMessages(userId, s.id, []);
    }
  }

  // Clear last active if it was deleted
  const lastId = readLastActiveChatId(userId);
  if (lastId && !lastId.startsWith('offline-') && (!serverIds.has(lastId) || hidden.has(lastId))) {
    clearLastActiveChatId(userId);
  }

  return merged;
}

export function mergeChatSessionsWithServer(
  userId: string,
  serverSessions: IzopChatSessionSummary[],
  prevSessions: IzopChatSessionSummary[] = []
): IzopChatSessionSummary[] {
  const synced = syncChatSessionsWithServer(userId, serverSessions);
  const map = new Map(synced.map((s) => [s.id, s]));
  
  // Preserve in-flight offline drafts that still belong in the sidebar.
  for (const s of prevSessions) {
    if (s.id.startsWith('offline-') && sessionShouldShowInSidebar(s, userId)) {
      map.set(s.id, s);
    }
  }
  for (const s of readCachedSessionList(userId) ?? []) {
    if (s.id.startsWith('offline-') && sessionShouldShowInSidebar(s, userId)) {
      map.set(s.id, s);
    }
  }

  return sanitizeChatSessionList(userId, [...map.values()]);
}

/** Pick the most recently updated offline draft in the sidebar list. */
export function newestOfflineDraftId(
  sessions: IzopChatSessionSummary[]
): string | null {
  const offline = sessions
    .filter((s) => s.id.startsWith('offline-'))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return offline[0]?.id ?? null;
}

export function pickRestoreChatId(
  userId: string,
  sessions: IzopChatSessionSummary[]
): string | null {
  const withPending = withPendingNewChatSession(sessions, userId);
  const pendingNew = readPendingNewChatId(userId);
  const hidden = readDeletedChatIds(userId);
  if (pendingNew && !hidden.has(pendingNew)) return pendingNew;

  const sidebar = withPending.filter((s) => sessionShouldShowInSidebar(s, userId));
  const byId = new Map(sidebar.map((s) => [s.id, s]));
  const lastId = readLastActiveChatId(userId);

  if (lastId && !hidden.has(lastId)) {
    const offlineWithMessages = lastId.startsWith('offline-') && sessionHasUserMessages(userId, lastId);
    if (!lastId.startsWith('offline-') || offlineWithMessages) {
      if (sessionHasUserMessages(userId, lastId) || byId.has(lastId)) {
        return lastId;
      }
    }
  }

  const real = sidebar
    .filter((s) => !s.id.startsWith('offline-'))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const withUserMsgs = real.filter((s) => sessionHasUserMessages(userId, s.id));
  if (withUserMsgs.length) return withUserMsgs[0]!.id;
  if (real.length) return real[0]!.id;

  const offlineWithMessages = sidebar
    .filter((s) => s.id.startsWith('offline-') && sessionHasUserMessages(userId, s.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (offlineWithMessages.length) return offlineWithMessages[0]!.id;

  const offline = sidebar
    .filter((s) => s.id.startsWith('offline-'))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return offline[0]?.id ?? null;
}

export function groupChatSessions(
  sessions: IzopChatSessionSummary[]
): Array<{ label: ChatDateGroup; sessions: IzopChatSessionSummary[] }> {
  const map = new Map<ChatDateGroup, IzopChatSessionSummary[]>();
  for (const s of sessions) {
    const g = chatDateGroup(s.updatedAt);
    const list = map.get(g) ?? [];
    list.push(s);
    map.set(g, list);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((label) => ({
    label,
    sessions: map.get(label)!,
  }));
}
