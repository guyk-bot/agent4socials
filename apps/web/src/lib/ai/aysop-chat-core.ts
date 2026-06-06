import {
  openAiChatWithTools,
  type OpenAIChatMessageWithTools,
} from '@/lib/openai-client';
import {
  AYSOP_TOOL_DEFINITIONS,
  runAysopTool,
  type AysopArtifact,
  type AysopToolContext,
} from '@/lib/ai/aysop-tools';
import { prisma } from '@/lib/db';

const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(accountHint: string | null): string {
  return [
    'You are Aysop AI, the iZop social media copilot inside the iZop dashboard.',
    'You help creators manage connected platforms: analytics, comments, keyword automations, captions, and publishing.',
    '',
    'Capabilities (use tools):',
    '- Pull analytics summaries and recent post performance from synced data.',
    '- Check how many comments a post received; ask before listing full comment text.',
    '- Show comments only after the user confirms (e.g. "yes", "show me").',
    '- Offer to draft replies or set up keyword automations; confirm before saving automation or sending replies.',
    '- Draft captions and open Composer for images, videos, carousels, or reels (user uploads media in Composer).',
    '',
    'Conversation style:',
    '- Be concise, friendly, and proactive.',
    '- Example: if latest post has 10 comments, say "Your latest post has 10 comments. Want me to show them?" and wait.',
    '- If user agrees, call fetch_post_comments.',
    '- After showing comments, offer to draft replies or set keyword automation.',
    '',
    accountHint ? `Default account context: ${accountHint}` : 'No account selected; ask which connected account to use if needed.',
    'Do not invent metrics or comments; always use tools for live data.',
    'Plain text only in replies (no markdown bold). No em dashes.',
  ].join('\n');
}

export type AysopChatInputMessage = { role: 'user' | 'assistant'; content: string };

export async function runAysopChat(args: {
  messages: AysopChatInputMessage[];
  ctx: AysopToolContext;
}): Promise<{ reply: string; artifacts: AysopArtifact[] }> {
  let accountHint: string | null = null;
  if (args.ctx.accountId) {
    const acc = await prisma.socialAccount.findFirst({
      where: { id: args.ctx.accountId, userId: args.ctx.userId },
      select: { platform: true, username: true },
    });
    if (acc) accountHint = `${acc.platform} @${acc.username} (${args.ctx.accountId})`;
  }

  const thread: OpenAIChatMessageWithTools[] = [
    { role: 'system', content: buildSystemPrompt(accountHint) },
    ...args.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const artifacts: AysopArtifact[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await openAiChatWithTools(thread, AYSOP_TOOL_DEFINITIONS, { max_tokens: 900 });
    const assistantMsg = res.message;

    if (!assistantMsg.tool_calls?.length) {
      const text = assistantMsg.content?.trim() || 'Done.';
      return { reply: text, artifacts };
    }

    thread.push({
      role: 'assistant',
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    });

    for (const call of assistantMsg.tool_calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      let toolResult: unknown;
      try {
        const out = await runAysopTool(call.function.name, parsed, args.ctx);
        toolResult = out.result;
        if (out.artifacts?.length) artifacts.push(...out.artifacts);
      } catch (e) {
        toolResult = { error: (e as Error).message };
      }
      thread.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return {
    reply: 'I need another step to finish that. Try asking again with a bit more detail.',
    artifacts,
  };
}
