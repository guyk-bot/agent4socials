export type ChatHeroPlatformId =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'pinterest';

export type ChatHeroPainPointId =
  | 'comments_dms'
  | 'posting_consistently'
  | 'understanding_analytics'
  | 'content_ideas'
  | 'multiple_brands'
  | 'all_above';

export const CHAT_HERO_PLATFORMS: { id: ChatHeroPlatformId; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'threads', label: 'Threads' },
  { id: 'pinterest', label: 'Pinterest' },
];

export const CHAT_HERO_PAIN_POINTS: { id: ChatHeroPainPointId; label: string }[] = [
  { id: 'comments_dms', label: 'Keeping up with comments and DMs' },
  { id: 'posting_consistently', label: 'Posting consistently' },
  { id: 'understanding_analytics', label: "Understanding what's actually working" },
  { id: 'content_ideas', label: 'Coming up with content ideas' },
  { id: 'multiple_brands', label: 'Managing multiple brands or clients' },
  { id: 'all_above', label: 'All of the above — honestly' },
];

export function formatPlatformList(labels: string[]): string {
  if (labels.length === 0) return 'accounts';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function painDiscoveryMessage(platformLabels: string[]): string {
  if (platformLabels.length === 0) {
    return "What's your biggest challenge right now?";
  }
  if (platformLabels.length === 1) {
    return `Got it — you're focused on ${platformLabels[0]}. What's your biggest challenge right now?`;
  }
  if (platformLabels.length <= 3) {
    return `Nice — you're on ${formatPlatformList(platformLabels)}. What's your biggest challenge right now?`;
  }
  return "You're managing a lot of platforms! What's your biggest challenge right now?";
}

export type DemoBlock =
  | { kind: 'text'; text: string }
  | { kind: 'stats'; items: { value: string; label: string }[] }
  | { kind: 'mock_chat'; user: string; ai: string }
  | { kind: 'ideas'; items: string[] }
  | { kind: 'badges'; items: string[] };

/** Short conversational demo reply after pain-point selection (no bullet lists). */
export function demoMessageForPainPoint(pain: ChatHeroPainPointId): string {
  switch (pain) {
    case 'comments_dms':
      return "That's exactly what I'm built for. Tell me to bulk-reply to today's comments and I'll handle hundreds of replies in your brand voice — and flag potential leads from the thread.";
    case 'posting_consistently':
      return "Got it. Ask me to schedule a week of posts and I'll draft captions, pick times, and publish across your connected platforms — all from one conversation.";
    case 'understanding_analytics':
      return "Instead of digging through dashboards, just ask me which posts performed best and why. I'll give you a plain-English answer you can act on right away.";
    case 'content_ideas':
      return "Tell me your niche once, then ask for post ideas anytime. I'll suggest topics and hooks that match your brand voice and what's working on each platform.";
    case 'multiple_brands':
      return "Each client gets its own workspace with separate accounts, brand voice, and reporting. Ask how all your brands performed this week and I'll summarize everything.";
    case 'all_above':
    default:
      return "I can handle scheduling, bulk replies, lead extraction, analytics, and content ideas — all through chat. Let's get your accounts connected and I'll show you.";
  }
}

/** @deprecated Use demoMessageForPainPoint for funnel chat. */
export function demoBlocksForPainPoint(pain: ChatHeroPainPointId): DemoBlock[] {
  return [{ kind: 'text', text: demoMessageForPainPoint(pain) }];
}

export function connectRedirectForPlatforms(platformIds: ChatHeroPlatformId[]): string {
  const first = platformIds[0] ?? 'instagram';
  return `/dashboard?connect=${first}`;
}

export type LandingChatContext = {
  step: 0 | 1 | 2 | 3;
  text: string;
  matchedPlatforms: ChatHeroPlatformId[];
  matchedPain: ChatHeroPainPointId | null;
  selectedPlatformIds: ChatHeroPlatformId[];
};

function platformLabel(id: ChatHeroPlatformId): string {
  return CHAT_HERO_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

function selectedLabels(ids: ChatHeroPlatformId[]): string[] {
  return ids.map(platformLabel);
}

export function landingChatCapabilityOverview(): string {
  return "I schedule and publish across Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, and Pinterest. I also manage inbox replies, bulk-reply to comments, extract leads, and answer analytics questions in plain English. Free plan available, no credit card — ask me about pricing, a platform, or how connecting works.";
}

const LANDING_CHAT_SOFT_PLATFORM_HINT =
  ' When you want a personalized demo, pick your platforms below or name them here.';

const LANDING_CHAT_SOFT_PAIN_HINT =
  ' When you are ready for a tailored walkthrough, pick the challenge that fits you below.';

/** Fix common typos so free-text matching still works ("waht" → "what"). */
function normalizeLandingChatText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\bwaht\b/g, 'what')
    .replace(/\bwht\b/g, 'what')
    .replace(/\bwha\b/g, 'what')
    .replace(/\bteh\b/g, 'the');
}

