export type StoredAysopMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: unknown[];
};

export type AysopChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  preview: string | null;
};

export function titleFromMessages(messages: StoredAysopMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!firstUser) return 'New chat';
  const trimmed = firstUser.content.trim();
  if (trimmed.length <= 52) return trimmed;
  return `${trimmed.slice(0, 52).trim()}…`;
}

export function previewFromMessages(messages: StoredAysopMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.content.trim());
  if (!last) return null;
  const t = last.content.trim();
  return t.length <= 80 ? t : `${t.slice(0, 80).trim()}…`;
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

/** Chats with messages or a custom title; always include the active chat. */
export function visibleChatSessions(
  sessions: AysopChatSessionSummary[],
  activeId: string | null
): AysopChatSessionSummary[] {
  return sessions.filter(
    (s) =>
      s.id === activeId ||
      Boolean(s.preview?.trim()) ||
      (s.title.trim() !== '' && s.title !== 'New chat')
  );
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
