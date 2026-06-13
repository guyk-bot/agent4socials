import { BRAND_NAME } from '@/lib/site-brand-assets';
import type { AysopChatInputMessage } from '@/lib/ai/aysop-openai-messages';
import { findLatestMediaUserMessage } from '@/lib/ai/aysop-openai-messages';
import { isAysopQuickReplyMessage } from '@/lib/ai/aysop-quick-replies';
import { runAysopTool, type AysopArtifact, type AysopToolContext } from '@/lib/ai/aysop-tools';
import { platformLabel } from '@/lib/composer/platform-capabilities';
import { accountsFromWorkspaces } from '@/lib/ai/aysop-workspace-snapshot';
import { prisma } from '@/lib/db';

const DATA_INTENT =
  /\b(analytics|followers?|comments?|inbox|leads?|posts?|schedule|scheduled|connect|report|chart|graph|scan|reply|replies|draft|caption|publish|instagram|tiktok|facebook|youtube|threads|linkedin|pinterest|twitter|brand context|team|brainstorm|support|metrics?|engagement|views?|likes?)\b/i;

const CASUAL_GREETING =
  /^(hi|hello|hey|howdy|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|nice|got it|sounds good|bye|goodbye)\b[!.,?\s]*$/i;

const CAPABILITY_QUESTION = /^(what can you (do|help with)|help me|who are you)\??$/i;

/** Skip tool schemas + heavy prompt for obvious chit-chat (saves latency and tokens). */
export function isCasualAysopChatMessage(messages: AysopChatInputMessage[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return false;
  if (last.attachments?.length) return false;

  const text = last.content.trim();
  if (!text || text.length > 140) return false;
  if (DATA_INTENT.test(text)) return false;

  return CASUAL_GREETING.test(text) || CAPABILITY_QUESTION.test(text);
}

export function buildCasualAysopSystemPrompt(): string {
  return [
    `You are ${BRAND_NAME} AI inside the ${BRAND_NAME} dashboard.`,
    'Reply in one or two short sentences. Plain text only, no markdown.',
    'You help with connecting accounts, posts, scheduling, inbox replies, analytics, brand context, and leads.',
    'If they need live numbers or inbox data, tell them to ask specifically (e.g. "show my Instagram analytics" or "Threads replies this week").',
    'No em dashes.',
  ].join('\n');
}

export function instantCasualAysopReply(messages: AysopChatInputMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content.trim() ?? '';
  if (CASUAL_GREETING.test(text)) {
    return `Hi! I'm ${BRAND_NAME} AI. Ask about analytics, inbox, posts, or leads and I'll pull live data from your workspace.`;
  }
  if (CAPABILITY_QUESTION.test(text)) {
    return `I'm ${BRAND_NAME} AI. I can connect platforms, draft posts, show inbox comments, run analytics, manage brand context, and save leads. What do you want to do first?`;
  }
  return null;
}

export function userResolvedMediaBrandChoice(messages: AysopChatInputMessage[]): boolean {
  return messages.some((m) => m.role === 'user' && isAysopQuickReplyMessage(m.content));
}

function inferPlatformFromThread(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): string | null {
  const blob = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');
  if (/\bthreads?\b/i.test(blob)) return 'THREADS';
  if (/\binstagram|\binsta\b|\big\b/i.test(blob)) return 'INSTAGRAM';
  if (/\btiktok\b/i.test(blob)) return 'TIKTOK';
  if (/\bfacebook|\bfb\b/i.test(blob)) return 'FACEBOOK';
  if (/\byoutube\b/i.test(blob)) return 'YOUTUBE';
  if (/\btwitter|\bx\.com\b/i.test(blob)) return 'TWITTER';
  if (/\blinkedin\b/i.test(blob)) return 'LINKEDIN';
  if (/\bpinterest\b/i.test(blob)) return 'PINTEREST';

  const cached = accountsFromWorkspaces(ctx.workspaces);
  if (cached?.length === 1) return cached[0]!.platform;
  if (cached?.some((a) => a.platform === 'THREADS')) return 'THREADS';
  if (cached?.[0]?.platform) return cached[0].platform;
  return null;
}

async function resolvePlatformForDraft(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): Promise<string> {
  const inferred = inferPlatformFromThread(messages, ctx);
  if (inferred) return inferred;

  const acc = await prisma.socialAccount.findFirst({
    where: { userId: ctx.userId },
    select: { platform: true },
    orderBy: { createdAt: 'asc' },
  });
  if (acc?.platform) return acc.platform;
  throw new Error('Connect a platform first, then try again.');
}

function draftCaptionFromThread(messages: AysopChatInputMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    const text = m.content.trim();
    if (!text || isAysopQuickReplyMessage(text)) continue;
    return text;
  }
  return 'New post';
}

function replyFromArtifacts(artifacts: AysopArtifact[], fallback: string): string {
  const block = artifacts.find((a) => a.type === 'text_block');
  if (block && block.type === 'text_block' && block.body?.trim()) {
    return block.body.trim();
  }
  return fallback;
}

/** Skip the LLM for brand-context button taps and post creation from uploaded media. */
export async function tryMediaActionFastPath(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): Promise<{ reply: string; artifacts: AysopArtifact[] } | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  const text = lastUser.content.trim();

  if (text === 'Continue without brand context' || text === 'Continue without setup') {
    return {
      reply: 'Got it. Tell me what you want to post, or ask about analytics or inbox anytime.',
      artifacts: [],
    };
  }

  if (text === 'Set up brand context') {
    const hasConnectedAccounts = Boolean(
      accountsFromWorkspaces(ctx.workspaces)?.length ||
        (await prisma.socialAccount.count({ where: { userId: ctx.userId } }))
    );
    const out = await runAysopTool(
      'start_guided_brand_setup',
      { autoFillFromAccounts: hasConnectedAccounts },
      ctx
    );
    const hasCard = (out.artifacts ?? []).some((a) => a.type === 'brand_context_update');
    const sources = (out.result as { sources?: string[] })?.sources ?? [];
    const fallback = hasCard
      ? sources.length
        ? `I analyzed ${sources.join(', ')} and filled in a draft below. Review it in chat and tap Approve to save.`
        : 'Review your brand context below, fill in any blanks, and tap Approve to save.'
      : "Let's set up your brand context.";
    return {
      reply: replyFromArtifacts(out.artifacts ?? [], fallback),
      artifacts: out.artifacts ?? [],
    };
  }

  if (text === 'Just create this post') {
    const mediaMsg = findLatestMediaUserMessage(messages);
    const attachments = mediaMsg?.attachments?.filter((a) => a.kind === 'image' || a.kind === 'video') ?? [];
    if (!attachments.length) {
      return {
        reply: 'Attach an image or video first, then tap Just create this post again.',
        artifacts: [],
      };
    }

    const platform = await resolvePlatformForDraft(messages, ctx);
    const caption = draftCaptionFromThread(messages);
    const postType = attachments.some((a) => a.kind === 'video') ? 'video' : 'photo';
    const mediaUrls = attachments.map((a) => a.fileUrl);

    const out = await runAysopTool(
      'prepare_platform_post_drafts',
      {
        drafts: [{ platform, caption, postType, mediaUrls }],
      },
      ctx
    );

    const label = platformLabel(platform);
    return {
      reply: replyFromArtifacts(
        out.artifacts ?? [],
        `Here is your ${label} draft. Review it below and tap Allow to publish or schedule.`
      ),
      artifacts: out.artifacts ?? [],
    };
  }

  return null;
}
