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
import { runShowAppInChat } from '@/lib/ai/aysop-show-app';

export type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

export type AysopToolContext = {
  userId: string;
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
    select: { id: true, platform: true, username: true },
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
      name: 'list_connected_accounts',
      description: 'List all social accounts the user has connected.',
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
      name: 'open_composer_draft',
      description:
        'Prepare a Composer link with a generated caption. User uploads media in Composer.',
      parameters: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          platform: platformParam,
          postType: {
            type: 'string',
            enum: ['feed', 'carousel', 'reel', 'story'],
            description: 'Hint for media type',
          },
        },
        required: ['caption'],
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
      await assertAccount(ctx.userId, accountId!);
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
        permalinkUrl: p.permalinkUrl,
      }));
      return {
        result: { posts: mapped },
        artifacts: [{ type: 'posts', accountId: accountId!, posts: mapped }],
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

    case 'open_composer_draft': {
      const caption = String(args.caption ?? '').trim();
      if (!caption) throw new Error('caption is required');
      const postType = (args.postType as string) || 'feed';
      const params = new URLSearchParams({ draft: '1', caption: caption.slice(0, 2000), type: postType });
      const accountId = await resolveAccountId(ctx.userId, args);
      if (accountId) params.set('accountId', accountId);
      const url = `/composer?${params.toString()}`;
      return {
        result: { url, postType },
        artifacts: [{ type: 'composer_link', url, caption }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
