/**
 * Server-side tools for iZop AI chat (analytics, comments, automations, content).
 */
import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getInboxCommentsFromDb, type InboxCommentRow } from '@/lib/inbox/inbox-db-cache';
import {
  buildCrossPlatformKpiSummary,
  buildDashboardAnalyticsReportSafe,
  buildFastAllAccountsDashboardReports,
  resolveDashboardDateRange,
  type DashboardAnalyticsReport,
} from '@/lib/ai/dashboard-analytics';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import type {
  AysopActiveBrandSnapshot,
  AysopWorkspaceSnapshot,
} from '@/lib/ai/aysop-workspace-snapshot';
import { summarizeWorkspaceAccounts } from '@/lib/ai/aysop-workspace-snapshot';
import { runShowAppInChat } from '@/lib/ai/aysop-show-app';
import {
  mediaRequiredPlatformsSummary,
  platformLabel,
  platformRequiresMedia,
  platformSupportsTextOnly,
  MEDIA_REQUIRED_COMPOSER_PLATFORMS,
  TEXT_ONLY_COMPOSER_PLATFORMS,
  textOnlyPlatformsSummary,
} from '@/lib/composer/platform-capabilities';

export type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

export type AysopToolContext = {
  userId: string;
  workspaces?: AysopWorkspaceSnapshot[];
  activeBrand?: AysopActiveBrandSnapshot;
};

const PLATFORM_ALIASES: Record<string, Platform> = {
  instagram: 'INSTAGRAM',
  ig: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  tt: 'TIKTOK',
  youtube: 'YOUTUBE',
  yt: 'YOUTUBE',
  facebook: 'FACEBOOK',
  fb: 'FACEBOOK',
  twitter: 'TWITTER',
  x: 'TWITTER',
  linkedin: 'LINKEDIN',
  pinterest: 'PINTEREST',
  threads: 'THREADS',
};

const PLATFORM_ENUM = new Set<string>([
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'FACEBOOK',
  'TWITTER',
  'LINKEDIN',
  'PINTEREST',
  'THREADS',
]);

function normalizePlatformArg(input: string | undefined): Platform | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'xtwitter' || key === 'twitterx') return 'TWITTER';
  const alias = PLATFORM_ALIASES[key];
  if (alias) return alias;
  const upper = raw.toUpperCase();
  if (PLATFORM_ENUM.has(upper)) return upper as Platform;
  return null;
}

async function assertAccount(userId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, platform: true, username: true, profilePicture: true },
  });
  if (!account) throw new Error('Account not found or not connected to your workspace.');
  return account;
}

