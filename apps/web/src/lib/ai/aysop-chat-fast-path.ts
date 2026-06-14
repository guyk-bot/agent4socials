import { BRAND_NAME } from '@/lib/site-brand-assets';
import type { AysopChatInputMessage } from '@/lib/ai/aysop-openai-messages';
import { findLatestMediaUserMessage } from '@/lib/ai/aysop-openai-messages';
import { isAysopQuickReplyMessage } from '@/lib/ai/aysop-quick-replies';
import { runAysopTool, type AysopArtifact, type AysopToolContext } from '@/lib/ai/aysop-tools';
import { platformLabel } from '@/lib/composer/platform-capabilities';
import { accountsFromWorkspaces } from '@/lib/ai/aysop-workspace-snapshot';
import { prisma } from '@/lib/db';
import {
  MEDIA_BRAND_SETUP_REPLY,
  BRAND_CONTEXT_SETUP_READY_REPLY,
  userWantsToPostFromMessage,
} from '@/lib/ai/aysop-media-brand-prompt';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { generatePostCaptionForUser } from '@/lib/ai/generate-post-caption';
import { shouldShowBrandContextOnboarding } from '@/lib/ai/brand-context-onboarding';

const UPLOAD_POST_INTENT =
  /^let'?s\s+(just\s+)?upload(\s+the\s+post|\s+it)?$/i;

const SKIP_CAPTION_TEXT =
  /^(set up brand context|just create this post|let'?s upload(\s+(just\s+)?the\s+post)?|continue without( brand context| setup)?|new post)$/i;

const SKIP_POST_INTENT_TEXT =
  /^(delete|remove|erase|clear|wipe)\b[\s\S]{0,80}\b(all\s+)?(the\s+)?brand\s+context\b|\bbrand\s+context\b[\s\S]{0,80}\b(delete|remove|erase|clear|wipe)\b|^(set up brand context|just create this post|let'?s upload|continue without)/i;

const DATA_INTENT =
  /\b(analytics|followers?|comments?|inbox|leads?|posts?|schedule|scheduled|connect|report|chart|graph|scan|reply|replies|draft|caption|publish|instagram|tiktok|facebook|youtube|threads|linkedin|pinterest|twitter|brand context|team|brainstorm|support|metrics?|engagement|views?|likes?)\b/i;

const CLEAR_BRAND_CONTEXT_INTENT =
  /\b(delete|remove|erase|clear|wipe)\b[\s\S]{0,80}\b(all\s+)?(the\s+)?brand\s+context\b|\bbrand\s+context\b[\s\S]{0,80}\b(delete|remove|erase|clear|wipe)\b/i;

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
    `You are ${BRAND_NAME} AI. Execute instantly. One sentence max.`,
    'Available: connect accounts, create posts, check analytics, reply to comments, find leads.',
    'Ask for specific platform if needed (e.g. "Instagram analytics" or "TikTok comments").',
  ].join('\n');
}

export function instantCasualAysopReply(messages: AysopChatInputMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content.trim() ?? '';
  if (CASUAL_GREETING.test(text)) {
    return `Hi! What would you like to do?`;
  }
  if (CAPABILITY_QUESTION.test(text)) {
    return `I can connect platforms, create posts, show analytics, check inbox, and find leads.`;
  }
  // Single-word requests
  if (/^analytics?$/i.test(text)) return `Which platform analytics do you want to see?`;
  if (/^inbox$/i.test(text)) return `Checking your inbox...`;
  if (/^post$/i.test(text)) return `Ready to create a post. Upload media or describe what you want to post.`;
  if (/^connect$/i.test(text)) return `Let me show you available platforms to connect.`;
  if (/^leads?$/i.test(text)) return `Checking your saved leads...`;
  
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

function postIntentFromThread(messages: AysopChatInputMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = m.content.trim();
    if (!text || isAysopQuickReplyMessage(text) || SKIP_CAPTION_TEXT.test(text)) continue;
    if (CLEAR_BRAND_CONTEXT_INTENT.test(text) || SKIP_POST_INTENT_TEXT.test(text)) continue;
    parts.push(text);
  }
  return parts.join('\n').slice(0, 2000);
}

async function resolveCaptionForUpload(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext,
  platform: string,
  attachments: Array<{ kind: string; fileUrl?: string }>
): Promise<string> {
  const imageUrl = attachments.find((a) => a.kind === 'image')?.fileUrl ?? null;
  const videoUrl = attachments.find((a) => a.kind === 'video')?.fileUrl ?? null;

  try {
    return await generatePostCaptionForUser(ctx.userId, {
      platform,
      userIntent: postIntentFromThread(messages),
      hasImage: attachments.some((a) => a.kind === 'image'),
      hasVideo: attachments.some((a) => a.kind === 'video'),
      imageUrl,
      videoUrl,
      brandContextOverride: ctx.brandContextSnapshot ?? null,
    });
  } catch {
    return 'Here is something new for you. Let us know what you think.';
  }
}

async function createPostPreviewFromThread(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): Promise<{ reply: string; artifacts: AysopArtifact[] } | null> {
  const mediaMsg = findLatestMediaUserMessage(messages);
  const attachments = mediaMsg?.attachments?.filter((a) => a.kind === 'image' || a.kind === 'video') ?? [];
  if (!attachments.length) {
    return {
      reply: 'Attach an image or video first, then try again.',
      artifacts: [],
    };
  }

  const platform = await resolvePlatformForDraft(messages, ctx);
  const caption = await resolveCaptionForUpload(messages, ctx, platform, attachments);
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
      `Here is your ${label} post preview. Review the caption and media, then tap Allow to publish or schedule.`
    ),
    artifacts: out.artifacts ?? [],
  };
}