function isLikelyQuestion(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  if (/\?$/.test(lower)) return true;
  if (/^(what|how|why|when|where|who|can|does|do|is|are|will|should|could|would|tell me|explain|help|show me|describe)\b/.test(lower)) {
    return true;
  }
  return /\b(what|how|why|can you|can u|do you|tell me about|help me|what can|what do)\b/.test(lower);
}

function asksAboutCapabilities(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  return (
    /what can (you|izop|it|u)\b/.test(lower) ||
    /\b(can|do) (you|u) do\b/.test(lower) ||
    /what do you (do|offer|provide|support)/.test(lower) ||
    /what are you|what is (this|izop)|what'?s izop|who are you|how does izop|how can you help|what exactly|tell me (more|about)|features?|capabilities|help me|what do i get|why (use|should)|benefits?|what makes|compare|different from|worth it|good for|use cases?|examples?/.test(
      lower
    )
  );
}

function softStepHint(ctx: LandingChatContext, matchedPlatforms: ChatHeroPlatformId[]): string {
  if (ctx.step === 0) {
    if (matchedPlatforms.length > 0) {
      return ' Tap Continue when you are ready, or keep asking me anything.';
    }
    return LANDING_CHAT_SOFT_PLATFORM_HINT;
  }
  if (ctx.step === 1) {
    return LANDING_CHAT_SOFT_PAIN_HINT;
  }
  if (ctx.step === 2) {
    return ' Tap Start for free when you want to try it on your accounts.';
  }
  return ' Use Continue with Google or email below to get started.';
}

