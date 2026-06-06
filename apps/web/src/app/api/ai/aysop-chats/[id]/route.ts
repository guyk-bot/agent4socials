import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import {
  previewFromMessages,
  titleFromMessages,
} from '@/lib/ai/aysop-chat-sessions';
import { normalizeStoredMessages } from '@/lib/ai/aysop-chat-persist';
import { ensureAysopChatTable } from '@/lib/ai/ensure-aysop-chat-table';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET one · PATCH update · DELETE */
export async function GET(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    await ensureAysopChatTable();
    const row = await prisma.aysopChatSession.findFirst({
      where: { id, userId },
      select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
    });
    if (!row) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

    const messages = normalizeStoredMessages(row.messages);
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
  } catch (e) {
    console.error('[aysop-chats GET id]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not load chat' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    await ensureAysopChatTable();

    const existing = await prisma.aysopChatSession.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

    const body = (await request.json()) as {
      messages?: unknown;
      title?: string;
    };

    const messages = body.messages ? normalizeStoredMessages(body.messages).slice(-80) : undefined;
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

    const parsed = normalizeStoredMessages(row.messages);
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
  } catch (e) {
    console.error('[aysop-chats PATCH]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not save chat' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    await ensureAysopChatTable();
    const existing = await prisma.aysopChatSession.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });

    await prisma.aysopChatSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[aysop-chats DELETE]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not delete chat' }, { status: 500 });
  }
}