async function resolveAccountId(
  userId: string,
  args: Record<string, unknown>,
  opts?: { required?: boolean }
): Promise<string | null> {
  const explicit = args.accountId as string | undefined;
  if (explicit) {
    await assertAccount(userId, explicit);
    return explicit;
  }
  const platform = normalizePlatformArg(args.platform as string | undefined);
  if (platform) {
    const acc = await prisma.socialAccount.findFirst({
      where: { userId, platform },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!acc) throw new Error(`No connected ${platform} account found.`);
    return acc.id;
  }
  if (opts?.required) {
    throw new Error(
      'Pass platform (Instagram, TikTok, Facebook, etc.) inferred from the user question, or use get_analytics_all_accounts for cross-platform summaries.'
    );
  }
  return null;
}

function resolveDateRangeFromArgs(args: Record<string, unknown>) {
  const daysRaw = Number(args.days);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : undefined;
  const since = typeof args.since === 'string' ? args.since : undefined;
  const until = typeof args.until === 'string' ? args.until : undefined;
  if (!days && !since && !until) {
    return getDefaultAnalyticsDateRange();
  }
  return resolveDashboardDateRange({ days, since, until });
}

function reportToArtifact(report: DashboardAnalyticsReport): AysopArtifact {
  return {
    type: 'report_snapshot',
    accountId: report.accountId,
    platform: report.platform,
    platformLabel: report.platformLabel,
    username: report.username,
    dateRange: report.dateRange,
    kpis: {
      followers: report.kpis.followers,
      newFollowers: report.kpis.newFollowers,
      views: report.kpis.views,
      engagement: report.kpis.engagement,
      posts: report.kpis.posts,
    },
    chartSeries: report.chartSeries,
    insightsHint: report.insightsHint,
  };
}

function reportToToolResult(report: DashboardAnalyticsReport) {
  return {
    platform: report.platformLabel,
    username: report.username,
    dateRange: report.dateRange,
    kpis: report.kpis,
    source: report.source,
    insightsHint: report.insightsHint,
  };
}

async function findLatestPost(userId: string, accountId?: string | null) {
  if (accountId) {
    return prisma.importedPost.findFirst({
      where: { socialAccountId: accountId },
      orderBy: { publishedAt: 'desc' },
      select: {
        platformPostId: true,
        content: true,
        commentsCount: true,
        likeCount: true,
        publishedAt: true,
        socialAccountId: true,
        socialAccount: { select: { platform: true, username: true } },
      },
    });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  if (!accounts.length) return null;
  return prisma.importedPost.findFirst({
    where: { socialAccountId: { in: accounts.map((a) => a.id) } },
    orderBy: { publishedAt: 'desc' },
    select: {
      platformPostId: true,
      content: true,
      commentsCount: true,
      likeCount: true,
      publishedAt: true,
      socialAccountId: true,
      socialAccount: { select: { platform: true, username: true } },
    },
  });
}

function commentToPublic(row: InboxCommentRow) {
  return {
    commentId: row.commentId,
    authorName: row.authorName,
    text: row.text,
    createdAt: row.createdAt,
    postPreview: row.postPreview,
    platformPostId: row.platformPostId,
    isFromMe: row.isFromMe ?? false,
  };
}

function mapPostTypeToMediaType(postType: string): 'text' | 'photo' | 'video' | 'reel' | 'carousel' | 'story' {
  const t = postType.toLowerCase();
  if (t === 'text' || t === 'feed') return 'text';
  if (t === 'reel') return 'reel';
  if (t === 'story') return 'story';
  if (t === 'carousel') return 'carousel';
  if (t === 'video') return 'video';
  return 'photo';
}

async function buildComposerPostDraft(
  userId: string,
  args: Record<string, unknown>
): Promise<{ artifact: Extract<AysopArtifact, { type: 'composer_post_draft' }>; result: Record<string, unknown> }> {
  const caption = String(args.caption ?? '').trim();
  if (!caption) throw new Error('caption is required');

  const postType = String(args.postType ?? 'text');
  const mediaType = mapPostTypeToMediaType(postType);
  const platformArg = normalizePlatformArg(args.platform as string | undefined);
  const accountId = await resolveAccountId(
    userId,
    { ...args, platform: platformArg ?? args.platform },
    { required: true }
  );
  const account = await assertAccount(userId, accountId!);
  const platformUpper = account.platform;
  const textOnlySupported = platformSupportsTextOnly(platformUpper);
  const canPublishFromChat = textOnlySupported && mediaType === 'text';

  if (mediaType === 'text' && platformRequiresMedia(platformUpper)) {
    throw new Error(
      `${platformLabel(platformUpper)} requires an image or video. Use Composer for media posts on that platform.`
    );
  }

  const params = new URLSearchParams({
    draft: '1',
    caption: caption.slice(0, 2000),
    type: mediaType === 'text' ? 'text' : postType,
  });
  params.set('accountId', accountId!);
  if (platformArg) params.set('platform', platformArg);

  const artifact: Extract<AysopArtifact, { type: 'composer_post_draft' }> = {
    type: 'composer_post_draft',
    platform: platformUpper,
    platformLabel: platformLabel(platformUpper),
    username: account.username,
    profilePicture: account.profilePicture ?? null,
    accountId: accountId!,
    caption,
    mediaType,
    textOnlySupported,
    canPublishFromChat,
    composerUrl: `/composer?${params.toString()}`,
  };

  return {
    artifact,
    result: {
      platform: platformUpper,
      platformLabel: artifact.platformLabel,
      username: artifact.username,
      textOnlySupported,
      canPublishFromChat,
      composerUrl: artifact.composerUrl,
    },
  };
}

const platformParam = {
  type: 'string',
  description:
    'Platform inferred from the user message: Instagram, TikTok, Facebook, YouTube, X/Twitter, LinkedIn, Pinterest, or Threads.',
};

const dateRangeParams = {
  days: { type: 'number', description: 'Reporting window: 7, 30, or 90 days. Use 7 for "last week", 30 for "last month". Default 30.' },
  since: { type: 'string', description: 'Start date YYYY-MM-DD (optional)' },
  until: { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
};

export const AYSOP_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_brand_workspaces',
      description:
        'List brand workspaces (Account > Brands). Use when the user asks about brands, workspaces, or how many brands they have. Not for analytics.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_connected_accounts',
      description:
        'List every connected social account (Instagram, TikTok, etc.) across all brands. Use for platforms/accounts questions, not brand workspace counts.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analytics_all_accounts',
      description:
        'Cross-platform analytics for every connected account in a date range. Uses synced workspace data (fast). For post counts pass days: 7 for last week, 30 for last month.',
      parameters: {
        type: 'object',
        properties: { ...dateRangeParams },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analytics_summary',
      description:
        'Dashboard analytics for one platform (required). Must match the platform the user named (Instagram request → platform Instagram). Same numbers as the Dashboard overview.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string', description: 'Optional internal id from connected accounts list' },
          ...dateRangeParams,
        },
        required: ['platform'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analytics_report_snapshot',
      description:
        'Same as get_analytics_summary but use when the user asks for a report, graph, chart, or visual snapshot. Always returns chart-ready series.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string' },
          ...dateRangeParams,
        },
        required: ['platform'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_posts',
      description: 'List recent synced posts for one account. Infer platform from the user message.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string' },
          limit: { type: 'number', description: 'Max posts (default 5, max 10)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_latest_post_comment_stats',
      description:
        'Get the most recent post and comment count. Infer platform when the user names one; otherwise use the latest post across all connected accounts.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_post_comments',
      description:
        'Fetch comment text for a post. Ask the user first unless they already agreed. Infer platform when named.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string' },
          platformPostId: { type: 'string', description: 'Optional; omit for latest post comments' },
          limit: { type: 'number', description: 'Max comments (default 20)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_keyword_automation',
      description: 'Read saved keyword comment automation steps for the user.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_keyword_automation_step',
      description:
        'Add or update a keyword automation step. Confirm with user before saving.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          replyTemplate: { type: 'string' },
          platforms: {
            type: 'array',
            items: { type: 'string' },
            description: 'e.g. Instagram, Facebook, X (Twitter)',
          },
        },
        required: ['keyword', 'replyTemplate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_app_in_chat',
      description:
        'Show any app screen inline in chat with previews and an open link. Views: dashboard, console, inbox, composer, calendar, posts_history, automation, reports, smart_links, hashtag_pool, ai_assistant, account. Use when the user asks to open, see, or show any page, graph, feature, or tool in the app.',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: [
              'dashboard',
              'console',
              'inbox',
              'composer',
              'calendar',
              'posts_history',
              'automation',
              'reports',
              'smart_links',
              'hashtag_pool',
              'ai_assistant',
              'account',
            ],
          },
          platform: platformParam,
          accountId: { type: 'string' },
          ...dateRangeParams,
        },
        required: ['view'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_posting_capabilities',
      description:
        'List which connected platforms support text-only posts vs require media. Call before multi-platform caption variations.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'prepare_platform_post_drafts',
      description:
        'Create one or more platform-specific post drafts with preview cards in chat. Always pass platform per draft. Text-only drafts can be published from chat; media platforms open in Composer.',
      parameters: {
        type: 'object',
        properties: {
          drafts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                platform: platformParam,
                caption: { type: 'string' },
                postType: {
                  type: 'string',
                  enum: ['text', 'feed', 'photo', 'video', 'reel', 'carousel', 'story'],
                },
              },
              required: ['platform', 'caption'],
            },
            minItems: 1,
            maxItems: 8,
          },
        },
        required: ['drafts'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_composer_draft',
      description:
        'Prepare a single platform post draft. Always pass platform. For caption-only posts use postType text on X, Facebook, LinkedIn, or Threads.',
      parameters: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          platform: platformParam,
          accountId: { type: 'string' },
          postType: {
            type: 'string',
            enum: ['text', 'feed', 'photo', 'video', 'reel', 'carousel', 'story'],
            description: 'Use text for caption-only posts',
          },
        },
        required: ['caption', 'platform'],
        additionalProperties: false,
      },
    },
  },
];