/** Scripted answers for free-text questions (no API). */
export function answerLandingChatQuestion(ctx: LandingChatContext): string {
  const lower = normalizeLandingChatText(ctx.text);
  const namesFromMessage = ctx.matchedPlatforms.map(platformLabel);
  const namesSelected = selectedLabels(ctx.selectedPlatformIds);
  const allNames = [...new Set([...namesFromMessage, ...namesSelected])];

  if (/^(hi|hello|hey|yo)\b/.test(lower)) {
    if (ctx.step === 0) {
      return "Hey! Pick your platforms below and tap Continue when you're ready — or ask me about pricing, features, or how connecting works.";
    }
    return `Hey! I am iZop, your AI social media manager. Ask me anything about scheduling, analytics, inbox, pricing, or connecting accounts.${softStepHint(ctx, ctx.matchedPlatforms)}`;
  }

  if (asksAboutCapabilities(lower)) {
    return landingChatCapabilityOverview() + (ctx.step === 0 ? LANDING_CHAT_SOFT_PLATFORM_HINT : softStepHint(ctx, ctx.matchedPlatforms));
  }

  if (/price|pricing|how much|cost|\$\d|plan|subscription|pay/.test(lower)) {
    return `iZop has a free plan forever — no credit card. Standard is $29/month for unlimited scheduling, inbox, and AI. Pro is $47/month for advanced analytics, bulk replies, and team features.${softStepHint(ctx, ctx.matchedPlatforms)}`;
  }

  if (/credit card|no card|free forever|free plan|trial/.test(lower)) {
    return 'Yes — you can start free with no credit card. The free plan includes 25 scheduled posts per month and core features. Upgrade anytime if you need unlimited scheduling or Pro tools.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/connect|link account|oauth|sign in|login|integrate/.test(lower)) {
    return 'You connect accounts with official OAuth (Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, Pinterest). After signup we open Connect so you can link each platform securely in under a minute.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/analytics|metrics|insights|performance|dashboard|report/.test(lower)) {
    return 'iZop pulls views, likes, comments, and followers into one dashboard. You can also ask iZop AI in plain English — for example: "Which post performed best this week and why?"' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/\b(inbox|comment|dm|message|reply|replies)\b/.test(lower) && !ctx.matchedPain) {
    return 'Yes — iZop unifies comments and DMs from Instagram, Facebook, and X. iZop AI can draft replies in your brand voice and bulk-reply to high-volume comment threads.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/schedule|calendar|post later|publish later|automate post/.test(lower)) {
    return 'Yes — use Composer to write once, pick platforms and times, and iZop publishes on schedule. iZop AI can also suggest topics and draft captions in your brand voice.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/ai|assistant|chatgpt|gpt|copilot|brand voice/.test(lower)) {
    return 'iZop AI is built into the dashboard: schedule posts, reply to inbox threads, scan comments for leads, and get analytics answers — all in one chat, trained on your brand context.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/lead|spreadsheet|export/.test(lower)) {
    return 'iZop AI can scan comments for buyer intent, flag potential leads, and export them to a spreadsheet — useful after viral posts or launch campaigns.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/instagram|ig\b|insta/.test(lower) && /post|publish|reel|story|can you|can i|from here/.test(lower)) {
    return 'Yes — connect Instagram, then schedule and publish posts, Reels, and Stories from iZop Composer. Analytics and inbox for Instagram are included too.' + (ctx.step === 0 && ctx.matchedPlatforms.length > 0 ? ' I noted Instagram for your selection.' + softStepHint(ctx, ctx.matchedPlatforms) : softStepHint(ctx, ctx.matchedPlatforms));
  }

  if (/tiktok|tik tok/.test(lower) && /post|publish|video|can you|can i|from here|do that/.test(lower)) {
    return 'Yes — connect TikTok, upload or link your video, write your caption, and schedule or publish directly from iZop. No need to jump between apps.' + (ctx.step === 0 && ctx.matchedPlatforms.length > 0 ? ' I noted TikTok for your selection.' + softStepHint(ctx, ctx.matchedPlatforms) : softStepHint(ctx, ctx.matchedPlatforms));
  }

  if (/youtube|yt\b/.test(lower) && /post|publish|video|short|can you|can i/.test(lower)) {
    return 'Yes — connect YouTube to schedule uploads and track views and subscribers alongside your other platforms.' + (ctx.step === 0 && ctx.matchedPlatforms.length > 0 ? ' I noted YouTube for your selection.' + softStepHint(ctx, ctx.matchedPlatforms) : softStepHint(ctx, ctx.matchedPlatforms));
  }

  if (/linkedin/.test(lower) && /post|publish|can you|can i/.test(lower)) {
    return 'Yes — LinkedIn is supported on Standard and Pro. Connect your profile or Page and schedule posts from Composer.' + (ctx.step === 0 && ctx.matchedPlatforms.length > 0 ? ' I noted LinkedIn for your selection.' + softStepHint(ctx, ctx.matchedPlatforms) : softStepHint(ctx, ctx.matchedPlatforms));
  }

  if (
    /post|publish|upload|schedule/.test(lower) &&
    (ctx.matchedPlatforms.length > 0 || allNames.length > 0)
  ) {
    const names = allNames.length > 0 ? allNames : namesFromMessage;
    return `Yes — iZop supports posting and scheduling to ${formatPlatformList(names)}. Connect once, use Composer, and publish or schedule from one place.${softStepHint(ctx, ctx.matchedPlatforms)}`;
  }

  if (/what is izop|what's izop|who are you|what do you do|how does izop work/.test(lower)) {
    return landingChatCapabilityOverview() + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (/how many platform|which platform|what platform|support/.test(lower)) {
    return 'iZop supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, and Pinterest — connect any combination that fits your workflow.' + softStepHint(ctx, ctx.matchedPlatforms);
  }

  if (ctx.matchedPain) {
    const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === ctx.matchedPain)?.label ?? 'that';
    return `That sounds like "${painLabel}" — iZop is built to help with exactly that. Tap the matching option below for a quick demo, or ask me anything else.${ctx.step === 1 ? '' : softStepHint(ctx, ctx.matchedPlatforms)}`;
  }

  if (ctx.matchedPlatforms.length > 0) {
    return `Got it — ${formatPlatformList(namesFromMessage)}. iZop supports scheduling, analytics, and AI for each of those.${softStepHint(ctx, ctx.matchedPlatforms)}`;
  }

  if (!ctx.matchedPain && ctx.matchedPlatforms.length === 0) {
    if (isLikelyQuestion(ctx.text) || asksAboutCapabilities(lower)) {
      return landingChatCapabilityOverview() + (ctx.step === 0 ? LANDING_CHAT_SOFT_PLATFORM_HINT : softStepHint(ctx, ctx.matchedPlatforms));
    }
    if (/\b(price|free|connect|schedule|post|inbox|comment|dm|lead|analytic|tiktok|instagram|youtube|facebook|twitter|linkedin|team|brand)\b/.test(lower)) {
      return `Good question. iZop covers scheduling, inbox, analytics, AI content, and leads across 8 platforms.${softStepHint(ctx, ctx.matchedPlatforms)} Ask about pricing, a specific platform, or how connecting works.`;
    }
  }

  return freeTextReplyForStep(ctx.step, ctx.text, ctx.matchedPlatforms, ctx.matchedPain);
}

