import { BRAND_NAME } from '@/lib/site-brand-assets';
import {
  openAiChatWithTools,
  openAiChat,
  type OpenAIChatMessageWithTools,
} from '@/lib/openai-client';
import {
  IZOP_TOOL_DEFINITIONS,
  runIzopTool,
  type IzopArtifact,
  type IzopToolContext,
} from '@/lib/ai/izop-tools';
import { prisma } from '@/lib/db';
import { formatBrandContextForPrompt } from '@/lib/ai/brand-context-prompt';
import { shouldShowBrandContextOnboarding } from '@/lib/ai/brand-context-onboarding';
import { formatAppSurfaceCatalog } from '@/lib/ai/izop-artifacts';
import {
  buildOpenAiUserContent,
  lastUserMessageHasImages,
  threadHasImages,
  type IzopChatInputMessage,
} from '@/lib/ai/izop-openai-messages';
import { postingCapabilitiesPromptBlock } from '@/lib/composer/platform-capabilities';
import { appLinkRulesForPrompt } from '@/lib/app-base-url';
import { getIzopOpenRouterApiKey, toOpenRouterModel } from '@/lib/ai/llm-config';
import type {
  IzopActiveBrandSnapshot,
  IzopWorkspaceSnapshot,
} from '@/lib/ai/izop-workspace-snapshot';
import {
  accountsFromWorkspaces,
  summarizeWorkspaceAccounts,
} from '@/lib/ai/izop-workspace-snapshot';
import {
  buildCasualIzopSystemPrompt,
  instantCasualIzopReply,
  isCasualIzopChatMessage,
  tryMediaActionFastPath,
  tryMediaBrandSetupFastPath,
  tryTextOnlyPostFastPath,
  userResolvedMediaBrandChoice,
} from '@/lib/ai/izop-chat-fast-path';
import { MEDIA_BRAND_SETUP_REPLY, BRAND_CONTEXT_SETUP_READY_REPLY } from '@/lib/ai/izop-media-brand-prompt';

export type { IzopChatInputMessage };

const MAX_TOOL_ROUNDS = 6;
const MIN_MS_BEFORE_LLM = 8_000;

function timeLeftMs(deadlineMs: number): number {
  return deadlineMs - Date.now();
}

function tryArtifactOnlyReply(artifacts: IzopArtifact[], toolNames: string[]): string | null {
  if (toolNames.length !== 1) return null;
  const only = toolNames[0];
  if (only === 'list_recent_inbox') {
    const feed = artifacts.find((a) => a.type === 'inbox_feed');
    if (!feed || feed.type !== 'inbox_feed') return null;
    const n = feed.items.length;
    if (n === 0) {
      return 'No matching comments in your inbox cache yet. Open Inbox once to sync, then ask again.';
    }
    const label = feed.title?.toLowerCase() ?? 'inbox items';
    return `Here ${n === 1 ? 'is' : 'are'} ${n} ${label}${n === 1 ? '' : 's'} below.`;
  }
  if (only === 'collect_contextual_brand_info') {
    return MEDIA_BRAND_SETUP_REPLY;
  }
  if (only === 'start_guided_brand_setup') {
    const card = artifacts.find((a) => a.type === 'brand_context_update');
    if (card && card.type === 'brand_context_update') {
      return BRAND_CONTEXT_SETUP_READY_REPLY;
    }
    return null;
  }
  if (only === 'prepare_platform_post_drafts') {
    return '';
  }
  if (only === 'add_inbox_comments_to_leads') {
    const card = artifacts.find((a) => a.type === 'leads');
    if (!card || card.type !== 'leads') {
      return 'No new comments were added to Leads. They may already be saved, or Inbox needs a sync first.';
    }
    const low = card.leads.filter((l) => l.intent === 'low').length;
    return `Updated your Leads list (${card.leads.length} total${low ? `, ${low} low intent` : ''}). See the card below to download CSV or open Leads.`;
  }
  return null;
}

async function finalizeReplyFromToolData(
  thread: OpenAIChatMessageWithTools[],
  chatOptions: { max_tokens?: number; model?: string; providerScope?: 'default' | 'izop' }
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
    { ...chatOptions, max_tokens: 400 }
  );
  return content.trim() || 'Here is what I found from your workspace so far.';
}

