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
