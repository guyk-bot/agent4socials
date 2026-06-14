import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { ensureAysopChatTable, resetAysopChatTableEnsure } from '@/lib/ai/ensure-aysop-chat-table';
import {
  previewFromMessages,
  shouldReplaceChatTitle,
  titleFromMessages,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';
import { normalizeStoredMessages, hasConversation } from '@/lib/ai/aysop-chat-persist';
import type { StoredAysopMessage } from '@/lib/ai/aysop-chat-sessions';
import { sessionHasConversation } from '@/lib/ai/aysop-chat-sessions';

export type AysopChatSessionRow = AysopChatSessionSummary & {
  messages: StoredAysopMessage[];
};

type DbRow = {
  id: string;
  title: string;
  updatedAt: Date;
  createdAt: Date;
  messages: unknown;
};

function rowToSession(row: DbRow): AysopChatSessionRow {
  const messages = normalizeStoredMessages(row.messages);
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    preview: previewFromMessages(messages),
    messages,
  };
}

function summaryFromRow(row: DbRow): AysopChatSessionSummary {
  const messages = normalizeStoredMessages(row.messages);
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    preview: previewFromMessages(messages),
  };
}

function prismaHasAysopModel(): boolean {
  return typeof (prisma as { aysopChatSession?: unknown }).aysopChatSession !== 'undefined';
}

function isMissingTableError(e: unknown): boolean {
  const msg = ((e as Error)?.message ?? '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('aysop_chat_sessions') ||
    msg.includes('p2021') ||
    msg.includes('relation') ||
    msg.includes('unknown model')
  );
}

async function listSessionsRaw(userId: string): Promise<DbRow[]> {
  return prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT id, title, "updatedAt", "createdAt", messages
     FROM aysop_chat_sessions
     WHERE "userId" = $1
     ORDER BY "updatedAt" DESC
     LIMIT 100`,
    userId
  );
}

async function getSessionRaw(userId: string, id: string): Promise<DbRow | null> {
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT id, title, "updatedAt", "createdAt", messages
     FROM aysop_chat_sessions
     WHERE id = $1 AND "userId" = $2
     LIMIT 1`,
    id,
    userId
  );
  return rows[0] ?? null;
}

async function createSessionRaw(userId: string, title = 'New chat'): Promise<DbRow> {
  const id = randomUUID();
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `INSERT INTO aysop_chat_sessions (id, "userId", title, messages, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, '[]'::jsonb, NOW(), NOW())
     RETURNING id, title, "updatedAt", "createdAt", messages`,
    id,
    userId,
    title.slice(0, 120)
  );
  if (!rows[0]) throw new Error('Insert returned no row');
  return rows[0];
}

async function updateSessionRaw(
  userId: string,
  id: string,
  data: { title?: string; messages?: StoredAysopMessage[] }
): Promise<DbRow | null> {
  const existing = await getSessionRaw(userId, id);
  if (!existing) return null;

  const nextTitle = data.title ?? existing.title;
  const nextMessages = data.messages ?? normalizeStoredMessages(existing.messages);
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `UPDATE aysop_chat_sessions
     SET title = $3, messages = $4::jsonb, "updatedAt" = NOW()
     WHERE id = $1 AND "userId" = $2
     RETURNING id, title, "updatedAt", "createdAt", messages`,
    id,
    userId,
    nextTitle.slice(0, 120),
    JSON.stringify(nextMessages)
  );
  return rows[0] ?? null;
}

async function deleteSessionRaw(userId: string, id: string): Promise<boolean> {
  const count = await prisma.$executeRawUnsafe(
    `DELETE FROM aysop_chat_sessions WHERE id = $1 AND "userId" = $2`,
    id,
    userId
  );
  return Number(count) > 0;
}

export async function listAysopChatSessions(userId: string): Promise<AysopChatSessionSummary[]> {
  await ensureAysopChatTable();
  try {
    if (prismaHasAysopModel()) {
      const rows = await prisma.aysopChatSession.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
      });
      return rows.map(summaryFromRow).filter((s) => sessionHasConversation(s));
    }
  } catch (e) {
    if (!isMissingTableError(e)) throw e;
    resetAysopChatTableEnsure();
    await ensureAysopChatTable();
  }
  const rows = await listSessionsRaw(userId);
  return rows.map(summaryFromRow).filter((s) => sessionHasConversation(s));
}

