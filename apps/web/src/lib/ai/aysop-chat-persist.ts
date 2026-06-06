import type { StoredAysopMessage } from '@/lib/ai/aysop-chat-sessions';
import { normalizeChatAttachments } from '@/lib/ai/aysop-attachments';

/** Normalize messages from API or client before DB write. Keeps id, content, role, artifacts, attachments. */
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
    const attachments = normalizeChatAttachments(m.attachments);
    const item: StoredAysopMessage = { id, role, content };
    if (Array.isArray(m.artifacts)) item.artifacts = m.artifacts;
    if (attachments.length) item.attachments = attachments;
    out.push(item);
  }
  return out;
}

export function hasConversation(messages: StoredAysopMessage[]): boolean {
  return messages.some(
    (m) => m.content.trim().length > 0 || (m.attachments?.length ?? 0) > 0
  );
}

/** Prefer the richer copy when local cache and server history disagree. */
export function pickBestStoredMessages<T extends { content?: string; attachments?: unknown[] }>(
  local: T[],
  server: T[]
): T[] {
  if (server.length > local.length) return server;
  if (local.length > server.length) return local;
  if (local.length === 0) return server;

  const weight = (rows: T[]) =>
    rows.reduce(
      (sum, row) =>
        sum +
        String(row.content ?? '').length +
        (Array.isArray(row.attachments) ? row.attachments.length * 200 : 0),
      0
    );

  return weight(server) >= weight(local) ? server : local;
}
