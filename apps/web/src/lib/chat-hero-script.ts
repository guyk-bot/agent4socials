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

export function demoBlocksForPainPoint(pain: ChatHeroPainPointId): DemoBlock[] {
  switch (pain) {
    case 'comments_dms':
      return [
        {
          kind: 'text',
          text: "That's exactly what iZop AI was built for. ✦\n\nHere's what just happened on a real account:\n\n→ 847 comments came in after a viral Reel\n→ iZop AI bulk-replied to all 847 in 4 minutes\n→ Every reply matched the brand's tone perfectly\n→ 23 comments were flagged as potential leads\n→ Those 23 were exported to a spreadsheet automatically\n\nYou type one message. iZop handles the rest.",
        },
        {
          kind: 'stats',
          items: [
            { value: '847', label: 'replies sent' },
            { value: '4 min', label: 'total time' },
            { value: '23', label: 'leads found' },
          ],
        },
      ];
    case 'posting_consistently':
      return [
        {
          kind: 'text',
          text: "Most creators spend 6+ hours a week just on scheduling. Here's a better way. ✦\n\nJust tell iZop AI:\n'Schedule 3 posts a week for the next month based on what's worked before'\n\niZop AI will:\n→ Analyze your top performing content\n→ Suggest topics and formats that work for you\n→ Write the captions in your brand voice\n→ Schedule everything across all your platforms\n\nOne conversation. A month of content. Done.",
        },
        {
          kind: 'stats',
          items: [
            { value: '1', label: 'conversation' },
            { value: '30 days', label: 'scheduled' },
            { value: '8', label: 'platforms' },
          ],
        },
      ];
    case 'understanding_analytics':
      return [
        {
          kind: 'text',
          text: "Most analytics dashboards show you numbers. iZop AI tells you what they mean. ✦\n\nInstead of staring at graphs, just ask:\n\n'Which of my posts made the most impact this month and why?'\n\niZop AI responds with a plain-English breakdown:\n→ Your best performing post\n→ Why it worked (format, timing, topic, length)\n→ What to do next based on the data\n\nNo spreadsheets. No dashboards. Just answers.",
        },
        {
          kind: 'mock_chat',
          user: 'Which post performed best this week?',
          ai: 'Your Tuesday Reel got 4.2x your average reach. Short-form video + a question in the caption is your highest-converting format right now.',
        },
      ];
    case 'content_ideas':
      return [
        {
          kind: 'text',
          text: "Never stare at a blank page again. ✦\n\nTell iZop AI about your brand once. Then ask it anything:\n\n'Give me 10 Instagram post ideas for this week that fit my brand and what's trending'\n\niZop AI knows:\n→ Your brand voice and tone\n→ Your best performing content formats\n→ What's trending on each platform\n→ Your target audience\n\nIdeas in seconds. Content that actually sounds like you.",
        },
        {
          kind: 'ideas',
          items: [
            'Behind-the-scenes: how you plan a week of content in 20 minutes',
            'Carousel: 5 hooks that doubled your saves last month',
            'Reel: trend remix with your product as the punchline',
          ],
        },
      ];
    case 'multiple_brands':
      return [
        {
          kind: 'text',
          text: "iZop was built for this. ✦\n\nEach brand gets its own workspace with:\n→ Separate social accounts connected\n→ Its own AI brand voice and context\n→ Individual analytics and reporting\n→ Team member access controls\n\nAsk iZop AI: 'How did all my clients perform this week?'\n\nIt generates a full performance report for every brand in your account. One conversation. Complete overview.",
        },
        {
          kind: 'stats',
          items: [
            { value: '10', label: 'brands' },
            { value: '1', label: 'dashboard' },
            { value: 'instant', label: 'reports' },
          ],
        },
      ];
    case 'all_above':
    default:
      return [
        {
          kind: 'text',
          text: "You need a social media manager that never sleeps. That's exactly what iZop AI is. ✦\n\nHere's what iZop handles for you:\n\n→ Schedules posts across 8 platforms\n→ Bulk replies to hundreds of comments instantly\n→ Extracts leads from comments into spreadsheets\n→ Generates analytics reports on demand\n→ Brainstorms content ideas in your brand voice\n→ Tracks your team's performance\n→ Manages multiple brands from one place\n\nAll through a single conversation. No dashboards. No clicking around. Just ask.",
        },
        {
          kind: 'badges',
          items: [
            '8-platform scheduling',
            'Bulk comment replies',
            'Lead extraction',
            'AI analytics',
            'Content ideas',
            'Team performance',
            'Multi-brand workspaces',
          ],
        },
      ];
  }
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

/** Scripted answers for free-text questions (no API). */
export function answerLandingChatQuestion(ctx: LandingChatContext): string {
  const lower = ctx.text.toLowerCase().trim();
  const namesFromMessage = ctx.matchedPlatforms.map(platformLabel);
  const namesSelected = selectedLabels(ctx.selectedPlatformIds);
  const allNames = [...new Set([...namesFromMessage, ...namesSelected])];

  const stepNudge =
    ctx.step === 0
      ? ' Pick any other platforms you use, then hit Continue.'
      : ctx.step === 1
        ? ' Choose the challenge that fits you below, or hit Show me when ready.'
        : ctx.step === 2
          ? ' Tap Start for free when you want to try it on your accounts.'
          : ' Use Continue with Google or email below to get started.';

  if (/^(hi|hello|hey|yo)\b/.test(lower)) {
    return `Hey! I am iZop, your AI social media manager. Ask me anything about scheduling, analytics, inbox, or connecting accounts.${ctx.step === 0 ? ' Which platforms are you on?' : stepNudge}`;
  }

  if (/price|pricing|how much|cost|\$\d|plan|subscription|pay/.test(lower)) {
    return `iZop has a free plan forever — no credit card. Standard is $29/month for unlimited scheduling, inbox, and AI. Pro is $47/month for advanced analytics, bulk replies, and team features.${stepNudge}`;
  }

  if (/credit card|no card|free forever|free plan|trial/.test(lower)) {
    return 'Yes — you can start free with no credit card. The free plan includes 25 scheduled posts per month and core features. Upgrade anytime if you need unlimited scheduling or Pro tools.' + stepNudge;
  }

  if (/connect|link account|oauth|sign in|login|integrate/.test(lower)) {
    return 'You connect accounts with official OAuth (Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, Pinterest). After signup we open Connect so you can link each platform securely in under a minute.' + stepNudge;
  }

  if (/analytics|metrics|insights|performance|dashboard|report/.test(lower)) {
    return 'iZop pulls views, likes, comments, and followers into one dashboard. You can also ask iZop AI in plain English — for example: "Which post performed best this week and why?"' + stepNudge;
  }

  if (/inbox|comment|dm|message|repl/.test(lower) && !ctx.matchedPain) {
    return 'Yes — iZop unifies comments and DMs from Instagram, Facebook, and X. iZop AI can draft replies in your brand voice and bulk-reply to high-volume comment threads.' + stepNudge;
  }

  if (/schedule|calendar|post later|publish later|automate post/.test(lower)) {
    return 'Yes — use Composer to write once, pick platforms and times, and iZop publishes on schedule. iZop AI can also suggest topics and draft captions in your brand voice.' + stepNudge;
  }

  if (/ai|assistant|chatgpt|gpt|copilot|brand voice/.test(lower)) {
    return 'iZop AI is built into the dashboard: schedule posts, reply to inbox threads, scan comments for leads, and get analytics answers — all in one chat, trained on your brand context.' + stepNudge;
  }

  if (/lead|spreadsheet|export/.test(lower)) {
    return 'iZop AI can scan comments for buyer intent, flag potential leads, and export them to a spreadsheet — useful after viral posts or launch campaigns.' + stepNudge;
  }

  if (/instagram|ig\b|insta/.test(lower) && /post|publish|reel|story|can you|can i|from here/.test(lower)) {
    return 'Yes — connect Instagram, then schedule and publish posts, Reels, and Stories from iZop Composer. Analytics and inbox for Instagram are included too.' + (ctx.step === 0 ? ' I added Instagram to your selection.' + stepNudge : stepNudge);
  }

  if (/tiktok|tik tok/.test(lower) && /post|publish|video|can you|can i|from here|do that/.test(lower)) {
    return 'Yes — connect TikTok, upload or link your video, write your caption, and schedule or publish directly from iZop. No need to jump between apps.' + (ctx.step === 0 ? ' I added TikTok to your selection.' + stepNudge : stepNudge);
  }

  if (/youtube|yt\b/.test(lower) && /post|publish|video|short|can you|can i/.test(lower)) {
    return 'Yes — connect YouTube to schedule uploads and track views and subscribers alongside your other platforms.' + (ctx.step === 0 ? ' I added YouTube to your selection.' + stepNudge : stepNudge);
  }

  if (/linkedin/.test(lower) && /post|publish|can you|can i/.test(lower)) {
    return 'Yes — LinkedIn is supported on Standard and Pro. Connect your profile or Page and schedule posts from Composer.' + (ctx.step === 0 ? ' I added LinkedIn to your selection.' + stepNudge : stepNudge);
  }

  if (
    /post|publish|upload|schedule/.test(lower) &&
    (ctx.matchedPlatforms.length > 0 || allNames.length > 0)
  ) {
    const names = allNames.length > 0 ? allNames : namesFromMessage;
    return `Yes — iZop supports posting and scheduling to ${formatPlatformList(names)}. Connect once, use Composer, and publish or schedule from one place.${ctx.step === 0 ? stepNudge : stepNudge}`;
  }

  if (/what is izop|what's izop|who are you|what do you do|how does izop work/.test(lower)) {
    return 'iZop is an all-in-one social media manager: connect 8 platforms, schedule posts, manage inbox, track analytics, and use iZop AI for content, replies, and reports — all from one dashboard and one chat.' + stepNudge;
  }

  if (/how many platform|which platform|what platform|support/.test(lower)) {
    return 'iZop supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads, and Pinterest — connect any combination that fits your workflow.' + stepNudge;
  }

  if (ctx.matchedPain) {
    const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === ctx.matchedPain)?.label ?? 'that';
    return `That sounds like "${painLabel}" — iZop is built to help with exactly that. Tap the matching option below, or hit Show me for a quick demo.${ctx.step === 1 ? '' : stepNudge}`;
  }

  if (ctx.matchedPlatforms.length > 0) {
    return `Got it — ${formatPlatformList(namesFromMessage)}. iZop supports scheduling, analytics, and AI for each of those.${ctx.step === 0 ? stepNudge : stepNudge}`;
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
      return 'Got those platforms. Tap any others you use, then hit Continue when you are ready.';
    }
    return 'Thanks for sharing. Pick your platforms with the buttons below, or name them here and I will match them.';
  }
  if (step === 1) {
    if (matchedPain) {
      return 'That helps. You can tap the option that fits best, then Show me when you are ready.';
    }
    return 'Tell me more if you like, or choose the challenge that sounds most like you below.';
  }
  if (step === 2) {
    return 'When you are ready, tap Start for free to connect your accounts and try iZop.';
  }
  if (/sign up|signup|start|free|google|account/i.test(text)) {
    return 'Use the buttons below to continue with Google or email. No credit card required.';
  }
  return 'Create your free account below and we will connect your platforms right away.';
}
