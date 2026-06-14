import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  createIzopChatSession,
  listIzopChatSessions,
} from '@/lib/ai/izop-chat-store';

/** GET list · POST create */
export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const sessions = await listIzopChatSessions(userId);
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error('[izop-chats GET]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ sessions: [], warning: 'Chat history unavailable' });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  let title = 'New chat';
  try {
    const body = (await request.json()) as { title?: string };
    if (typeof body?.title === 'string' && body.title.trim()) {
      title = body.title.trim().slice(0, 120);
    }
  } catch {
    /* empty body is fine */
  }

  try {
    const session = await createIzopChatSession(userId, title);
    return NextResponse.json({ session });
  } catch (e) {
    console.error('[izop-chats POST]', (e as Error).message?.slice(0, 200));
    return NextResponse.json({ message: 'Could not create chat' }, { status: 500 });
  }
}
