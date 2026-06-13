import type { AysopChatAttachment } from '@/lib/ai/aysop-attachments';
import {
  clearLastActiveChatId,
  readCachedMessages,
  readCachedSessionList,
  readLastActiveChatId,
  writeCachedMessages,
  writeCachedSessionList,
} from '@/lib/ai/aysop-chat-local-cache';

export type StoredAysopMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: unknown[];
  attachments?: AysopChatAttachment[];
};

export type AysopChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  preview: string | null;
};

export function titleFromMessages(messages: StoredAysopMessage[]): string {
  const firstUser = messages.find(
    (m) => m.role === 'user' && (m.content.trim() || (m.attachments?.length ?? 0) > 0)
  );
  if (!firstUser) return 'New chat';
  if (firstUser.content.trim()) {
    const trimmed = firstUser.content.trim();
    if (trimmed.length <= 52) return trimmed;
    return `${trimmed.slice(0, 52).trim()}…`;
  }
  const firstAtt = firstUser.attachments?.[0];
  if (firstAtt) {
    const label =
      firstAtt.kind === 'image'
        ? `Image: ${firstAtt.fileName}`
        : firstAtt.kind === 'video'
          ? `Video: ${firstAtt.fileName}`
          : firstAtt.fileName;
    return label.length <= 52 ? label : `${label.slice(0, 52).trim()}…`;
  }
  return 'New chat';
}

export function previewFromMessages(messages: StoredAysopMessage[]): string | null {
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

/** True once the user has sent at least one message (not assistant-only). */
export function sessionHasConversation(
  s: AysopChatSessionSummary,
  userId?: string
): boolean {
  if (s.preview?.trim()) return true;
  if (s.title.trim() !== '' && s.title !== 'New chat') return true;
  if (!userId) return false;
  const msgs = readCachedMessages(userId, s.id);
  return Boolean(
    msgs?.some(
      (m) => m.role === 'user' && (m.content?.trim() || (m.attachments?.length ?? 0) > 0)
    )
  );
}

/** Sidebar: chats with messages, or server sessions the user explicitly created (New chat). */
export function sessionShouldShowInSidebar(
  s: AysopChatSessionSummary,
  userId?: string
): boolean {
  if (sessionHasConversation(s, userId)) return true;
  if (s.id.startsWith('offline-')) return false;
  return true;
}

/** Sidebar list: started chats plus empty server sessions (not offline drafts). */
export function visibleChatSessions(
  sessions: AysopChatSessionSummary[],
  userId?: string
): AysopChatSessionSummary[] {
  return sessions.filter((s) => sessionShouldShowInSidebar(s, userId));
}

/** Drop deleted server chats from localStorage; server list is source of truth. */
export function syncChatSessionsWithServer(
  userId: string,
  serverSessions: AysopChatSessionSummary[]
): AysopChatSessionSummary[] {
  const serverIds = new Set(serverSessions.map((s) => s.id));
  const cached = readCachedSessionList(userId) ?? [];

  // Clean up cache for deleted sessions
  for (const s of cached) {
    if (!s.id.startsWith('offline-') && !serverIds.has(s.id)) {
      writeCachedMessages(userId, s.id, []);
    }
  }

  // Only include server sessions that should show in sidebar, properly sorted
  const merged = serverSessions
    .filter((s) => sessionShouldShowInSidebar(s, userId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  
  writeCachedSessionList(userId, merged);

  // Clear last active if it was deleted
  const lastId = readLastActiveChatId(userId);
  if (lastId && !lastId.startsWith('offline-') && !serverIds.has(lastId)) {
    clearLastActiveChatId(userId);
  }

  return merged;
}

export function mergeChatSessionsWithServer(
  userId: string,
  serverSessions: AysopChatSessionSummary[],
  prevSessions: AysopChatSessionSummary[] = []
): AysopChatSessionSummary[] {
  const synced = syncChatSessionsWithServer(userId, serverSessions);
  const map = new Map(synced.map((s) => [s.id, s]));
  
  // Only preserve offline sessions that have content
  for (const s of prevSessions) {
    if (s.id.startsWith('offline-') && sessionHasConversation(s, userId)) {
      map.set(s.id, s);
    }
  }
  
  // Return properly sorted sessions
  return [...map.values()]
    .filter((s) => sessionShouldShowInSidebar(s, userId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function pickRestoreChatId(
  userId: string,
  sessions: AysopChatSessionSummary[]
): string | null {
  const sidebar = sessions.filter((s) => sessionShouldShowInSidebar(s, userId));
  const byId = new Map(sidebar.map((s) => [s.id, s]));
  const lastId = readLastActiveChatId(userId);

  if (lastId && byId.has(lastId)) return lastId;

  const real = sidebar.filter((s) => !s.id.startsWith('offline-'));
  const withConvo = real.filter((s) => sessionHasConversation(s, userId));
  if (withConvo.length) return withConvo[0]!.id;
  if (real.length) return real[0]!.id;

  const offline = sidebar.find((s) => s.id.startsWith('offline-'));
  return offline?.id ?? null;
}

export function groupChatSessions(
  sessions: AysopChatSessionSummary[]
): Array<{ label: ChatDateGroup; sessions: AysopChatSessionSummary[] }> {
  const map = new Map<ChatDateGroup, AysopChatSessionSummary[]>();
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
