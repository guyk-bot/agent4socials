import { NextRequest, NextResponse } from 'next/server';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { runIzopChat } from '@/lib/ai/izop-chat-core';
import { isIzopLlmConfigured } from '@/lib/ai/llm-config';
import { trackUsage } from '@/lib/usage-tracking';
import { parseBrandContextApiPayload } from '@/lib/brand-context-utils';
import { normalizeChatAttachments } from '@/lib/ai/izop-attachments';
import { trimMessagesForLlmContext } from '@/lib/ai/izop-chat-context-window';
import { findLatestMediaUserMessage } from '@/lib/ai/izop-openai-messages';
import { polishPostPreviewChatResponse } from '@/lib/ai/izop-post-preview-response';

export const maxDuration = 120;

/** Wall-clock budget for tool rounds so we return before Vercel kills the function. */
const CHAT_WALL_BUDGET_MS = Number(process.env.IZOP_CHAT_WALL_BUDGET_MS) || 110_000;

function messageHasBody(m: { content?: string; attachments?: unknown }): boolean {
  const text = typeof m.content === 'string' ? m.content.trim() : '';
  const attachments = normalizeChatAttachments(m.attachments);
  return text.length > 0 || attachments.length > 0;
}

/**
 * POST /api/ai/izop-chat
 * Body: { messages: { role, content, attachments? }[] }
 */
export async function POST(request: NextRequest) {
  if (!isIzopLlmConfigured()) {
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
    brandContextSnapshot?: Record<string, unknown> | null;
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

  const { messages: llmMessages, omittedCount } = trimMessagesForLlmContext(messages);
  const mediaMsg = findLatestMediaUserMessage(llmMessages);
  const threadMediaUrls =
    mediaMsg?.attachments
      ?.filter((a) => a.kind === 'image' || a.kind === 'video')
      .map((a) => a.fileUrl) ?? [];

  try {
    const started = Date.now();
    const deadlineMs = started + CHAT_WALL_BUDGET_MS;
    const { reply, artifacts } = await Promise.race([
      runIzopChat({
        messages: llmMessages,
        ctx: {
          userId,
          workspaces: body.workspaces,
          activeBrand: body.activeBrand ?? null,
          brandContextSnapshot: body.brandContextSnapshot
            ? parseBrandContextApiPayload(body.brandContextSnapshot)
            : null,
          threadMediaUrls,
        },
        contextOmittedCount: omittedCount,
        deadlineMs,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Chat request timed out. Try a simpler question.')), CHAT_WALL_BUDGET_MS);
      }),
    ]);
    void trackUsage(userId, 'ai_generation', 1);
    const polished = polishPostPreviewChatResponse({ reply, artifacts });
    return NextResponse.json({ ...polished, elapsedMs: Date.now() - started });
  } catch (e) {
    console.error('[izop-chat]', (e as Error).message?.slice(0, 300));
    return NextResponse.json(
      { message: (e as Error).message || `${BRAND_NAME} AI request failed.` },
      { status: 500 }
    );
  }
}
