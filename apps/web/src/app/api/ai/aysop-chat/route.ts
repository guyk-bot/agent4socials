import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { runAysopChat } from '@/lib/ai/aysop-chat-core';
import { trackUsage } from '@/lib/usage-tracking';

export const maxDuration = 60;

/**
 * POST /api/ai/aysop-chat
 * Body: { messages: { role: 'user'|'assistant', content: string }[], accountId?: string }
 */
export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { message: 'Aysop AI is not configured (OPENAI_API_KEY missing).' },
      { status: 503 }
    );
  }

  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    messages?: Array<{ role?: string; content?: string }>;
    accountId?: string | null;
  };

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content!.trim() }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ message: 'Send at least one user message.' }, { status: 400 });
  }

  if (messages.length > 40) {
    return NextResponse.json({ message: 'Conversation too long. Start a new chat.' }, { status: 400 });
  }

  try {
    const { reply, artifacts } = await runAysopChat({
      messages,
      ctx: { userId, accountId: body.accountId ?? null },
    });
    void trackUsage(userId, 'ai_generation', 1);
    return NextResponse.json({ reply, artifacts });
  } catch (e) {
    console.error('[aysop-chat]', (e as Error).message?.slice(0, 300));
    return NextResponse.json(
      { message: (e as Error).message || 'Aysop AI request failed.' },
      { status: 500 }
    );
  }
}
