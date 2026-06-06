/**
 * Server-side tools for iZop AI chat (analytics, comments, automations, content).
 */
import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getInboxCommentsFromDb, type InboxCommentRow } from '@/lib/inbox/inbox-db-cache';

export type AysopToolContext = {
  userId: string;
};

export type AysopArtifact =
  | { type: 'accounts'; accounts: Array<{ id: string; platform: string; username: string | null }> }
  | { type: 'analytics'; accountId: string; platform: string; username: string | null; summary: Record<string, unknown> }
  | { type: 'posts'; accountId: string; posts: Array<Record<string, unknown>> }
  | { type: 'comments'; accountId: string; postPreview: string; comments: Array<Record<string, unknown>> }
  | { type: 'automation'; keywordSteps: unknown[]; dmWelcomeEnabled: boolean }
  | { type: 'composer_link'; url: string; caption?: string }
  | { type: 'action_result'; action: string; ok: boolean; detail: string };

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

async function latestFollowers(accountId: string): Promise<number | null> {
  const snap = await prisma.accountMetricSnapshot.findFirst({
    where: { socialAccountId: accountId },
    orderBy: { metricTimestamp: 'desc' },
    select: { followersCount: true, fansCount: true },
  });
  if (!snap) return null;
  return snap.followersCount ?? snap.fansCount ?? null;
}

async function buildAnalyticsSummary(accountId: string) {
  const posts = await prisma.importedPost.findMany({
    where: { socialAccountId: accountId },
    orderBy: { publishedAt: 'desc' },
    take: 30,
    select: {
      impressions: true,
      interactions: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
    },
  });
  const totals = posts.reduce(
    (acc, p) => ({
      impressions: acc.impressions + (p.impressions ?? 0),
      interactions: acc.interactions + (p.interactions ?? 0),
      likes: acc.likes + (p.likeCount ?? 0),
      comments: acc.comments + (p.commentsCount ?? 0),
      shares: acc.shares + (p.sharesCount ?? 0) + (p.repostsCount ?? 0),
    }),
    { impressions: 0, interactions: 0, likes: 0, comments: 0, shares: 0 }
  );
  return {
    followers: await latestFollowers(accountId),
    postsSynced: posts.length,
    last30PostsTotals: totals,
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
        'Get analytics summaries for every connected account. Use when the user asks about all platforms, overall performance, or does not name a specific platform.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analytics_summary',
      description:
        'Get analytics for one connected account. Infer platform from the user message (e.g. TikTok, Instagram).',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string', description: 'Optional internal id from connected accounts list' },
        },
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
      const accounts = await prisma.socialAccount.findMany({
        where: { userId: ctx.userId },
        select: { id: true, platform: true, username: true },
        orderBy: { createdAt: 'asc' },
      });
      const rows = await Promise.all(
        accounts.map(async (account) => {
          const summary = await buildAnalyticsSummary(account.id);
          return { account, summary };
        })
      );
      return {
        result: {
          accounts: rows.map(({ account, summary }) => ({
            accountId: account.id,
            platform: account.platform,
            username: account.username,
            ...summary,
          })),
        },
        artifacts: rows.map(({ account, summary }) => ({
          type: 'analytics' as const,
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          summary,
        })),
      };
    }

    case 'get_analytics_summary': {
      const accountId = await resolveAccountId(ctx.userId, args, { required: true });
      const account = await assertAccount(ctx.userId, accountId!);
      const summary = await buildAnalyticsSummary(accountId!);
      return {
        result: { platform: account.platform, username: account.username, ...summary },
        artifacts: [
          {
            type: 'analytics',
            accountId: accountId!,
            platform: account.platform,
            username: account.username,
            summary,
          },
        ],
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
        artifacts: [{ type: 'automation', keywordSteps: steps, dmWelcomeEnabled }],
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
