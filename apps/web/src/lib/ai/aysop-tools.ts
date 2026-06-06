/**
 * Server-side tools for Aysop AI chat (analytics, comments, automations, content).
 */
import { prisma } from '@/lib/db';
import { getInboxCommentsFromDb, type InboxCommentRow } from '@/lib/inbox/inbox-db-cache';

export type AysopToolContext = {
  userId: string;
  accountId?: string | null;
};

export type AysopArtifact =
  | { type: 'accounts'; accounts: Array<{ id: string; platform: string; username: string | null }> }
  | { type: 'analytics'; accountId: string; platform: string; username: string | null; summary: Record<string, unknown> }
  | { type: 'posts'; accountId: string; posts: Array<Record<string, unknown>> }
  | { type: 'comments'; accountId: string; postPreview: string; comments: Array<Record<string, unknown>> }
  | { type: 'automation'; keywordSteps: unknown[]; dmWelcomeEnabled: boolean }
  | { type: 'composer_link'; url: string; caption?: string }
  | { type: 'action_result'; action: string; ok: boolean; detail: string };

async function assertAccount(userId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, platform: true, username: true },
  });
  if (!account) throw new Error('Account not found or not connected to your workspace.');
  return account;
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

export const AYSOP_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_connected_accounts',
      description: 'List social accounts the user has connected (Instagram, Facebook, TikTok, etc.).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analytics_summary',
      description:
        'Get a summary of analytics for a connected account: followers, recent post engagement totals, top post metrics from synced data.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Social account id' },
        },
        required: ['accountId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_posts',
      description: 'List recent synced posts for an account with likes, comments count, impressions when available.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          limit: { type: 'number', description: 'Max posts (default 5, max 10)' },
        },
        required: ['accountId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_latest_post_comment_stats',
      description:
        'Get the most recent post and how many comments it has (from synced analytics). Use before offering to show comment text.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
        },
        required: ['accountId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_post_comments',
      description:
        'Fetch comment text for a post. Use only after the user agrees to see comments. Filter by platformPostId or latest post.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          platformPostId: { type: 'string', description: 'Optional; omit for latest post comments' },
          limit: { type: 'number', description: 'Max comments (default 20)' },
        },
        required: ['accountId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_keyword_automation',
      description: 'Read saved keyword comment automation steps (keywords + reply templates) for the user.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_keyword_automation_step',
      description:
        'Add or update a keyword automation step: when someone comments a keyword, auto-reply with template. Confirm with user before saving.',
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
        'Prepare a link to Composer with a generated caption for carousel, image, video, or text post. User uploads media in Composer.',
      parameters: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
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
  const accountId = (args.accountId as string | undefined) ?? ctx.accountId ?? undefined;

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

    case 'get_analytics_summary': {
      if (!accountId) throw new Error('accountId is required');
      const account = await assertAccount(ctx.userId, accountId);
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
      const summary = {
        followers: await latestFollowers(accountId),
        postsSynced: posts.length,
        last30PostsTotals: totals,
      };
      return {
        result: { platform: account.platform, username: account.username, ...summary },
        artifacts: [
          {
            type: 'analytics',
            accountId,
            platform: account.platform,
            username: account.username,
            summary,
          },
        ],
      };
    }

    case 'get_recent_posts': {
      if (!accountId) throw new Error('accountId is required');
      const account = await assertAccount(ctx.userId, accountId);
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const posts = await prisma.importedPost.findMany({
        where: { socialAccountId: accountId },
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
        artifacts: [{ type: 'posts', accountId, posts: mapped }],
      };
    }

    case 'get_latest_post_comment_stats': {
      if (!accountId) throw new Error('accountId is required');
      const account = await assertAccount(ctx.userId, accountId);
      const post = await prisma.importedPost.findFirst({
        where: { socialAccountId: accountId },
        orderBy: { publishedAt: 'desc' },
        select: {
          platformPostId: true,
          content: true,
          commentsCount: true,
          likeCount: true,
          publishedAt: true,
        },
      });
      if (!post) {
        return { result: { message: 'No synced posts yet. Open Dashboard to sync posts first.' } };
      }
      const cached = (await getInboxCommentsFromDb(accountId)) ?? [];
      const onPost = cached.filter((c) => c.platformPostId === post.platformPostId && !c.isFromMe);
      const count = Math.max(post.commentsCount ?? 0, onPost.length);
      return {
        result: {
          platformPostId: post.platformPostId,
          preview: (post.content ?? '').slice(0, 100) || 'Latest post',
          commentsCount: count,
          likes: post.likeCount,
          publishedAt: post.publishedAt.toISOString(),
          platform: account.platform,
        },
      };
    }

    case 'fetch_post_comments': {
      if (!accountId) throw new Error('accountId is required');
      await assertAccount(ctx.userId, accountId);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      let platformPostId = args.platformPostId as string | undefined;
      if (!platformPostId) {
        const latest = await prisma.importedPost.findFirst({
          where: { socialAccountId: accountId },
          orderBy: { publishedAt: 'desc' },
          select: { platformPostId: true, content: true },
        });
        if (!latest) return { result: { comments: [], message: 'No posts synced.' } };
        platformPostId = latest.platformPostId;
      }
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