export async function getAysopChatSession(userId: string, id: string): Promise<AysopChatSessionRow | null> {
  await ensureAysopChatTable();
  try {
    if (prismaHasAysopModel()) {
      const row = await prisma.aysopChatSession.findFirst({
        where: { id, userId },
        select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
      });
      return row ? rowToSession(row) : null;
    }
  } catch (e) {
    if (!isMissingTableError(e)) throw e;
    resetAysopChatTableEnsure();
    await ensureAysopChatTable();
  }
  const row = await getSessionRaw(userId, id);
  return row ? rowToSession(row) : null;
}

export async function createAysopChatSession(
  userId: string,
  title = 'New chat'
): Promise<AysopChatSessionRow> {
  await ensureAysopChatTable();
  try {
    if (prismaHasAysopModel()) {
      const row = await prisma.aysopChatSession.create({
        data: { userId, title: title.slice(0, 120), messages: [] },
        select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
      });
      return rowToSession(row);
    }
  } catch (e) {
    if (!isMissingTableError(e)) {
      console.error('[AysopChat] prisma create failed, trying raw:', (e as Error).message?.slice(0, 120));
    }
    resetAysopChatTableEnsure();
    await ensureAysopChatTable();
  }
  const row = await createSessionRaw(userId, title);
  return rowToSession(row);
}

export async function updateAysopChatSession(
  userId: string,
  id: string,
  body: { messages?: unknown; title?: string }
): Promise<AysopChatSessionRow | null> {
  await ensureAysopChatTable();

  const explicitTitle =
    typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : undefined;
  const messages = body.messages ? normalizeStoredMessages(body.messages) : undefined;

  if (explicitTitle && !messages) {
    try {
      if (prismaHasAysopModel()) {
        const row = await prisma.aysopChatSession.updateMany({
          where: { id, userId },
          data: { title: explicitTitle },
        });
        if (row.count === 0) return null;
        return getAysopChatSession(userId, id);
      }
    } catch (e) {
      if (!isMissingTableError(e)) throw e;
      resetAysopChatTableEnsure();
      await ensureAysopChatTable();
    }
    const row = await updateSessionRaw(userId, id, { title: explicitTitle });
    return row ? rowToSession(row) : null;
  }

  const existing = await getAysopChatSession(userId, id);
  if (!existing) return null;

  let nextMessages = messages;
  if (
    nextMessages &&
    nextMessages.length === 0 &&
    hasConversation(existing.messages)
  ) {
    nextMessages = existing.messages;
  }

  let nextTitle = existing.title;
  if (explicitTitle) {
    nextTitle = explicitTitle;
  } else if (messages) {
    const auto = titleFromMessages(nextMessages ?? messages);
    if (shouldReplaceChatTitle(existing.title, auto)) {
      nextTitle = auto;
    }
  }

  try {
    if (prismaHasAysopModel()) {
      const row = await prisma.aysopChatSession.update({
        where: { id },
        data: {
          ...(messages !== undefined && nextMessages ? { messages: nextMessages as object[] } : {}),
          title: nextTitle,
        },
        select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
      });
      return rowToSession(row);
    }
  } catch (e) {
    if (!isMissingTableError(e)) throw e;
    resetAysopChatTableEnsure();
    await ensureAysopChatTable();
  }

  const row = await updateSessionRaw(userId, id, {
    title: nextTitle,
    ...(messages !== undefined && nextMessages ? { messages: nextMessages } : {}),
  });
  return row ? rowToSession(row) : null;
}

export async function deleteAysopChatSession(userId: string, id: string): Promise<boolean> {
  await ensureAysopChatTable();
  try {
    if (prismaHasAysopModel()) {
      const existing = await prisma.aysopChatSession.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!existing) return false;
      await prisma.aysopChatSession.delete({ where: { id } });
      return true;
    }
  } catch (e) {
    if (!isMissingTableError(e)) throw e;
    resetAysopChatTableEnsure();
    await ensureAysopChatTable();
  }
  return deleteSessionRaw(userId, id);
}
