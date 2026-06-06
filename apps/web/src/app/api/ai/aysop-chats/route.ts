import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { previewFromMessages, type StoredAysopMessage } from '@/lib/ai/aysop-chat-sessions';

function parseMessages(raw: unknown): StoredAysopMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m) =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  ) as StoredAysopMessage[];
}

function toSummary(row: {
  id: string;
  title: string;
  updatedAt: Date;
  createdAt: Date;
  messages: unknown;
}) {
  const messages = parseMessages(row.messages);
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    preview: previewFromMessages(messages),
  };
}

/** GET list · POST create */
export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await prisma.aysopChatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
    });
    return NextResponse.json({ sessions: rows.map(toSummary) });
  } catch (e) {
    console.error('[aysop-chats GET]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ sessions: [], warning: 'Chat history unavailable' });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const row = await prisma.aysopChatSession.create({
      data: { userId, title: 'New chat', messages: [] },
      select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
    });
    return NextResponse.json({ session: { ...toSummary(row), messages: [] } });
  } catch (e) {
    console.error('[aysop-chats POST]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not create chat' }, { status: 500 });
  }
}
