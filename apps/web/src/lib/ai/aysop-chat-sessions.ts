import type { AysopChatAttachment } from '@/lib/ai/aysop-attachments';

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

/** True once the user has sent at least one message (preview/title updated). */
export function sessionHasConversation(s: AysopChatSessionSummary): boolean {
  if (s.preview?.trim()) return true;
  if (s.title.trim() !== '' && s.title !== 'New chat') return true;
  return false;
}

/** Sidebar list: only chats that have actually started (no empty "New chat" rows). */
export function visibleChatSessions(sessions: AysopChatSessionSummary[]): AysopChatSessionSummary[] {
  return sessions.filter(sessionHasConversation);
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
