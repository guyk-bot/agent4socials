import type { StoredAysopMessage } from '@/lib/ai/aysop-chat-sessions';

/** Normalize messages from API or client before DB write. Keeps id, content, role, artifacts. */
export function normalizeStoredMessages(raw: unknown): StoredAysopMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAysopMessage[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const m = row as Record<string, unknown>;
    const role = m.role;
    const content = m.content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const id = typeof m.id === 'string' && m.id.trim() ? m.id : `msg-${out.length}`;
    const item: StoredAysopMessage = { id, role, content };
    if (Array.isArray(m.artifacts)) item.artifacts = m.artifacts;
    out.push(item);
  }
  return out;
}

export function hasConversation(messages: StoredAysopMessage[]): boolean {
  return messages.some((m) => m.content.trim().length > 0);
}
