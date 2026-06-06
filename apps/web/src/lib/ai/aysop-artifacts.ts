/** Shared artifact shapes for iZop AI chat (client + server safe). */

export type ReportSnapshotArtifact = {
  type: 'report_snapshot';
  accountId: string;
  platform: string;
  platformLabel: string;
  username: string | null;
  dateRange: { start: string; end: string };
  kpis: {
    followers: number;
    newFollowers: number;
    views: number;
    engagement: number;
    posts: number;
  };
  chartSeries: {
    followers: Array<{ date: string; value: number }>;
    views: Array<{ date: string; value: number }>;
    engagement: Array<{ date: string; value: number }>;
  };
  insightsHint?: string;
};

export type AysopArtifact =
  | { type: 'accounts'; accounts: Array<{ id: string; platform: string; username: string | null }> }
  | {
      type: 'brand_workspaces';
      workspaces: Array<{
        id: string;
        name: string;
        connectedAccountCount: number;
        accounts: Array<{ platform: string; username: string | null }>;
      }>;
      href: string;
    }
  | ReportSnapshotArtifact
  | { type: 'posts'; accountId: string; platform?: string; posts: Array<Record<string, unknown>> }
  | { type: 'comments'; accountId: string; postPreview: string; comments: Array<Record<string, unknown>> }
  | {
      type: 'automation';
      keywordSteps: unknown[];
      dmWelcomeEnabled: boolean;
      href?: string;
    }
  | {
      type: 'connect_platforms';
      connected: Array<{ platform: string; name: string; username: string | null }>;
      missing: Array<{ platform: string; name: string; slug: string }>;
    }
  | {
      type: 'inbox_feed';
      items: Array<{
        accountId: string;
        platform: string;
        commentId: string;
        authorName: string | null;
        text: string;
        postPreview: string;
        createdAt: string;
      }>;
    }
  | {
      type: 'composer_post_draft';
      platform: string;
      platformLabel: string;
      username: string | null;
      profilePicture?: string | null;
      accountId: string;
      caption: string;
      mediaType: 'text' | 'photo' | 'video' | 'reel' | 'carousel' | 'story';
      textOnlySupported: boolean;
      canPublishFromChat: boolean;
      composerUrl: string;
      sessionDraft?: import('@/lib/composer/aysop-composer-draft-bridge').AysopComposerDraftPayload;
    }
  | {
      type: 'composer_session_draft';
      composerUrl: string;
      platforms: string[];
      platformLabels: string[];
      caption: string;
      mediaType: 'text' | 'photo' | 'video' | 'reel' | 'carousel' | 'story';
      draft: import('@/lib/composer/aysop-composer-draft-bridge').AysopComposerDraftPayload;
    }
  | { type: 'composer_link'; url: string; caption?: string; postType?: string; platform?: string; draft?: import('@/lib/composer/aysop-composer-draft-bridge').AysopComposerDraftPayload }
  | { type: 'action_result'; action: string; ok: boolean; detail: string }
  | {
      type: 'app_view';
      viewId: string;
      title: string;
      description?: string;
      href: string;
      openLabel?: string;
    }
  | { type: 'brand_context'; fields: Array<{ label: string; value: string }>; href: string }
  | {
      type: 'console_summary';
      dateRange: { start: string; end: string };
      kpi: {
        totalAudience: number;
        totalImpressions: number;
        totalEngagement: number;
        totalPosts: number;
      };
      href: string;
    }
  | {
      type: 'scheduled_posts';
      posts: Array<{
        id: string;
        preview: string;
        scheduledAt: string;
        platforms: string[];
        href: string;
      }>;
      href: string;
    }
  | {
      type: 'smart_links';
      slug: string | null;
      title: string | null;
      isPublished: boolean;
      links: Array<{ label: string; url: string }>;
      publicUrl: string | null;
      href: string;
    }
  | { type: 'text_block'; title?: string; body: string; href?: string; hrefLabel?: string };

export type AppViewId =
  | 'dashboard'
  | 'console'
  | 'inbox'
  | 'composer'
  | 'calendar'
  | 'posts_history'
  | 'automation'
  | 'reports'
  | 'smart_links'
  | 'hashtag_pool'
  | 'ai_assistant'
  | 'account';

export const APP_VIEW_META: Record<
  AppViewId,
  { title: string; description: string; href: string; openLabel: string }
> = {
  dashboard: {
    title: 'Dashboard',
    description: 'Per-platform analytics, posts, and performance charts.',
    href: '/dashboard',
    openLabel: 'Open Dashboard',
  },
  console: {
    title: 'Console',
    description: 'Unified KPIs and cross-platform growth charts.',
    href: '/dashboard/console',
    openLabel: 'Open Console',
  },
  inbox: {
    title: 'Inbox',
    description: 'Comments and DMs across connected platforms.',
    href: '/dashboard/inbox',
    openLabel: 'Open Inbox',
  },
  composer: {
    title: 'Composer',
    description: 'Create and schedule posts with media and AI captions.',
    href: '/composer',
    openLabel: 'Open Composer',
  },
  calendar: {
    title: 'Calendar',
    description: 'Scheduled and published content on a calendar.',
    href: '/calendar',
    openLabel: 'Open Calendar',
  },
  posts_history: {
    title: 'Post history',
    description: 'Past scheduled and published posts.',
    href: '/posts',
    openLabel: 'Open history',
  },
  automation: {
    title: 'Automation',
    description: 'Keyword comment replies and welcome DMs.',
    href: '/dashboard/automation',
    openLabel: 'Open Automation',
  },
  reports: {
    title: 'Reports',
    description: 'Download PDF analytics reports.',
    href: '/dashboard/reports',
    openLabel: 'Open Reports',
  },
  smart_links: {
    title: 'Smart Links',
    description: 'Link-in-bio page and custom links.',
    href: '/dashboard/smart-links',
    openLabel: 'Open Smart Links',
  },
  hashtag_pool: {
    title: 'Hashtag pool',
    description: 'Saved hashtags to reuse in Composer.',
    href: '/dashboard/hashtag-pool',
    openLabel: 'Open Hashtag pool',
  },
  ai_assistant: {
    title: 'AI Assistant',
    description: 'Brand voice, tone, and reply examples.',
    href: '/dashboard/ai-assistant',
    openLabel: 'Open AI Assistant',
  },
  account: {
    title: 'Account',
    description: 'Connected accounts, brands, and billing.',
    href: '/dashboard/account',
    openLabel: 'Open Account',
  },
};

export function appViewArtifact(viewId: AppViewId, hrefOverride?: string): AysopArtifact {
  const meta = APP_VIEW_META[viewId];
  return {
    type: 'app_view',
    viewId,
    title: meta.title,
    description: meta.description,
    href: hrefOverride ?? meta.href,
    openLabel: meta.openLabel,
  };
}

export function formatAppSurfaceCatalog(): string {
  return Object.entries(APP_VIEW_META)
    .map(([id, m]) => `- ${id}: ${m.title} (${m.href})`)
    .join('\n');
}