const PLATFORM_TEXT_ALIASES: Record<ChatHeroPlatformId, string[]> = {
  instagram: ['instagram', 'ig', 'insta'],
  tiktok: ['tiktok', 'tik tok'],
  youtube: ['youtube', 'yt'],
  facebook: ['facebook', 'fb'],
  x: ['twitter', 'x / twitter', ' x '],
  linkedin: ['linkedin'],
  threads: ['threads'],
  pinterest: ['pinterest'],
};

export function matchPlatformsFromText(text: string): ChatHeroPlatformId[] {
  const lower = text.toLowerCase();
  const found = new Set<ChatHeroPlatformId>();
  for (const platform of CHAT_HERO_PLATFORMS) {
    const aliases = PLATFORM_TEXT_ALIASES[platform.id];
    const matched = aliases.some((alias) => {
      const a = alias.trim();
      if (a.length <= 2) {
        return new RegExp(`\\b${a.replace('/', '\\/')}\\b`, 'i').test(lower);
      }
      return lower.includes(a);
    });
    if (matched) found.add(platform.id);
  }
  return [...found];
}

export function matchPainPointFromText(text: string): ChatHeroPainPointId | null {
  const lower = text.toLowerCase();
  if (/comment|dm|inbox|repl/i.test(lower)) return 'comments_dms';
  if (/schedul|posting|consistent|calendar/i.test(lower)) return 'posting_consistently';
  if (/analytic|working|performance|metric|data/i.test(lower)) return 'understanding_analytics';
  if (/idea|content|caption|blank/i.test(lower)) return 'content_ideas';
  if (/brand|client|agency|multiple/i.test(lower)) return 'multiple_brands';
  if (/all|everything|honestly/i.test(lower)) return 'all_above';
  return null;
}

export function freeTextReplyForStep(
  step: 0 | 1 | 2 | 3,
  text: string,
  matchedPlatforms: ChatHeroPlatformId[],
  matchedPain: ChatHeroPainPointId | null
): string {
  if (step === 0) {
    if (matchedPlatforms.length > 0) {
      return `Got it — ${formatPlatformList(matchedPlatforms.map(platformLabel))}. iZop supports scheduling, analytics, and AI for each of those. Tap Continue when you are ready, or ask me anything else.`;
    }
    if (isLikelyQuestion(text)) {
      return landingChatCapabilityOverview() + LANDING_CHAT_SOFT_PLATFORM_HINT;
    }
    return `${landingChatCapabilityOverview()}${LANDING_CHAT_SOFT_PLATFORM_HINT}`;
  }
  if (step === 1) {
    if (matchedPain) {
      const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === matchedPain)?.label ?? 'that';
      return `That sounds like "${painLabel}" — iZop can help with that. Tap the matching option below for a demo, or ask me anything else.`;
    }
    if (isLikelyQuestion(text) || asksAboutCapabilities(text)) {
      return landingChatCapabilityOverview() + LANDING_CHAT_SOFT_PAIN_HINT;
    }
    return `Happy to help. Ask about scheduling, inbox, analytics, pricing, or a specific platform — or pick the challenge that fits you below.${LANDING_CHAT_SOFT_PAIN_HINT}`;
  }
  if (step === 2) {
    if (isLikelyQuestion(text) || asksAboutCapabilities(text)) {
      return landingChatCapabilityOverview() + ' Tap Start for free when you want to try it on your accounts.';
    }
    return 'When you are ready, tap Start for free to connect your accounts and try iZop. You can also keep asking questions here.';
  }
  if (/sign up|signup|start|free|google|account/i.test(text)) {
    return 'Use the buttons below to continue with Google or email. No credit card required.';
  }
  if (isLikelyQuestion(text)) {
    return landingChatCapabilityOverview() + ' Use Continue with Google or email below to get started.';
  }
  return 'Create your free account below and we will connect your platforms right away.';
}
