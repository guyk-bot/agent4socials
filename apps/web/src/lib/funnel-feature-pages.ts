export type FunnelFeatureSection = {
  title: string;
  body: string[];
};

export type FunnelFeaturePage = {
  slug: string;
  title: string;
  tagline: string;
  capabilities: FunnelFeatureSection;
  limitations: FunnelFeatureSection;
  plans?: string;
};

export const FUNNEL_FEATURE_PAGES: FunnelFeaturePage[] = [
  {
    slug: 'publish-schedule',
    title: 'Create drafts, post, schedule',
    tagline:
      'Draft once in Composer, publish now or schedule across Instagram, Facebook, TikTok, YouTube, LinkedIn, Pinterest, Threads, and X.',
    capabilities: {
      title: 'What you can do',
      body: [
        'Create posts, carousels, reels, and stories from one Composer workspace.',
        'Save drafts and open them later from Posts or Calendar.',
        'Publish immediately to every connected account you select.',
        'Schedule posts for a specific date and time; the cron publishes automatically.',
        'Ask iZop AI to draft captions, hashtags, or variations before you publish.',
        'Attach images and video; TikTok and Instagram have platform-specific publish checks.',
      ],
    },
    limitations: {
      title: 'Limitations to know',
      body: [
        'Each platform has its own media rules (aspect ratio, length, file size). Composer surfaces errors before publish.',
        'Free plan includes 25 scheduled posts per month; Standard and Pro are unlimited.',
        'You must connect the target account with valid OAuth tokens. Expired tokens require reconnect.',
        'Some formats (e.g. Pinterest video, LinkedIn document posts) may have narrower support than feed posts.',
      ],
    },
    plans: 'Scheduling is on every plan. Unlimited scheduling starts on Standard ($29/month).',
  },
  {
    slug: 'inbox-replies',
    title: 'Reply / bulk reply to comments & DMs',
    tagline:
      'Work comments and direct messages from one Inbox, with AI drafts and bulk actions on supported plans.',
    capabilities: {
      title: 'What you can do',
      body: [
        'See Instagram, Facebook, X, YouTube, and TikTok comments in one Inbox.',
        'Reply to Instagram and Facebook DMs from the app when your Meta app has the right permissions.',
        'Use iZop AI to draft replies based on your brand context and example replies.',
        'Run keyword comment automation on Instagram and Facebook (cron-driven).',
        'Pro plan: bulk reply to multiple comments or messages in one action.',
      ],
    },
    limitations: {
      title: 'Limitations to know',
      body: [
        'X (Twitter) DMs are not available in Inbox today; only X comments appear.',
        'Instagram and Facebook DMs follow Meta\'s 24-hour messaging window unless you have Advanced Access.',
        'Comments on posts older than 28 days may not appear due to Meta API limits.',
        'Unread counts and full thread history can be incomplete when the platform API does not return them.',
        'Bulk replies require Pro. AI reply drafts need brand context and example replies configured first.',
      ],
    },
    plans: 'Comment and DM replies are on Standard. Bulk replies are Pro ($47/month).',
  },
  {
    slug: 'post-analytics',
    title: 'Post analytics',
    tagline:
      'See which posts performed best, compare metrics across platforms, and export reports on paid plans.',
    capabilities: {
      title: 'What you can do',
      body: [
        'View views, engagement, and follower trends per connected account.',
        'Open post-level metrics for Instagram, Facebook, TikTok, YouTube, and more where the API allows.',
        'Ask iZop AI which post performed best over a time range you care about.',
        'Track daily follower snapshots for Instagram and Facebook over time.',
        'Export analytics reports without watermark on Standard and Pro.',
      ],
    },
    limitations: {
      title: 'Limitations to know',
      body: [
        'Metrics depend on each platform\'s API. Some KPIs are delayed, rounded, or unavailable.',
        'Free plan includes 30 days of analytics history; Standard includes 6 months; Pro is unlimited.',
        'LinkedIn impressions and reach need Marketing API approval.',
        'Pinterest and TikTok analytics may be limited until your app has production API access.',
        'YouTube growth charts use API data only, not custom daily snapshots.',
      ],
    },
    plans: 'Analytics on every plan; history length and exports vary by plan.',
  },
  {
    slug: 'extract-leads',
    title: 'Extract leads',
    tagline:
      'Surface high-intent commenters and DM contacts so you can follow up without digging through every thread.',
    capabilities: {
      title: 'What you can do',
      body: [
        'Review a Leads view that highlights commenters showing purchase or signup intent.',
        'See suggested outreach copy iZop AI can draft from the original comment or DM.',
        'Filter by intent level to prioritize who to contact first.',
        'Jump from a lead back to the source comment in Inbox.',
      ],
    },
    limitations: {
      title: 'Limitations to know',
      body: [
        'Lead detection is heuristic and works best when comments mention pricing, availability, or clear interest.',
        'Only comments and DMs your connected accounts can access through platform APIs are included.',
        'Intent scoring is assistive, not a CRM replacement. Export or copy outreach manually today.',
        'DM lead capture follows the same Meta messaging rules as Inbox replies.',
      ],
    },
    plans: 'Leads are available on Standard and Pro with active connected accounts.',
  },
  {
    slug: 'brainstorm-ideas',
    title: 'Brainstorm ideas',
    tagline:
      'Turn your top-performing content and brand context into fresh hooks, scripts, and post ideas.',
    capabilities: {
      title: 'What you can do',
      body: [
        'Ask iZop AI for video hooks, carousel angles, or caption ideas tailored to your niche.',
        'Reference your recent top posts so suggestions match what already works for you.',
        'Use the dedicated Brainstorm workspace for longer creative sessions.',
        'Send strong ideas straight into Composer as drafts.',
      ],
    },
    limitations: {
      title: 'Limitations to know',
      body: [
        'AI suggestions are drafts. You should review tone, claims, and platform policy before publishing.',
        'Free plan has limited AI Assistant usage; Standard and Pro include unlimited AI on paid tiers.',
        'Ideas improve when brand context and example content are filled in under AI settings.',
        'iZop does not auto-publish brainstorm output without your confirmation.',
      ],
    },
    plans: 'Brainstorm uses your AI Assistant quota. Unlimited AI on Standard and Pro.',
  },
  {
    slug: 'compare-ads',
    title: 'Compare ads',
    tagline:
      'Unified paid ads ROAS across Google, Meta, and TikTok is on the roadmap.',
    capabilities: {
      title: 'Planned capabilities',
      body: [
        'Connect ad accounts and see spend, ROAS, and CPA in one table.',
        'Compare Meta, Google, and TikTok campaigns side by side.',
        'Ask iZop AI which channel is winning for your goals.',
        'Get weekly ad performance summaries in your dashboard.',
      ],
    },
    limitations: {
      title: 'Current status',
      body: [
        'Paid ads comparison is coming soon and is not available in the product yet.',
        'Today you can manage organic social, inbox, scheduling, and analytics from iZop.',
        'Join the waitlist by signing up; we will announce when ad connectors launch.',
      ],
    },
    plans: 'Ad comparison will be announced with plan details at launch.',
  },
];

export function getFunnelFeaturePage(slug: string): FunnelFeaturePage | undefined {
  return FUNNEL_FEATURE_PAGES.find((p) => p.slug === slug);
}

/** Side-demo card headers and learn-more links (index matches FUNNEL_DEMO_SCENE_COMPONENTS). */
export const FUNNEL_DEMO_META = FUNNEL_FEATURE_PAGES.map((p) => ({
  title: p.title,
  href: `/features/${p.slug}`,
}));
