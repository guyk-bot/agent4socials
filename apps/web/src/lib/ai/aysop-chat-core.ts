import { BRAND_NAME } from '@/lib/site-brand-assets';
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

function formatAccountCatalog(
  accounts: Array<{ id: string; platform: string; username: string | null }>
): string {
  if (!accounts.length) return 'Connected accounts: none yet. User should connect platforms in Console.';
  const lines = accounts.map(
    (a) => `- ${a.platform}${a.username ? ` @${a.username}` : ''} (id: ${a.id})`
  );
  return ['Connected accounts (use platform name in tools; never ask user to pick an account):', ...lines].join(
    '\n'
  );
}

function buildSystemPrompt(accountCatalog: string): string {
  return [
    `You are ${BRAND_NAME} AI, the social media copilot inside the ${BRAND_NAME} dashboard.`,
    'You help creators manage all connected platforms: analytics, comments, keyword automations, captions, and publishing.',
    '',
    accountCatalog,
    '',
    'Platform routing (critical):',
    '- Infer which platform the user means from their message (TikTok, Instagram, Facebook, YouTube, X/Twitter, LinkedIn, Pinterest, Threads).',
    '- When they ask generally ("my analytics", "all platforms", "summarize everything"), call get_analytics_all_accounts.',
    '- When they name a platform or content type clearly tied to one (e.g. "TikTok video", "IG reel"), pass that platform to single-account tools.',
    '- For "latest post" without a platform, call get_latest_post_comment_stats with no platform to search across all accounts.',
    '- Never ask the user to select an account or platform from a dropdown. You already know all connected accounts.',
    '',
    'Capabilities (use tools):',
    '- Pull analytics for one platform or all platforms from synced data.',
    '- Check comment counts; ask before listing full comment text.',
    '- Show comments only after the user confirms (e.g. "yes", "show me").',
    '- Offer keyword automations; confirm before saving.',
    '- Draft captions and open Composer for images, videos, carousels, or reels.',
    '',
    'Conversation style:',
    '- Be concise, friendly, and proactive.',
    '- Example: if latest post has 10 comments, say "Your latest post has 10 comments. Want me to show them?" and wait.',
    '- Do not invent metrics or comments; always use tools for live data.',
    'Plain text only in replies (no markdown bold). No em dashes.',
  ].join('\n');
}

export type AysopChatInputMessage = { role: 'user' | 'assistant'; content: string };

export async function runAysopChat(args: {
  messages: AysopChatInputMessage[];
  ctx: AysopToolContext;
}): Promise<{ reply: string; artifacts: AysopArtifact[] }> {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: args.ctx.userId },
    select: { id: true, platform: true, username: true },
    orderBy: { createdAt: 'asc' },
  });

  const thread: OpenAIChatMessageWithTools[] = [
    { role: 'system', content: buildSystemPrompt(formatAccountCatalog(accounts)) },
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