export async function runAysopTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AysopToolContext
): Promise<{ result: unknown; artifacts?: AysopArtifact[] }> {
  switch (name) {
    case 'list_brand_workspaces': {
      const workspaces = ctx.workspaces?.length
        ? ctx.workspaces
        : await (async () => {
            const accounts = await prisma.socialAccount.findMany({
              where: { userId: ctx.userId },
              select: { id: true, platform: true, username: true },
              orderBy: { createdAt: 'asc' },
            });
            const handles = [
              ...new Set(
                accounts
                  .map((a) => a.username?.trim())
                  .filter((u): u is string => Boolean(u))
              ),
            ];
            const label =
              handles.length === 1
                ? handles[0]!
                : handles.length > 1
                  ? handles.slice(0, 3).join(', ')
                  : 'Your workspace';
            return [
              {
                id: 'unassigned',
                name: label,
                connectedAccountCount: accounts.length,
                accounts: accounts.map((a) => ({
                  id: a.id,
                  platform: a.platform,
                  username: a.username,
                })),
              },
            ] satisfies AysopWorkspaceSnapshot[];
          })();

      return {
        result: {
          totalBrands: workspaces.length,
          activeBrand: ctx.activeBrand ?? null,
          workspaces: workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            connectedAccountCount: w.connectedAccountCount,
            accountSummary: summarizeWorkspaceAccounts(w),
            accounts: w.accounts.map((a) => ({
              platform: a.platform,
              username: a.username,
            })),
          })),
        },
        artifacts: [
          {
            type: 'brand_workspaces' as const,
            workspaces: workspaces.map((w) => ({
              id: w.id,
              name: w.name,
              connectedAccountCount: w.connectedAccountCount,
              accounts: w.accounts.map((a) => ({
                platform: a.platform,
                username: a.username,
              })),
            })),
            href: '/dashboard/account',
          },
        ],
      };
    }

    case 'list_connected_accounts': {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId: ctx.userId },
        select: { id: true, platform: true, username: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        result: { accounts },
        artifacts: [{ type: 'accounts', accounts }],
      };
    }

    case 'get_analytics_all_accounts': {
      const dateRange = resolveDateRangeFromArgs(args);
      const [reports, cross] = await Promise.all([
        buildFastAllAccountsDashboardReports(ctx.userId, dateRange),
        buildCrossPlatformKpiSummary(ctx.userId, dateRange),
      ]);
      return {
        result: {
          dateRange,
          crossPlatformKpi: cross.kpi,
          accounts: reports.map(reportToToolResult),
          dataSource: 'synced_db',
        },
        artifacts: reports.map(reportToArtifact),
      };
    }

    case 'get_analytics_summary':
    case 'get_analytics_report_snapshot': {
      const accountId = await resolveAccountId(ctx.userId, args, { required: true });
      const account = await assertAccount(ctx.userId, accountId!);
      const requestedPlatform = normalizePlatformArg(args.platform as string | undefined);
      if (requestedPlatform && account.platform !== requestedPlatform) {
        throw new Error(
          `Platform mismatch: user asked about ${requestedPlatform} but resolved account is ${account.platform}. Pass the correct platform from the user message.`
        );
      }
      const dateRange = resolveDateRangeFromArgs(args);
      const report = await buildDashboardAnalyticsReportSafe(ctx.userId, accountId!, dateRange);
      return {
        result: reportToToolResult(report),
        artifacts: [reportToArtifact(report)],
      };
    }

    case 'get_recent_posts': {
      const accountId = await resolveAccountId(ctx.userId, args, { required: true });
      const account = await assertAccount(ctx.userId, accountId!);
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const posts = await prisma.importedPost.findMany({
        where: { socialAccountId: accountId! },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          platformPostId: true,
          content: true,
          thumbnailUrl: true,
          permalinkUrl: true,
          publishedAt: true,
          impressions: true,
          likeCount: true,
          commentsCount: true,
          mediaType: true,
        },
      });
      const mapped = posts.map((p) => ({
        platformPostId: p.platformPostId,
        preview: (p.content ?? '').slice(0, 120) || 'Post',
        publishedAt: p.publishedAt.toISOString(),
        impressions: p.impressions,
        likes: p.likeCount,
        commentsCount: p.commentsCount,
        mediaType: p.mediaType,
        thumbnailUrl: p.thumbnailUrl,
        permalinkUrl: p.permalinkUrl,
      }));
      return {
        result: { posts: mapped },
        artifacts: [{ type: 'posts', accountId: accountId!, platform: account.platform, posts: mapped }],
      };
    }

    case 'get_latest_post_comment_stats': {
      const accountId = await resolveAccountId(ctx.userId, args);
      const post = await findLatestPost(ctx.userId, accountId);
      if (!post) {
        return { result: { message: 'No synced posts yet. Open Dashboard to sync posts first.' } };
      }
      const cached = (await getInboxCommentsFromDb(post.socialAccountId)) ?? [];
      const onPost = cached.filter((c) => c.platformPostId === post.platformPostId && !c.isFromMe);
      const count = Math.max(post.commentsCount ?? 0, onPost.length);
      return {
        result: {
          platformPostId: post.platformPostId,
          preview: (post.content ?? '').slice(0, 100) || 'Latest post',
          commentsCount: count,
          likes: post.likeCount,
          publishedAt: post.publishedAt.toISOString(),
          platform: post.socialAccount.platform,
          username: post.socialAccount.username,
          accountId: post.socialAccountId,
        },
      };
    }

    case 'fetch_post_comments': {
      let accountId = await resolveAccountId(ctx.userId, args);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      let platformPostId = args.platformPostId as string | undefined;

      if (!platformPostId && !accountId) {
        const latest = await findLatestPost(ctx.userId, null);
        if (!latest) return { result: { comments: [], message: 'No posts synced.' } };
        accountId = latest.socialAccountId;
        platformPostId = latest.platformPostId;
      } else if (!platformPostId && accountId) {
        const latest = await findLatestPost(ctx.userId, accountId);
        if (!latest) return { result: { comments: [], message: 'No posts synced.' } };
        platformPostId = latest.platformPostId;
      } else if (platformPostId && !accountId) {
        const post = await prisma.importedPost.findFirst({
          where: {
            platformPostId,
            socialAccount: { userId: ctx.userId },
          },
          select: { socialAccountId: true },
        });
        if (!post) return { result: { comments: [], message: 'Post not found.' } };
        accountId = post.socialAccountId;
      }

      if (!accountId) throw new Error('Could not resolve account for comments.');
      await assertAccount(ctx.userId, accountId);

      const cached = (await getInboxCommentsFromDb(accountId)) ?? [];
      const filtered = cached
        .filter((c) => c.platformPostId === platformPostId && !c.isFromMe)
        .slice(0, limit)
        .map(commentToPublic);
      const postPreview =
        cached.find((c) => c.platformPostId === platformPostId)?.postPreview ??
        (await prisma.importedPost.findFirst({
          where: { socialAccountId: accountId, platformPostId },
          select: { content: true },
        }))?.content?.slice(0, 80) ??
        'Post';
      return {
        result: { platformPostId, count: filtered.length, comments: filtered },
        artifacts: [
          {
            type: 'comments',
            accountId,
            postPreview,
            comments: filtered,
          },
        ],
      };
    }

    case 'get_keyword_automation': {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { automationSettings: true },
      });
      const raw = (user?.automationSettings ?? {}) as Record<string, unknown>;
      const steps = Array.isArray(raw.keywordAutomationSteps) ? raw.keywordAutomationSteps : [];
      const dmWelcomeEnabled = raw.dmWelcomeEnabled === true;
      return {
        result: { keywordSteps: steps, dmWelcomeEnabled },
        artifacts: [{ type: 'automation', keywordSteps: steps, dmWelcomeEnabled, href: '/dashboard/automation' }],
      };
    }

    case 'save_keyword_automation_step': {
      const keyword = String(args.keyword ?? '').trim();
      const replyTemplate = String(args.replyTemplate ?? '').trim();
      if (!keyword || !replyTemplate) throw new Error('keyword and replyTemplate are required');
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { automationSettings: true },
      });
      const raw = (user?.automationSettings ?? {}) as Record<string, unknown>;
      const steps = Array.isArray(raw.keywordAutomationSteps) ? [...raw.keywordAutomationSteps] : [];
      const platforms = Array.isArray(args.platforms)
        ? (args.platforms as string[]).filter(Boolean)
        : ['Instagram', 'Facebook'];
      steps.push({ keyword, replyTemplate, platforms, enabled: true });
      await prisma.user.update({
        where: { id: ctx.userId },
        data: {
          automationSettings: {
            ...raw,
            keywordAutomationSteps: steps,
          },
        },
      });
      return {
        result: { saved: true, keyword, platforms },
        artifacts: [
          {
            type: 'action_result',
            action: 'save_keyword_automation',
            ok: true,
            detail: `Saved keyword "${keyword}" automation.`,
          },
        ],
      };
    }

    case 'show_app_in_chat':
      return runShowAppInChat(
        ctx.userId,
        {
          view: String(args.view ?? ''),
          platform: args.platform as string | undefined,
          days: Number(args.days) || undefined,
          since: args.since as string | undefined,
          until: args.until as string | undefined,
          accountId: args.accountId as string | undefined,
        },
        {
          resolveAccountId: (a, opts) => resolveAccountId(ctx.userId, a, opts),
          normalizePlatform: normalizePlatformArg,
        }
      );

    case 'get_posting_capabilities': {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId: ctx.userId },
        select: { id: true, platform: true, username: true },
        orderBy: { createdAt: 'asc' },
      });
      const textOnly = accounts.filter((a) => platformSupportsTextOnly(a.platform));
      const mediaRequired = accounts.filter((a) => platformRequiresMedia(a.platform));
      return {
        result: {
          textOnlyPlatforms: TEXT_ONLY_COMPOSER_PLATFORMS,
          mediaRequiredPlatforms: [...MEDIA_REQUIRED_COMPOSER_PLATFORMS],
          textOnlyAccounts: textOnly.map((a) => ({
            platform: a.platform,
            platformLabel: platformLabel(a.platform),
            username: a.username,
            id: a.id,
          })),
          mediaRequiredAccounts: mediaRequired.map((a) => ({
            platform: a.platform,
            platformLabel: platformLabel(a.platform),
            username: a.username,
            id: a.id,
          })),
        },
        artifacts: [
          {
            type: 'text_block' as const,
            title: 'Text-only posting from chat',
            body: `You can publish caption-only posts from chat to: ${textOnlyPlatformsSummary()}.\n\nThese platforms need media in Composer: ${mediaRequiredPlatformsSummary()}.`,
          },
        ],
      };
    }

    case 'prepare_platform_post_drafts': {
      const drafts = Array.isArray(args.drafts) ? args.drafts : [];
      if (!drafts.length) throw new Error('At least one draft is required.');
      const artifacts: AysopArtifact[] = [];
      const results: Record<string, unknown>[] = [];
      for (const raw of drafts.slice(0, 8)) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const built = await buildComposerPostDraft(ctx.userId, row);
        artifacts.push(built.artifact);
        results.push(built.result);
      }
      if (!artifacts.length) throw new Error('No valid drafts.');
      return { result: { drafts: results }, artifacts };
    }

    case 'open_composer_draft': {
      const built = await buildComposerPostDraft(ctx.userId, args);
      return {
        result: built.result,
        artifacts: [built.artifact],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
