import { BRAND_NAME } from '@/lib/site-brand-assets';
import type { IzopChatInputMessage } from '@/lib/ai/izop-openai-messages';
import { findLatestMediaUserMessage } from '@/lib/ai/izop-openai-messages';
import { isIzopQuickReplyMessage } from '@/lib/ai/izop-quick-replies';
import { runIzopTool, type IzopArtifact, type IzopToolContext } from '@/lib/ai/izop-tools';
import { platformLabel, platformSupportsTextOnly } from '@/lib/composer/platform-capabilities';
import { accountsFromWorkspaces } from '@/lib/ai/izop-workspace-snapshot';
import { prisma } from '@/lib/db';
import {
  MEDIA_BRAND_SETUP_REPLY,
  BRAND_CONTEXT_SETUP_READY_REPLY,
  userWantsToPostFromMessage,
} from '@/lib/ai/izop-media-brand-prompt';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { generatePostCaptionForUser } from '@/lib/ai/generate-post-caption';
import { shouldShowBrandContextOnboarding } from '@/lib/ai/brand-context-onboarding';

const UPLOAD_POST_INTENT =
  /^let'?s\s+(just\s+)?upload(\s+the\s+post|\s+it)?$/i;

function isPostUploadIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t === "Let's upload" || t === 'Just create this post') return true;
  if (UPLOAD_POST_INTENT.test(t)) return true;
  if (!/\b(upload|post|publish|share|schedule)\b/i.test(t)) return false;
  return (
    /\b(this|it|that)\b/i.test(t) ||
    /\b(to|on|for)\s+(threads?|instagram|tiktok|facebook|youtube|twitter|x|linkedin|pinterest)\b/i.test(t) ||
    /\b(threads?|instagram|tiktok|facebook|youtube|twitter|x|linkedin|pinterest)\b/i.test(t)
  );
}

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
export function isCasualIzopChatMessage(messages: IzopChatInputMessage[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return false;
  if (last.attachments?.length) return false;

  const text = last.content.trim();
  if (!text || text.length > 140) return false;
  if (DATA_INTENT.test(text)) return false;

  return CASUAL_GREETING.test(text) || CAPABILITY_QUESTION.test(text);
}

export function buildCasualIzopSystemPrompt(): string {
  return [
    `You are ${BRAND_NAME} AI. Execute instantly. One sentence max.`,
    'Available: connect accounts, create posts, check analytics, reply to comments, find leads.',
    'Ask for specific platform if needed (e.g. "Instagram analytics" or "TikTok comments").',
  ].join('\n');
}

export function instantCasualIzopReply(messages: IzopChatInputMessage[]): string | null {
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

export function userResolvedMediaBrandChoice(messages: IzopChatInputMessage[]): boolean {
  return messages.some((m) => m.role === 'user' && isIzopQuickReplyMessage(m.content));
}

function inferPlatformFromThread(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
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
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
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

function postIntentFromThread(messages: IzopChatInputMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = m.content.trim();
    if (!text || isIzopQuickReplyMessage(text) || SKIP_CAPTION_TEXT.test(text)) continue;
    if (CLEAR_BRAND_CONTEXT_INTENT.test(text) || SKIP_POST_INTENT_TEXT.test(text)) continue;
    parts.push(text);
  }
  return parts.join('\n').slice(0, 2000);
}

async function resolveCaptionForUpload(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext,
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

function threadHasMediaAttachments(messages: IzopChatInputMessage[]): boolean {
  return messages.some((m) =>
    m.attachments?.some((a) => a.kind === 'image' || a.kind === 'video')
  );
}

function userWantsTextOnlyThreadPost(messages: IzopChatInputMessage[]): boolean {
  if (threadHasMediaAttachments(messages)) return false;

  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter(
      (t) =>
        t &&
        !isIzopQuickReplyMessage(t) &&
        !SKIP_CAPTION_TEXT.test(t) &&
        !CLEAR_BRAND_CONTEXT_INTENT.test(t)
    )
    .join('\n');

  if (!userText.trim()) return false;

  if (/\b(text-?only|caption-?only|no media|without (an )?image|without media)\b/i.test(userText)) {
    return true;
  }
  if (/\bpost\s+(a\s+)?text\b/i.test(userText)) return true;
  if (/\btext\s+(thread|post|threads)\b/i.test(userText)) return true;

  // "post a thread" / "post to threads" with no media = text-only Threads post
  if (/\b(post|publish|share|create|write)\b/i.test(userText) && /\bthread/i.test(userText)) {
    return true;
  }

  return false;
}

async function userWantsImmediateTextPost(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<boolean> {
  if (userWantsTextOnlyThreadPost(messages)) return true;
  if (threadHasMediaAttachments(messages)) return false;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = lastUser?.content.trim() ?? '';
  if (!/\b(post|publish|share|create|write|upload)\b/i.test(text)) return false;

  const cached = accountsFromWorkspaces(ctx.workspaces);
  const accounts =
    cached ??
    (await prisma.socialAccount.findMany({
      where: { userId: ctx.userId },
      select: { platform: true },
      orderBy: { createdAt: 'asc' },
    }));
  if (accounts.length !== 1) return false;
  return platformSupportsTextOnly(accounts[0]!.platform);
}

async function createTextOnlyPostPreviewFromThread(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<{ reply: string; artifacts: IzopArtifact[] }> {
  const platform = await resolvePlatformForDraft(messages, ctx);
  if (!platformSupportsTextOnly(platform)) {
    return {
      reply: `${platformLabel(platform)} needs media before you can publish from chat. Use Composer instead.`,
      artifacts: [],
    };
  }

  const caption = await resolveCaptionForUpload(messages, ctx, platform, []);
  const out = await runIzopTool(
    'prepare_platform_post_drafts',
    {
      drafts: [{ platform, caption, postType: 'text' }],
    },
    ctx
  );

  return {
    reply: '',
    artifacts: out.artifacts ?? [],
  };
}

async function createPostPreviewFromThread(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<{ reply: string; artifacts: IzopArtifact[] } | null> {
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

  const out = await runIzopTool(
    'prepare_platform_post_drafts',
    {
      drafts: [{ platform, caption, postType, mediaUrls }],
    },
    ctx
  );

  return {
    reply: '',
    artifacts: out.artifacts ?? [],
  };
}

function replyFromArtifacts(artifacts: IzopArtifact[], fallback: string): string {
  const block = artifacts.find((a) => a.type === 'text_block');
  if (block && block.type === 'text_block' && block.body?.trim()) {
    return block.body.trim();
  }
  return fallback;
}

/** Enhanced greeting with quick actions */
async function createGreetingWithActions(ctx: IzopToolContext): Promise<{ reply: string; artifacts: IzopArtifact[] }> {
  const { artifacts } = await runIzopTool('show_quick_actions', { 
    actions: ['Show Analytics', 'Check Inbox', 'Create Post', 'Connect Platform'] 
  }, ctx);
  return {
    reply: 'Hi! What would you like to do?',
    artifacts: artifacts ?? [],
  };
}

/** Fast path: media + post intent without brand context → setup buttons, no LLM wait. */
export async function tryMediaBrandSetupFastPath(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<{ reply: string; artifacts: IzopArtifact[] } | null> {
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
  const out = await runIzopTool('collect_contextual_brand_info', { mediaType }, ctx);
  return {
    reply: MEDIA_BRAND_SETUP_REPLY,
    artifacts: out.artifacts ?? [],
  };
}

/** Skip the LLM for brand-context button taps and post creation from uploaded media. */
export async function tryMediaActionFastPath(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<{ reply: string; artifacts: IzopArtifact[] } | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  const text = lastUser.content.trim();

  if (CLEAR_BRAND_CONTEXT_INTENT.test(text)) {
    const out = await runIzopTool('clear_brand_context', {}, ctx);
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
    const { artifacts } = await runIzopTool('show_quick_actions', { actions: ['Show Analytics', 'Check Inbox', 'Create Post'] }, ctx);
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
    const out = await runIzopTool('start_guided_brand_setup', toolArgs, ctx);
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
    const result = await runIzopTool('get_analytics_all_accounts', {}, ctx);
    return {
      reply: 'Here are your latest analytics:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^check inbox$/i.test(text) || text === 'Check Inbox') {
    const result = await runIzopTool('list_recent_inbox', { days: 7 }, ctx);
    return {
      reply: 'Here are your recent inbox comments:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^connect platform$/i.test(text) || text === 'Connect Platform') {
    const result = await runIzopTool('list_connect_platforms', {}, ctx);
    return {
      reply: 'Choose a platform to connect:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^find leads$/i.test(text) || text === 'Find Leads') {
    const result = await runIzopTool('get_saved_leads', {}, ctx);
    return {
      reply: 'Here are your saved leads:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (/^get support$/i.test(text) || text === 'Get Support') {
    const result = await runIzopTool('show_support_options', {}, ctx);
    return {
      reply: 'Here are your support options:',
      artifacts: result.artifacts ?? [],
    };
  }

  if (isPostUploadIntent(text)) {
    return await createPostPreviewFromThread(messages, ctx);
  }

  return null;
}

/** Fast path: text-only Threads/Twitter/etc. post with brand-context caption, no LLM clarifying questions. */
export async function tryTextOnlyPostFastPath(
  messages: IzopChatInputMessage[],
  ctx: IzopToolContext
): Promise<{ reply: string; artifacts: IzopArtifact[] } | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  if (threadHasMediaAttachments(messages)) return null;
  if (!(await userWantsImmediateTextPost(messages, ctx))) return null;
  return await createTextOnlyPostPreviewFromThread(messages, ctx);
}
