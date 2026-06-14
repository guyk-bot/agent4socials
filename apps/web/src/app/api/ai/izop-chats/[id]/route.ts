import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  deleteIzopChatSession,
  getIzopChatSession,
  updateIzopChatSession,
} from '@/lib/ai/izop-chat-store';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET one · PATCH update · DELETE */
export async function GET(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const session = await getIzopChatSession(userId, id);
    if (!session) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (e) {
    console.error('[izop-chats GET id]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not load chat' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      messages?: unknown;
      title?: string;
    };

    const session = await updateIzopChatSession(userId, id, body);
    if (!session) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (e) {
    console.error('[izop-chats PATCH]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not save chat' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteCtx) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const ok = await deleteIzopChatSession(userId, id);
    if (!ok) return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[izop-chats DELETE]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not delete chat' }, { status: 500 });
  }
}