function formatWorkspaceCatalog(
  workspaces: IzopWorkspaceSnapshot[] | undefined,
  activeBrand: IzopActiveBrandSnapshot
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
  workspaceCatalog: string,
  hasConnectedAccounts: boolean = false,
  needsBrandContextOnboarding: boolean = false,
  hasMediaAttachments: boolean = false,
  resolvedMediaBrandChoice: boolean = false
): string {
  let brandContextSection = brandContextBlock;
  
  if (!brandContextBlock) {
    if (needsBrandContextOnboarding && hasMediaAttachments && !resolvedMediaBrandChoice) {
      brandContextSection = `Brand context: not set up yet. User uploaded media to post. Call collect_contextual_brand_info once (buttons only). Reply with exactly: "Image received. I suggest setting up brand context so I can come up with the best content for you. I can create your brand context by scanning your connected accounts. Choose one of the options below." Do not ask for topic, audience, or tone. ${hasConnectedAccounts ? 'Buttons: Set up brand context (scans connected accounts) or Just create this post.' : ''}`;
    } else if (needsBrandContextOnboarding && hasMediaAttachments && resolvedMediaBrandChoice) {
      brandContextSection = 'Brand context: not set up yet. User already chose an action from the media upload buttons. Do NOT call collect_contextual_brand_info again. If they chose to create the post, call prepare_platform_post_drafts with mediaUrls from the thread and an AI-generated caption (never open_composer_draft unless they ask for the full Composer editor).';
    } else if (needsBrandContextOnboarding) {
      brandContextSection = `Brand context: not set up yet. IMPORTANT: Proactively recommend brand context setup using show_brand_context_onboarding when the user first starts chatting or asks about content creation. ${hasConnectedAccounts ? 'This user has connected accounts, so offer automatic setup assistance.' : 'Guide them through manual setup questions.'}`;
    } else {
      brandContextSection = 'Brand context: not set yet. If the user asks about their brand voice or product, suggest they fill in AI Assistant under Brand context.';
    }
  }

  return [
    `You are ${BRAND_NAME} AI. Execute tasks instantly. One sentence responses.`,
    workspaceCatalog,
    '',
    accountCatalog,
    '',
    brandContextSection,
    '',
    'INSTANT ACTIONS (do immediately):',
    '- Connect → list_connect_platforms (buttons appear)',
    '- Analytics → get_analytics_report_snapshot (charts appear)',
    '- Inbox → list_recent_inbox (reply buttons appear)',
    '- Post → prepare_platform_post_drafts with mediaUrls (platform preview cards, not Composer embed). Reply with empty text; caption lives only in the preview card.',
    '- Text-only post (Threads, Twitter/X, Facebook, LinkedIn): if only one platform is connected, use it automatically. Do not ask which platform or ask for a caption. Write a ready-to-publish caption from brand context and call prepare_platform_post_drafts with postType text immediately.',
    '- Never use placeholder captions like "Your text-only thread post here". Write real copy the user can publish.',
    '- Do NOT call list_connect_platforms or list_connected_accounts when the user asks to post or upload to a platform they already connected.',
    '- Leads → get_saved_leads or scan_leads',
    '- Clear brand context → clear_brand_context (only when user asks to delete/remove/clear all brand context)',
    '- Save commenters → add_inbox_comments_to_leads',
    '- Help → show_support_options',
    '',
    'SMART ROUTING:',
    '- Platform mentioned → use exact platform (Instagram = "Instagram")',
    '- General request → get_analytics_all_accounts',
    '- Comments/inbox → get_inbox_comment_summary then list_recent_inbox',
    '- Brands/workspaces → list_brand_workspaces',
    '- Charts/graphs → get_analytics_report_snapshot',
    '',
    'BRAND SETUP (streamlined):',
    '- New users → show_brand_context_onboarding (instant buttons)',
    '- "Set up" / start_guided_brand_setup → reply exactly: "The brand context setup has been implemented and out of field, based on your connected account. Would you like to proceed with posting or make further adjustment?"',
    '- Media upload to post → collect_contextual_brand_info (setup buttons, no topic/audience/tone questions)',
    '- "Just create this post" / "Let\'s upload" → prepare_platform_post_drafts with mediaUrls + generated caption (preview card)',
    '- Brand changes → propose_brand_context_update (surgical edits only)',
    '',
    'QUICK BUTTONS:',
    '- When mentioning options → show_quick_actions with relevant actions',
    '- Available: Show Analytics, Check Inbox, Create Post, Connect Platform, Find Leads, Get Support',
    '',
    'QUICK FIXES:',
    '- Leads → get_saved_leads first, scan_leads if requested',
    '- Support → show_support_options if stuck',
    '- Team → open_workspace_page with page team',
    '- Ideas → open_workspace_page with page brainstorm',
    '',
    appLinkRulesForPrompt(),
    '',
    postingCapabilitiesPromptBlock(),
    '',
    'MEDIA HANDLING:',
    '- Media attached + post intent → prepare_platform_post_drafts with every mediaUrls from chat (shows platform post preview with caption and media)',
    '- open_composer_draft only when user explicitly asks for Composer / full editor',
    '- Never ask user to re-upload media already in the thread',
    '- No markdown. Plain text only. Use real numbers only.',
    '',
    'Scope (critical):',
    `- You only help with ${BRAND_NAME}: connecting and managing social accounts, creating/scheduling/publishing posts, captions and content ideas (Brainstorm), inbox comments and replies, analytics and reports, brand context, leads from comments, team members, and support.`,
    `- If the user asks for something unrelated (general coding, world facts, math homework, medical/legal advice, recipes, etc.), politely decline in one sentence: "Unfortunately ${BRAND_NAME} is designed to help with your social media: connecting accounts, posting and scheduling, captions and content ideas, inbox replies, analytics, brand context, leads, and support." Then offer a relevant ${BRAND_NAME} action. Do not attempt to answer the unrelated question.`,
  ].join('\n');
}

