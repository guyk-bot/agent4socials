import { NextRequest, NextResponse } from 'next/server';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { runAysopChat } from '@/lib/ai/aysop-chat-core';
import { isAysopLlmConfigured } from '@/lib/ai/llm-config';
import { trackUsage } from '@/lib/usage-tracking';
import { normalizeChatAttachments } from '@/lib/ai/aysop-attachments';

export const maxDuration = 60;

/** Wall-clock budget for tool rounds so we return before Vercel kills the function. */
const CHAT_WALL_BUDGET_MS = Number(process.env.AYSOP_CHAT_WALL_BUDGET_MS) || 52_000;

function messageHasBody(m: { content?: string; attachments?: unknown }): boolean {
  const text = typeof m.content === 'string' ? m.content.trim() : '';
  const attachments = normalizeChatAttachments(m.attachments);
  return text.length > 0 || attachments.length > 0;
}

/**
 * POST /api/ai/aysop-chat
 * Body: { messages: { role, content, attachments? }[] }
 */
export async function POST(request: NextRequest) {
  if (!isAysopLlmConfigured()) {
    return NextResponse.json(
      {
        message: `${BRAND_NAME} AI is not configured. Add Izop_AI (OpenRouter) or OPENAI_API_KEY in Vercel.`,
      },
      { status: 503 }
    );
  }

  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    messages?: Array<{ role?: string; content?: string; attachments?: unknown }>;
    workspaces?: Array<{
      id: string;
      name: string;
      connectedAccountCount: number;
      accounts: Array<{ id: string; platform: string; username: string | null }>;
    }>;
    activeBrand?: { id: string; name: string } | null;
  };

  const messages = (body.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content.trim() : '',
      attachments: m.role === 'user' ? normalizeChatAttachments(m.attachments) : undefined,
    }))
    .filter(messageHasBody);

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ message: 'Send at least one user message.' }, { status: 400 });
  }

  if (messages.length > 40) {
    return NextResponse.json({ message: 'Conversation too long. Start a new chat.' }, { status: 400 });
  }

  try {
    const started = Date.now();
    const { reply, artifacts } = await Promise.race([
      runAysopChat({
        messages,
        ctx: { userId, workspaces: body.workspaces, activeBrand: body.activeBrand ?? null },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Chat request timed out. Try a simpler question.')), CHAT_WALL_BUDGET_MS);
      }),
    ]);
    void trackUsage(userId, 'ai_generation', 1);
    return NextResponse.json({ reply, artifacts, elapsedMs: Date.now() - started });
  } catch (e) {
    console.error('[aysop-chat]', (e as Error).message?.slice(0, 300));
    return NextResponse.json(
      { message: (e as Error).message || `${BRAND_NAME} AI request failed.` },
      { status: 500 }
    );
  }
}