function replyFromArtifacts(artifacts: AysopArtifact[], fallback: string): string {
  const block = artifacts.find((a) => a.type === 'text_block');
  if (block && block.type === 'text_block' && block.body?.trim()) {
    return block.body.trim();
  }
  return fallback;
}

/** Enhanced greeting with quick actions */
async function createGreetingWithActions(ctx: AysopToolContext): Promise<{ reply: string; artifacts: AysopArtifact[] }> {
  const { artifacts } = await runAysopTool('show_quick_actions', { 
    actions: ['Show Analytics', 'Check Inbox', 'Create Post', 'Connect Platform'] 
  }, ctx);
  return {
    reply: 'Hi! What would you like to do?',
    artifacts: artifacts ?? [],
  };
}

/** Fast path: media + post intent without brand context → setup buttons, no LLM wait. */
export async function tryMediaBrandSetupFastPath(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): Promise<{ reply: string; artifacts: AysopArtifact[] } | null> {
  if (userResolvedMediaBrandChoice(messages)) return null;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;

  const hasMedia = Boolean(
    lastUser.attachments?.some((a) => a.kind === 'image' || a.kind === 'video')
  );
  if (!hasMedia) return null;

  const userRow = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { brandContext: true },
  });
  if (!shouldShowBrandContextOnboarding(userRow?.brandContext as BrandContextRecord | null)) {
    return null;
  }

  if (!userWantsToPostFromMessage(lastUser.content, hasMedia)) return null;

  const mediaType = lastUser.attachments?.some((a) => a.kind === 'video') ? 'video' : 'image';
  const out = await runAysopTool('collect_contextual_brand_info', { mediaType }, ctx);
  return {
    reply: MEDIA_BRAND_SETUP_REPLY,
    artifacts: out.artifacts ?? [],
  };
}

/** Skip the LLM for brand-context button taps and post creation from uploaded media. */
export async function tryMediaActionFastPath(
  messages: AysopChatInputMessage[],
  ctx: AysopToolContext
): Promise<{ reply: string; artifacts: AysopArtifact[] } | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  const text = lastUser.content.trim();

  if (CLEAR_BRAND_CONTEXT_INTENT.test(text)) {
    const out = await runAysopTool('clear_brand_context', {}, ctx);
    return {
      reply: 'All brand context has been cleared.',
      artifacts: out.artifacts ?? [],
    };
  }

  // Enhanced greeting with action buttons
  if (/^(hi|hello|hey)([.,!]?\s*)*$/i.test(text)) {
    return await createGreetingWithActions(ctx);
  }

  if (text === 'Continue without brand context' || text === 'Continue without setup') {
    const { artifacts } = await runAysopTool('show_quick_actions', { actions: ['Show Analytics', 'Check Inbox', 'Create Post'] }, ctx);
    return {
      reply: 'Got it. What would you like to do?',
      artifacts: artifacts ?? [],
    };
  }

  if (text === 'Set up brand context') {
    const hasConnectedAccounts = Boolean(
      accountsFromWorkspaces(ctx.workspaces)?.length ||
        (await prisma.socialAccount.count({ where: { userId: ctx.userId } }))
    );
    const mediaMsg = findLatestMediaUserMessage(messages);
    const platform = inferPlatformFromThread(messages, ctx);
    const toolArgs: Record<string, unknown> = { autoFillFromAccounts: hasConnectedAccounts };
    if (mediaMsg && platform) {
      toolArgs.resumeIntent = {
        kind: 'pending_post',
        platform,
        platformLabel: platformLabel(platform),
      };
    }
    const out = await runAysopTool('start_guided_brand_setup', toolArgs, ctx);
    const hasCard = (out.artifacts ?? []).some((a) => a.type === 'brand_context_update');
    const fallback = hasCard
      ? BRAND_CONTEXT_SETUP_READY_REPLY
      : "Let's set up your brand context.";
    return {
      reply: replyFromArtifacts(out.artifacts ?? [], fallback),
      artifacts: out.artifacts ?? [],
    };
  }

  // Direct action fast paths for common requests
  if (/^show analytics?$/i.test(text) || text === 'Show Analytics') {
    const result = await runAysopTool('get_analytics_all_accounts', {}, ctx);
    return {
      reply: 'Here are your latest analytics:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^check inbox$/i.test(text) || text === 'Check Inbox') {
    const result = await runAysopTool('list_recent_inbox', { days: 7 }, ctx);
    return {
      reply: 'Here are your recent inbox comments:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^connect platform$/i.test(text) || text === 'Connect Platform') {
    const result = await runAysopTool('list_connect_platforms', {}, ctx);
    return {
      reply: 'Choose a platform to connect:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^find leads$/i.test(text) || text === 'Find Leads') {
    const result = await runAysopTool('get_saved_leads', {}, ctx);
    return {
      reply: 'Here are your saved leads:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^get support$/i.test(text) || text === 'Get Support') {
    const result = await runAysopTool('show_support_options', {}, ctx);
    return {
      reply: 'Here are your support options:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (
    text === 'Just create this post' ||
    text === "Let's upload" ||
    UPLOAD_POST_INTENT.test(text)
  ) {
    return await createPostPreviewFromThread(messages, ctx);
  }

  return null;
}