export async function runIzopChat(args: {
  messages: IzopChatInputMessage[];
  ctx: IzopToolContext;
  contextOmittedCount?: number;
  deadlineMs?: number;
}): Promise<{ reply: string; artifacts: IzopArtifact[] }> {
  const deadlineMs = args.deadlineMs ?? Date.now() + 110_000;

  const instantReply = instantCasualIzopReply(args.messages);
  if (instantReply) {
    return { reply: instantReply, artifacts: [] };
  }

  const textOnlyFast = await tryTextOnlyPostFastPath(args.messages, args.ctx);
  if (textOnlyFast) {
    return textOnlyFast;
  }

  const mediaFast = await tryMediaActionFastPath(args.messages, args.ctx);
  if (mediaFast) {
    return mediaFast;
  }

  const mediaBrandSetup = await tryMediaBrandSetupFastPath(args.messages, args.ctx);
  if (mediaBrandSetup) {
    return mediaBrandSetup;
  }

  const cachedAccounts = accountsFromWorkspaces(args.ctx.workspaces);
  const [accounts, userRow] = await Promise.all([
    cachedAccounts ??
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
  const hasConnectedAccounts = accounts.length > 0;
  const needsBrandContextOnboarding = shouldShowBrandContextOnboarding(userRow?.brandContext as any);
  const hasMediaAttachments = threadHasImages(args.messages) ||
    args.messages.some(m => m.attachments?.some(a => a.kind === 'video'));
  const resolvedMediaBrandChoice = userResolvedMediaBrandChoice(args.messages);
  
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
          formatWorkspaceCatalog(args.ctx.workspaces, args.ctx.activeBrand ?? null),
          hasConnectedAccounts,
          needsBrandContextOnboarding,
          hasMediaAttachments,
          resolvedMediaBrandChoice
        ) + contextNote,
    },
    ...args.messages.map((m) => {
      if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content };
      const content = buildOpenAiUserContent(m);
      return { role: 'user' as const, content };
    }),
  ];

  const artifacts: IzopArtifact[] = [];
  const visionModelRaw =
    process.env.IZOP_AI_VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_CHAT_VISION_MODEL?.trim() ||
    'gpt-4.1-mini';
  const visionModel = getIzopOpenRouterApiKey() ? toOpenRouterModel(visionModelRaw) : visionModelRaw;
  const chatOptions = lastUserMessageHasImages(args.messages)
    ? { max_tokens: 550, model: visionModel, providerScope: 'izop' as const }
    : { max_tokens: 480, providerScope: 'izop' as const };

  if (isCasualIzopChatMessage(args.messages)) {
    const casualThread = [
      { role: 'system' as const, content: buildCasualIzopSystemPrompt() },
      ...args.messages.map((m) => {
        if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content };
        const content = buildOpenAiUserContent(m);
        const text =
          typeof content === 'string'
            ? content
            : content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('\n');
        return { role: 'user' as const, content: text };
      }),
    ];
    const { content } = await openAiChat(casualThread, { ...chatOptions, max_tokens: 220 });
    return {
      reply: content.trim() || instantCasualIzopReply(args.messages) || 'How can I help with your social accounts?',
      artifacts: [],
    };
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (timeLeftMs(deadlineMs) < MIN_MS_BEFORE_LLM) {
      if (thread.some((m) => m.role === 'tool')) {
        const reply = await finalizeReplyFromToolData(thread, chatOptions);
        return { reply, artifacts };
      }
      throw new Error('Chat request timed out. Try a simpler question.');
    }

    const res = await openAiChatWithTools(thread, IZOP_TOOL_DEFINITIONS, chatOptions);
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

    const toolRuns = await Promise.all(
      assistantMsg.tool_calls.map(async (call) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        try {
          const out = await runIzopTool(call.function.name, parsed, args.ctx);
          return { call, toolResult: out.result, toolArtifacts: out.artifacts };
        } catch (e) {
          return { call, toolResult: { error: (e as Error).message }, toolArtifacts: undefined };
        }
      })
    );

    for (const run of toolRuns) {
      if (run.toolArtifacts?.length) artifacts.push(...run.toolArtifacts);
      thread.push({
        role: 'tool',
        tool_call_id: run.call.id,
        content: JSON.stringify(run.toolResult),
      });
    }

    const artifactReply = tryArtifactOnlyReply(
      artifacts,
      assistantMsg.tool_calls.map((c) => c.function.name)
    );
    if (artifactReply) {
      return { reply: artifactReply, artifacts };
    }
  }

  return {
    reply: 'I need another step to finish that. Try asking again with a bit more detail.',
    artifacts,
  };
}
