import { BRAND_NAME } from '@/lib/site-brand-assets';
import {
  openAiChatWithTools,
  openAiChat,
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
import { postingCapabilitiesPromptBlock } from '@/lib/composer/platform-capabilities';
import { appLinkRulesForPrompt } from '@/lib/app-base-url';
import { getAysopOpenRouterApiKey, toOpenRouterModel } from '@/lib/ai/llm-config';
import type {
  AysopActiveBrandSnapshot,
  AysopWorkspaceSnapshot,
} from '@/lib/ai/aysop-workspace-snapshot';
import { summarizeWorkspaceAccounts } from '@/lib/ai/aysop-workspace-snapshot';

export type { AysopChatInputMessage };

const MAX_TOOL_ROUNDS = 6;
const MIN_MS_BEFORE_LLM = 12_000;

function timeLeftMs(deadlineMs: number): number {
  return deadlineMs - Date.now();
}

async function finalizeReplyFromToolData(
  thread: OpenAIChatMessageWithTools[],
  chatOptions: { max_tokens?: number; model?: string; providerScope?: 'default' | 'aysop' }
): Promise<string> {
  const toolOutputs = thread
    .filter((m): m is { role: 'tool'; tool_call_id: string; content: string } => m.role === 'tool')
    .map((m) => m.content)
    .join('\n\n')
    .slice(0, 14_000);
  const lastUser = [...thread].reverse().find((m) => m.role === 'user');
  const userQ =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : 'Answer the user using the tool data below.';
  const { content } = await openAiChat(
    [
      {
        role: 'system',
        content:
          'Summarize the tool data for the user in plain text. No markdown. If they asked about lead interest, give a brief estimate from comment samples and label it as your opinion, not exact counts.',
      },
      {
        role: 'user',
        content: toolOutputs
          ? `${userQ}\n\nTool data (JSON):\n${toolOutputs}`
          : userQ,
      },
    ],
    { ...chatOptions, max_tokens: 700 }
  );
  return content.trim() || 'Here is what I found from your workspace so far.';
}

function formatWorkspaceCatalog(
  workspaces: AysopWorkspaceSnapshot[] | undefined,
  activeBrand: AysopActiveBrandSnapshot
): string {
  if (!workspaces?.length) {
    return 'Brand workspaces: call list_brand_workspaces when the user asks about brands.';
  }
  const lines = workspaces.map((w) => {
    const summary = summarizeWorkspaceAccounts(w);
    return `- ${w.name} (${w.connectedAccountCount} connected account${w.connectedAccountCount === 1 ? '' : 's'}: ${summary})`;
  });
  const activeLine = activeBrand
    ? `Active brand workspace (Console sidebar): ${activeBrand.name}`
    : 'Active brand workspace: unknown';
  return [`Brand workspaces (${workspaces.length} total):`, ...lines, activeLine].join('\n');
}

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

function buildSystemPrompt(
  accountCatalog: string,
  brandContextBlock: string | null,
  workspaceCatalog: string
): string {
  return [
    `You are ${BRAND_NAME} AI, the social media copilot inside the ${BRAND_NAME} dashboard.`,
    'You help creators manage all connected platforms from this chat: connect accounts, posts, scheduling, inbox replies, and analytics.',
    '',
    workspaceCatalog,
    '',
    accountCatalog,
    '',
    brandContextBlock ?? 'Brand context: not set yet. If the user asks about their brand voice or product, suggest they fill in AI Assistant under Brand context.',
    '',
    'Do everything in chat (critical):',
    '- The user should complete tasks here, not by navigating away. Interactive cards in chat have Connect, Reply, Approve & publish, and Schedule buttons.',
    '- Connect platforms: call list_connect_platforms (or list_connected_accounts). User taps Connect in chat.',
    '- Posts: call prepare_platform_post_drafts. User approves or schedules from preview cards. Never claim you published.',
    '- Inbox: call list_recent_inbox or fetch_post_comments. User replies inline with Reply in chat.',
    '- Only suggest opening Composer when media is required (Instagram, TikTok, YouTube, Pinterest) and no file is attached.',
    '- Use show_app_in_chat only when the user explicitly wants the full page UI, not as the default for setup tasks.',
    '',
    'Brand workspaces vs platforms (critical):',
    '- A brand workspace is a grouping on Account > Brands (e.g. iZop, Guy kogen). Users may have multiple brand workspaces.',
    '- A platform is Instagram, TikTok, Facebook, etc. Multiple platform accounts can sit under one brand workspace.',
    '- When the user asks about brands, workspaces, or "how many brands", call list_brand_workspaces. Do NOT call get_analytics_all_accounts for that.',
    '- Answer using workspace names from list_brand_workspaces. Mention connected @handles under each workspace (e.g. Agent4Socials on Facebook).',
    '- The active brand workspace is the one shown in the Console sidebar; prefer it when they say "my brand" or "currently connected".',
    '',
    'Platform routing (critical):',
    '- Infer which platform the user means from their message (TikTok, Instagram, Facebook, YouTube, X/Twitter, LinkedIn, Pinterest, Threads).',
    '- If the user names Instagram, you MUST call get_analytics_summary or get_analytics_report_snapshot with platform "Instagram". Never substitute another platform.',
    '- When they ask generally ("my analytics", "all platforms", "summarize everything"), call get_analytics_all_accounts.',
    '- When they ask how many comments or inbox activity in a date range, call get_inbox_comment_summary. Use list_recent_inbox when they want to reply to specific comments.',
    '- When they ask about leads, potential customers, or interested commenters, call get_saved_leads first (not get_inbox_comment_summary).',
    '- For "last week" or "past 7 days" pass days: 7. For "last 30 days" pass days: 30. Default to 30 days when no range is given.',
    '- When they ask for a graph, chart, report, or snapshot, call get_analytics_report_snapshot (includes chart data shown in chat).',
    '- Never ask the user to select an account or platform from a dropdown. You already know all connected accounts.',
    '- Quote only numbers returned by dashboard analytics tools. Do not invent metrics.',
    '',
    'Capabilities (use tools):',
    '- list_connect_platforms / list_connected_accounts: Connect buttons in chat.',
    '- get_inbox_comment_summary: comment counts and samples for a date range (use before analytics for comment volume questions).',
    '- list_recent_inbox / fetch_post_comments: inbox with Reply in chat.',
    '- prepare_platform_post_drafts: preview cards with Approve & publish and Schedule.',
    '- open_composer_draft: pre-filled Composer when user asks (media platforms).',
    '- get_brand_context / propose_brand_context_update: review and edit brand context in chat.',
    '- get_saved_leads: show the last lead scan (same as Leads page). Call first for lead counts or "show my leads".',
    '- scan_leads: run a fresh lead scan when saved results are empty or user asks to rescan.',
    '- show_support_options: feedback, ticket, and Zoom booking buttons in chat.',
    '- open_workspace_page: open Brand, Leads, Team members, Support, or Brainstorm as a card.',
    '- show_app_in_chat: preview only when user explicitly wants a full app page.',
    '',
    'Brand context (critical):',
    '- Whenever the user describes a new or changed product, service, target audience, tone, or other brand info (e.g. "I just launched a product that does X", "my audience is now Y", "make my tone more casual"), call propose_brand_context_update with only the fields that change. This shows an editable Approve card. Do NOT say the brand context was updated until they approve; the card handles saving.',
    '- Make surgical edits: only pass the ONE field the user asked about (product change → productDescription only). Copy existing text verbatim; delete or add only the specific sentence or bullet they mentioned. Never pass targetAudience or toneOfVoice unless they explicitly mention audience or tone.',
    '- When they ask what their brand context is or to review it, call get_brand_context.',
    '- When they ask to open the Brand page, call open_workspace_page with page brand.',
    '',
    'Leads (critical):',
    '- When the user asks how many leads, who the leads are, or to show leads again, call get_saved_leads first (matches their Leads page scan). If empty, call scan_leads. Do not use fetch_post_comments or list_recent_inbox for lead questions.',
    '- If they say yes to seeing leads or agree after a lead question, call get_saved_leads or scan_leads, not inbox comment fetch tools.',
    '- scan_leads only when they want a fresh scan or get_saved_leads returned nothing. Summarize count and high-intent from tool output only. Do not invent leads.',
    '',
    'Support and troubleshooting (critical):',
    '- When the user reports an error or is stuck (e.g. connecting Instagram fails), first ask what the exact message is or what happened and try to help fix it with the steps and tools you have.',
    '- If you cannot resolve it, call show_support_options so they can send feedback, open a ticket, or schedule a Zoom call from chat. Also call it when they ask for help/support/contact.',
    '',
    'Team members:',
    '- When the user asks about their team, members, roles, permissions, or who did what, call open_workspace_page with page team.',
    '',
    'Brainstorm:',
    '- When the user wants to brainstorm, capture content ideas, or open the ideas board, call open_workspace_page with page brainstorm.',
    '',
    appLinkRulesForPrompt(),
    '',
    postingCapabilitiesPromptBlock(),
    '',
    'Attachments:',
    '- Users can attach images, videos, and files. You can see image content directly.',
    '- For videos and documents, use the filename and user message to help (caption ideas, content review, scheduling).',
    '- When the user attaches a video and asks to upload or post (e.g. Instagram), reply with next steps and call open_composer_draft or prepare_platform_post_drafts with postType video and a caption suggestion. Mention the attached file URL from the message.',
    '- Suggest opening Composer when they want to publish attached media.',
    '',
    'When the user asks to set up, connect, post, schedule, or reply, use the actionable tools above so they can finish in chat.',
    'App screens (show_app_in_chat only on explicit request):',
    formatAppSurfaceCatalog(),
    '- Pull dashboard analytics with get_analytics_report_snapshot (charts in chat).',
    '- get_posting_capabilities before multi-platform caption variations without media.',
    '- Instagram, TikTok, YouTube, Pinterest need media: use Composer drafts only when the user asks.',
    '',
    'Conversation style:',
    '- Be concise, friendly, and proactive.',
    '- Example: if latest post has 10 comments, say "Your latest post has 10 comments. Want me to show them?" and wait.',
    '- Do not invent metrics or comments; always use tools for live data.',
    'Plain text only in replies (no markdown bold, no markdown images). URLs you share are auto-linked in chat.',
    'For post previews or images, call get_recent_posts so the UI shows thumbnails. Do not use ![image](url) markdown.',
    'No em dashes.',
    '',
    'Scope (critical):',
    `- You only help with ${BRAND_NAME}: connecting and managing social accounts, creating/scheduling/publishing posts, captions and content ideas (Brainstorm), inbox comments and replies, analytics and reports, brand context, leads from comments, team members, and support.`,
    `- If the user asks for something unrelated (general coding, world facts, math homework, medical/legal advice, recipes, etc.), politely decline in one sentence: "Unfortunately ${BRAND_NAME} is designed to help with your social media: connecting accounts, posting and scheduling, captions and content ideas, inbox replies, analytics, brand context, leads, and support." Then offer a relevant ${BRAND_NAME} action. Do not attempt to answer the unrelated question.`,
  ].join('\n');
}

export async function runAysopChat(args: {
  messages: AysopChatInputMessage[];
  ctx: AysopToolContext;
  contextOmittedCount?: number;
  deadlineMs?: number;
}): Promise<{ reply: string; artifacts: AysopArtifact[] }> {
  const deadlineMs = args.deadlineMs ?? Date.now() + 110_000;
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
  const contextNote =
    (args.contextOmittedCount ?? 0) > 0
      ? `\nNote: ${args.contextOmittedCount} older messages from this chat are not in context. Use tools for fresh analytics or posts; the user still sees full history in the UI.`
      : '';

  const thread: OpenAIChatMessageWithTools[] = [
    {
      role: 'system',
      content:
        buildSystemPrompt(
          formatAccountCatalog(accounts),
          brandBlock,
          formatWorkspaceCatalog(args.ctx.workspaces, args.ctx.activeBrand ?? null)
        ) + contextNote,
    },
    ...args.messages.map((m) => {
      if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content };
      const content = buildOpenAiUserContent(m);
      return { role: 'user' as const, content };
    }),
  ];

  const artifacts: AysopArtifact[] = [];
  const visionModelRaw =
    process.env.IZOP_AI_VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_CHAT_VISION_MODEL?.trim() ||
    'gpt-4.1-mini';
  const visionModel = getAysopOpenRouterApiKey() ? toOpenRouterModel(visionModelRaw) : visionModelRaw;
  const chatOptions = threadHasImages(args.messages)
    ? { max_tokens: 900, model: visionModel, providerScope: 'aysop' as const }
    : { max_tokens: 900, providerScope: 'aysop' as const };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (timeLeftMs(deadlineMs) < MIN_MS_BEFORE_LLM) {
      if (thread.some((m) => m.role === 'tool')) {
        const reply = await finalizeReplyFromToolData(thread, chatOptions);
        return { reply, artifacts };
      }
      throw new Error('Chat request timed out. Try a simpler question.');
    }

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
