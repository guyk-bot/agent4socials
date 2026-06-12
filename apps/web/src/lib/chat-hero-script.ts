import { LANDING_CHAT_ADS_REPLY, LANDING_CHAT_SUPPORT_FALLBACK } from '@/lib/landing-chat-knowledge';
import { PRO_PLAN_PRICING, STANDARD_PLAN_PRICING } from '@/lib/pricing/constants';

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
  connectedAccountId?: string | null;
  funnelFlowStep?: string | null;
  brandContextDraft?: Record<string, unknown> | null;
};

function platformLabel(id: ChatHeroPlatformId): string {
  return CHAT_HERO_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

function selectedLabels(ids: ChatHeroPlatformId[]): string[] {
  return ids.map(platformLabel);
}

export function landingChatCapabilityOverview(): string {
  return 'iZop schedules posts, manages inbox replies, runs analytics, brainstorms content, and finds leads — across Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, and Pinterest. Free plan, no credit card.';
}

function stepNudge(ctx: LandingChatContext): string {
  if (ctx.step === 0) return ' Pick your platforms below when you are ready.';
  if (ctx.step === 1) return ' Pick your biggest challenge below for a quick demo.';
  if (ctx.step === 2) return ' Tap Start for free to try it on your accounts.';
  return '';
}

/** Fix common typos so free-text matching still works ("waht" → "what"). */
export function normalizeLandingChatText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\bwaht\b/g, 'what')
    .replace(/\bwht\b/g, 'what')
    .replace(/\bwha\b/g, 'what')
    .replace(/\bteh\b/g, 'the')
    .replace(/\btoiktok\b/g, 'tiktok');
}

export function asksAboutAds(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  return /\b(ads?|advertis|ad campaign|run ads|roas|meta ads|google ads|tiktok ads|paid campaign|sponsored)\b/.test(
    lower
  );
}

/** User wants the funnel chat to perform an in-app action (publish, connect, etc.). */
export function wantsFunnelInAppAction(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  return (
    /\b(want to|need to|can you|please|help me) (post|publish|schedule|upload|connect|create)\b/.test(
      lower
    ) ||
    /\b(create|make|write) a (new )?(post|video|reel)\b/.test(lower) ||
    /\b(post|publish|schedule|upload|connect).*(right now|immediately|from here|directly)\b/.test(
      lower
    ) ||
    /\b(from here|right now|just said).*(post|publish|schedule|create|upload)\b/.test(lower) ||
    /\bcan i (post|publish|create|schedule|upload).*(from here|directly|right now|now)\b/.test(lower)
  );
}

export function landingChatFunnelActionReply(platformLabels: string[]): string {
  const connectPart = platformLabels.length
    ? `connect ${formatPlatformList(platformLabels)}, then `
    : 'connect your accounts, then ';
  return `This funnel demo cannot publish or connect accounts for you. Sign in at izop.ai, ${connectPart}publish from Composer or ask iZop AI in the dashboard chat.`;
}

export function isBrandContextFunnelStep(ctx: LandingChatContext): boolean {
  return ctx.funnelFlowStep === 'brand_context' || ctx.funnelFlowStep === 'free_chat';
}

