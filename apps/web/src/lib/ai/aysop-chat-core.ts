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
import { formatBrandContextForPrompt } from '@/lib/ai/brand-context-prompt';
import { formatAppSurfaceCatalog } from '@/lib/ai/aysop-artifacts';
import {
  buildOpenAiUserContent,
  threadHasImages,
  type AysopChatInputMessage,
} from '@/lib/ai/aysop-openai-messages';

export type { AysopChatInputMessage };

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

function buildSystemPrompt(accountCatalog: string, brandContextBlock: string | null): string {
  return [
    `You are ${BRAND_NAME} AI, the social media copilot inside the ${BRAND_NAME} dashboard.`,
    'You help creators manage all connected platforms: analytics, comments, keyword automations, captions, and publishing.',
    '',
    accountCatalog,
    '',
    brandContextBlock ?? 'Brand context: not set yet. If the user asks about their brand voice or product, suggest they fill in AI Assistant under Brand context.',
    '',
    'Platform routing (critical):',
    '- Infer which platform the user means from their message (TikTok, Instagram, Facebook, YouTube, X/Twitter, LinkedIn, Pinterest, Threads).',
    '- If the user names Instagram, you MUST call get_analytics_summary or get_analytics_report_snapshot with platform "Instagram". Never substitute another platform.',
    '- When they ask generally ("my analytics", "all platforms", "summarize everything"), call get_analytics_all_accounts.',
    '- For "last 30 days" pass days: 30. Default to 30 days when no range is given.',
    '- When they ask for a graph, chart, report, or snapshot, call get_analytics_report_snapshot (includes chart data shown in chat).',
    '- Never ask the user to select an account or platform from a dropdown. You already know all connected accounts.',
    '- Quote only numbers returned by dashboard analytics tools. Do not invent metrics.',
    '',
    'Capabilities (use tools):',
    '- show_app_in_chat: open ANY app screen inline (dashboard, console, inbox, composer, calendar, automation, reports, smart links, AI Assistant brand context, accounts, post history) with previews + link.',
    'App screens available:',
    formatAppSurfaceCatalog(),
    '- Pull dashboard analytics and render report snapshots with charts.',
    '- Check comment counts; ask before listing full comment text.',
    '- Offer keyword automations; confirm before saving.',
    '- Draft captions and open Composer for images, videos, carousels, or reels.',
    '',
    'Attachments:',
    '- Users can attach images, videos, and files. You can see image content directly.',
    '- For videos and documents, use the filename and user message to help (caption ideas, content review, scheduling).',
    '- Suggest opening Composer when they want to publish attached media.',
    '',
    'When the user asks to see, open, or show anything in the app, call show_app_in_chat with the matching view. Combine with get_analytics_report_snapshot for platform-specific charts on dashboard/console.',
    '',
    'Conversation style:',
    '- Be concise, friendly, and proactive.',
    '- Example: if latest post has 10 comments, say "Your latest post has 10 comments. Want me to show them?" and wait.',
    '- Do not invent metrics or comments; always use tools for live data.',
    'Plain text only in replies (no markdown bold). No em dashes.',
  ].join('\n');
}

export async function runAysopChat(args: {
  messages: AysopChatInputMessage[];
  ctx: AysopToolContext;
}): Promise<{ reply: string; artifacts: AysopArtifact[] }> {
  const [accounts, userRow] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId: args.ctx.userId },
      select: { id: true, platform: true, username: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findUnique({
      where: { id: args.ctx.userId },
      select: { brandContext: true },
    }),
  ]);

  const brandBlock = formatBrandContextForPrompt(userRow?.brandContext ?? null);

  const thread: OpenAIChatMessageWithTools[] = [
    { role: 'system', content: buildSystemPrompt(formatAccountCatalog(accounts), brandBlock) },
    ...args.messages.map((m) => {
      if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content };
      const content = buildOpenAiUserContent(m);
      return { role: 'user' as const, content };
    }),
  ];

  const artifacts: AysopArtifact[] = [];
  const visionModel =
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_CHAT_VISION_MODEL?.trim() ||
    'gpt-4.1-mini';
  const chatOptions = threadHasImages(args.messages)
    ? { max_tokens: 900, model: visionModel }
    : { max_tokens: 900 };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await openAiChatWithTools(thread, AYSOP_TOOL_DEFINITIONS, chatOptions);
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
