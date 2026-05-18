/**
 * Server-side DB cache for inbox conversation messages, backed by the AppKv table.
 *
 * Keys:  inbox_msgs:{socialAccountId}:{conversationId}
 * TTL:   4 hours — messages are considered fresh and served instantly without any
 *        Meta/X API call. The cron /api/cron/sync-inbox re-warms every conversation
 *        before the TTL expires so users never see a loading state.
 */
import { prisma } from '@/lib/db';
import type { ConversationUiMessage } from './load-meta-conversation-messages';

export const INBOX_MESSAGES_DB_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

let _tableEnsured = false;

async function ensureAppKvTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    _tableEnsured = true;
  } catch {
    _tableEnsured = true;
  }
}

export function inboxMsgKey(socialAccountId: string, conversationId: string): string {
  return `inbox_msgs:${socialAccountId}:${conversationId}`;
}

export async function getInboxMessagesFromDb(
  socialAccountId: string,
  conversationId: string,
  /** ISO timestamp of the conversation's last update. When provided and newer than
   * the cache write time, the cache is treated as stale and null is returned so the
   * caller fetches fresh messages from the platform API. */
  convUpdatedTime?: string | null
): Promise<ConversationUiMessage[] | null> {
  try {
    await ensureAppKvTable();
    const rows = await prisma.$queryRaw<Array<{ value: string; expiresAt: Date | null; updatedAt: Date }>>`
      SELECT value, "expiresAt", "updatedAt"
      FROM app_kv
      WHERE key = ${inboxMsgKey(socialAccountId, conversationId)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    // If the conversation was updated after we last cached its messages, a new
    // message arrived — skip the cache so the caller fetches from the platform API.
    if (convUpdatedTime) {
      const convMs = Date.parse(convUpdatedTime);
      if (Number.isFinite(convMs) && convMs > row.updatedAt.getTime()) return null;
    }
    return JSON.parse(row.value) as ConversationUiMessage[];
  } catch {
    return null;
  }
}

export async function setInboxMessagesInDb(
  socialAccountId: string,
  conversationId: string,
  messages: ConversationUiMessage[]
): Promise<void> {
  try {
    await ensureAppKvTable();
    const key = inboxMsgKey(socialAccountId, conversationId);
    const expiresAt = new Date(Date.now() + INBOX_MESSAGES_DB_TTL_MS);
    const value = JSON.stringify(messages);
    await prisma.$executeRaw`
      INSERT INTO app_kv (key, value, "expiresAt", "updatedAt")
      VALUES (${key}, ${value}, ${expiresAt}, now())
      ON CONFLICT (key) DO UPDATE
        SET value = ${value}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    `;
  } catch {
    // non-critical — fall back to live API
  }
}

/**
 * Returns true if the conversation already has a fresh server-side cache entry
 * so the cron can skip re-fetching it.
 */
export async function isInboxMessagesCached(
  socialAccountId: string,
  conversationId: string
): Promise<boolean> {
  try {
    await ensureAppKvTable();
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM app_kv
      WHERE key = ${inboxMsgKey(socialAccountId, conversationId)}
        AND "expiresAt" > now()
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}
