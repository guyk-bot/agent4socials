import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import {
  previewFromMessages,
  titleFromMessages,
  type StoredAysopMessage,
} from '@/lib/ai/aysop-chat-sessions';

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

type RouteCtx = { params: Promise<{ id: string }> };

/** GET one · PATCH update · DELETE */
export async function GET(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const row = await prisma.aysopChatSession.findFirst({
    where: { id, userId },
    select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
  });
  if (!row) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

  const messages = parseMessages(row.messages);
  return NextResponse.json({
    session: {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      preview: previewFromMessages(messages),
      messages,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.aysopChatSession.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

  const body = (await request.json()) as {
    messages?: StoredAysopMessage[];
    title?: string;
  };

  const messages = body.messages ? parseMessages(body.messages).slice(-80) : undefined;
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : messages
        ? titleFromMessages(messages)
        : undefined;

  const row = await prisma.aysopChatSession.update({
    where: { id },
    data: {
      ...(messages ? { messages: messages as object[] } : {}),
      ...(title ? { title } : {}),
    },
    select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
  });

  const parsed = parseMessages(row.messages);
  return NextResponse.json({
    session: {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      preview: previewFromMessages(parsed),
      messages: parsed,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.aysopChatSession.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

  await prisma.aysopChatSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