/** High-priority scripted replies (checked before LLM). */
export function answerLandingChatPriority(ctx: LandingChatContext): string | null {
  if (asksAboutAds(ctx.text)) {
    return LANDING_CHAT_ADS_REPLY;
  }
  if (wantsFunnelInAppAction(ctx.text) && !isBrandContextFunnelStep(ctx) && !ctx.connectedAccountId) {
    const namesFromMessage = ctx.matchedPlatforms.map(platformLabel);
    const namesSelected = selectedLabels(ctx.selectedPlatformIds);
    const allNames = [...new Set([...namesFromMessage, ...namesSelected])];
    return landingChatFunnelActionReply(allNames);
  }
  return null;
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

/** Scripted fallback when the landing chat API is unavailable. */
export function answerLandingChatQuestion(ctx: LandingChatContext): string {
  const lower = normalizeLandingChatText(ctx.text);
  const namesFromMessage = ctx.matchedPlatforms.map(platformLabel);
  const namesSelected = selectedLabels(ctx.selectedPlatformIds);
  const allNames = [...new Set([...namesFromMessage, ...namesSelected])];

  if (/^(hi|hello|hey|yo)\b/.test(lower)) {
    return `Hey — I am iZop. Ask me about pricing, platforms, scheduling, inbox, or analytics.${stepNudge(ctx)}`;
  }

  if (asksAboutCapabilities(lower)) {
    return landingChatCapabilityOverview() + stepNudge(ctx);
  }

  if (/price|pricing|how much|cost|\$\d|plan|subscription|pay/.test(lower)) {
    return `Free forever, no credit card. Standard is $${STANDARD_PLAN_PRICING.monthly}/mo (unlimited scheduling, inbox, AI). Pro is $${PRO_PLAN_PRICING.monthly}/mo (bulk replies, team, white label, priority support).${stepNudge(ctx)}`;
  }

  if (/credit card|no card|free forever|free plan|trial/.test(lower)) {
    return 'Yes — Free includes 25 scheduled posts per month, 1 brand, and 30 days of analytics. No credit card to start.' + stepNudge(ctx);
  }

  if (/connect|link account|oauth|sign in|login|integrate/.test(lower)) {
    return 'After signup, open Connect and link each platform with official OAuth. Usually under a minute per account.' + stepNudge(ctx);
  }

  if (/brainstorm|content idea|hook|caption idea/.test(lower)) {
    return 'Brainstorm turns your best posts into hooks, ideas, and content pillars. Open Brainstorm in the dashboard or ask iZop AI in chat.' + stepNudge(ctx);
  }

  if (/team|invite|editor|collaborat|member/.test(lower)) {
    return 'Pro lets you invite editors and viewers and see who was active on each account. Standard is single-user.' + stepNudge(ctx);
  }

  if (/white.?label|agency|client portal/.test(lower)) {
    return 'White label is on Pro — custom branding for client-facing views.' + stepNudge(ctx);
  }

  if (/smart.?link|link.?page|link.?in.?bio/.test(lower)) {
    return 'Smart link pages are coming soon. You can still schedule posts and use analytics today.' + stepNudge(ctx);
  }

  if (/cancel|refund|billing/.test(lower)) {
    return 'Upgrade or cancel anytime from Dashboard → Settings. Free stays free with no card on file.' + stepNudge(ctx);
  }

  if (/support|contact|help|human|talk to someone/.test(lower)) {
    return LANDING_CHAT_SUPPORT_FALLBACK;
  }

  if (/analytics|metrics|insights|performance|dashboard|report/.test(lower)) {
    return 'One dashboard for followers, views, and engagement. Ask iZop AI plain-English questions, or export PDF reports on Standard and Pro.' + stepNudge(ctx);
  }

  if (/\b(inbox|comment|dm|message|reply|replies)\b/.test(lower) && !ctx.matchedPain) {
    return 'Inbox covers Instagram, Facebook, and X comments and DMs. AI drafts replies; Pro adds bulk comment replies.' + stepNudge(ctx);
  }

  if (/schedule|calendar|post later|publish later|automate post|composer/.test(lower)) {
    return 'Composer lets you write once, pick platforms and times, and publish or schedule — including Reels and Shorts.' + stepNudge(ctx);
  }

  if (/ai|assistant|chatgpt|gpt|copilot|brand voice/.test(lower)) {
    return 'iZop AI lives in the dashboard: schedule, inbox replies, lead scans, and analytics answers in your brand voice.' + stepNudge(ctx);
  }

  if (/lead|spreadsheet|export/.test(lower)) {
    return 'Scan comments and DMs for buyer intent, tag leads, and export CSV — great after viral posts.' + stepNudge(ctx);
  }

  if (/instagram|ig\b|insta/.test(lower) && /post|publish|reel|story|can you|can i|from here/.test(lower)) {
    return 'Yes — schedule and publish Instagram posts, Reels, and Stories from Composer. Inbox and analytics included.' + stepNudge(ctx);
  }

  if (/tiktok|tik tok/.test(lower) && /post|publish|video|can you|can i|from here|do that/.test(lower)) {
    return 'Yes — upload or link a TikTok video, add your caption, and schedule or publish from iZop.' + stepNudge(ctx);
  }

  if (/youtube|yt\b/.test(lower) && /post|publish|video|short|can you|can i/.test(lower)) {
    return 'Yes — connect YouTube to schedule uploads and Shorts and track views and subscribers.' + stepNudge(ctx);
  }

  if (/linkedin/.test(lower) && /post|publish|can you|can i/.test(lower)) {
    return 'Yes — LinkedIn posting is on Standard and Pro. Connect a profile or Page and schedule from Composer.' + stepNudge(ctx);
  }

  if (/threads|pinterest/.test(lower)) {
    return 'Threads and Pinterest are supported — connect after signup and schedule from Composer.' + stepNudge(ctx);
  }

  if (
    /post|publish|upload|schedule/.test(lower) &&
    (ctx.matchedPlatforms.length > 0 || allNames.length > 0)
  ) {
    const names = allNames.length > 0 ? allNames : namesFromMessage;
    return `Yes — schedule and publish to ${formatPlatformList(names)} from one Composer flow.` + stepNudge(ctx);
  }

  if (/what is izop|what's izop|who are you|what do you do|how does izop work/.test(lower)) {
    return landingChatCapabilityOverview() + stepNudge(ctx);
  }

  if (/how many platform|which platform|what platform/.test(lower)) {
    return 'Eight platforms: Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, and Pinterest.' + stepNudge(ctx);
  }

  if (ctx.matchedPain) {
    const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === ctx.matchedPain)?.label ?? 'that';
    return `"${painLabel}" is a core iZop use case — pick the matching option below for a demo.` + stepNudge(ctx);
  }

  if (ctx.matchedPlatforms.length > 0) {
    return `Noted ${formatPlatformList(namesFromMessage)}. iZop handles scheduling, inbox, and analytics for each.` + stepNudge(ctx);
  }

  if (isLikelyQuestion(ctx.text)) {
    return LANDING_CHAT_SUPPORT_FALLBACK;
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
      return `Got it — ${formatPlatformList(matchedPlatforms.map(platformLabel))}. Tap Continue when ready.`;
    }
    return landingChatCapabilityOverview() + ' Pick your platforms below.';
  }
  if (step === 1) {
    if (matchedPain) {
      const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === matchedPain)?.label ?? 'that';
      return `"${painLabel}" — tap the matching option below for a demo.`;
    }
    return 'Ask about pricing, platforms, or features — or pick your challenge below.';
  }
  if (step === 2) {
    return 'Tap Start for free to connect your accounts, or keep asking questions here.';
  }
  if (/sign up|signup|start|free|google|account/i.test(text)) {
    return 'Use Google or email below. No credit card required.';
  }
  return LANDING_CHAT_SUPPORT_FALLBACK;
}
