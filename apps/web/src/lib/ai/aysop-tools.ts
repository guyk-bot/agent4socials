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
import {
  isThreadsMentionComment,
  isThreadsReplyComment,
} from '@/lib/threads/threads-inbox-comment';
import { inboxCommentReplyEligibility } from '@/lib/inbox/inbox-reply-eligibility';
import { proxyInboxImageUrl } from '@/lib/inbox/inbox-post-media-prefetch';
import { addInboxCommentsToLeads } from '@/lib/leads/add-inbox-comments-to-leads';
import {
  AYSOP_COMPOSER_HREF,
  buildAysopComposerDraftPayload,
  inferComposerMediaType,
  mediaListFromUrls,
  type AysopComposerDraftPayload,
  type AysopComposerMediaType,
} from '@/lib/composer/aysop-composer-draft-bridge';
import { AYSOP_CONNECT_PLATFORMS } from '@/lib/ai/aysop-connect-platforms';
import { appViewArtifact, type AppViewId } from '@/lib/ai/aysop-artifacts';
import { scanLeads, type ScannedLead } from '@/lib/leads/scan-leads';
import { getSavedLeadsScan, saveLeadsScan } from '@/lib/leads/leads-scan-cache';
import { leadsToChatArtifacts } from '@/lib/leads/leads-chat-artifact';
import {
  shouldSkipCosmeticRewrite,
  surgicalProductDescriptionUpdate,
} from '@/lib/brand-context-surgical';
import {
  shouldShowBrandContextOnboarding,
  analyzeBrandContext,
  generateBrandContextOnboardingMessage,
  generateMediaUploadBrandPrompt,
  hasSufficientBrandContext,
} from '@/lib/ai/brand-context-onboarding';
import {
  autoFillBrandContextFromAccounts,
  missingBrandContextFieldKeys,
} from '@/lib/ai/brand-context-auto-fill';

export type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

const BRAND_CONTEXT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'productDescription', label: 'Product / service' },
  { key: 'targetAudience', label: 'Target audience' },
  { key: 'toneOfVoice', label: 'Tone of voice' },
  { key: 'toneExamples', label: 'Tone examples' },
  { key: 'additionalContext', label: 'Additional context' },
  { key: 'inboxReplyExamples', label: 'Inbox reply examples' },
  { key: 'commentReplyExamples', label: 'Comment reply examples' },
];
const WORKSPACE_PAGE_VIEWS = new Set<AppViewId>(['brand', 'leads', 'team', 'support', 'brainstorm']);

async function loadBrandContext(userId: string): Promise<Record<string, string>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = (user?.brandContext as Record<string, unknown> | null) ?? {};
  const out: Record<string, string> = {};
  for (const { key } of BRAND_CONTEXT_FIELDS) {
    const v = ctx[key];
    out[key] = typeof v === 'string' ? v : '';
  }
  return out;
}

function getFieldPrompt(fieldKey: string): string {
  switch (fieldKey) {
    case 'productDescription':
      return 'What product or service do you offer? Describe what you do and what makes you unique.';
    case 'targetAudience':
      return 'Who is your ideal customer or audience? (e.g., small business owners, fitness enthusiasts, young professionals)';
    case 'toneOfVoice':
      return 'How should I communicate for your brand? (e.g., professional, friendly, casual, authoritative, fun)';
    case 'toneExamples':
      return 'Can you provide 2-3 example phrases or sentences that match your brand voice?';
    case 'additionalContext':
      return 'Any other important details about your brand, values, or messaging guidelines?';
    case 'inboxReplyExamples':
      return 'How do you typically respond to comments or messages? Provide 2-3 example replies.';
    case 'commentReplyExamples':
      return 'How do you respond to comments on your posts? Show me your style with a few examples.';
    default:
      return 'Please provide details for this field.';
  }
}

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

function resolveDaysFromArgs(args: Record<string, unknown>, defaultDays = 30): number {
  const daysRaw = Number(args.days);
  if ([7, 14, 30, 60, 90].includes(daysRaw)) return daysRaw;
  return defaultDays;
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

function commentToPublic(row: InboxCommentRow, platform?: string) {
  return {
    commentId: row.commentId,
    authorName: row.authorName,
    text: row.text,
    createdAt: row.createdAt,
    postPreview: row.postPreview,
    platformPostId: row.platformPostId,
    isFromMe: row.isFromMe ?? false,
    platform,
  };
}

async function buildConnectPlatformsArtifact(userId: string): Promise<
  Extract<AysopArtifact, { type: 'connect_platforms' }>
> {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { platform: true, username: true },
    orderBy: { createdAt: 'asc' },
  });
  const byPlatform = new Map(accounts.map((a) => [a.platform, a.username]));
  const connected = AYSOP_CONNECT_PLATFORMS.filter((p) => byPlatform.has(p.platform)).map((p) => ({
    platform: p.platform,
    name: p.name,
    username: byPlatform.get(p.platform) ?? null,
  }));
  const missing = AYSOP_CONNECT_PLATFORMS.filter((p) => !byPlatform.has(p.platform)).map((p) => ({
    platform: p.platform,
    name: p.name,
    slug: p.slug,
  }));
  return { type: 'connect_platforms', connected, missing };
}

type InboxContentFilter = 'all' | 'replies_only' | 'mentions_only';

function normalizeInboxContentFilter(raw: unknown): InboxContentFilter {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'replies_only' || v === 'replies' || v === 'reply') return 'replies_only';
  if (v === 'mentions_only' || v === 'mentions' || v === 'mention') return 'mentions_only';
  return 'all';
}

function inboxRowPassesContentFilter(
  row: InboxCommentRow,
  accountPlatform: Platform,
  filter: InboxContentFilter
): boolean {
  if (filter === 'all') return true;
  if (accountPlatform !== 'THREADS') return filter !== 'mentions_only';
  const probe = {
    platform: 'THREADS' as const,
    commentId: row.commentId,
    inboxKind: row.inboxKind ?? undefined,
  };
  if (filter === 'mentions_only') return isThreadsMentionComment(probe);
  return isThreadsReplyComment(probe);
}

async function buildRecentInboxArtifact(
  userId: string,
  limit: number,
  platformFilter?: Platform | null,
  contentFilter: InboxContentFilter = 'all'
): Promise<Extract<AysopArtifact, { type: 'inbox_feed' }>> {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId,
      ...(platformFilter ? { platform: platformFilter } : {}),
    },
    select: { id: true, platform: true },
    orderBy: { createdAt: 'asc' },
  });

  const caches = await Promise.all(accounts.map((acc) => getInboxCommentsFromDb(acc.id)));

  const items: Extract<AysopArtifact, { type: 'inbox_feed' }>['items'] = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]!;
    const cached = caches[i] ?? [];
    for (const row of cached) {
      if (row.isFromMe) continue;
      if (!inboxRowPassesContentFilter(row, acc.platform, contentFilter)) continue;
      items.push({
        accountId: acc.id,
        platform: platformLabel(acc.platform),
        platformCode: acc.platform,
        commentId: row.commentId,
        platformPostId: row.platformPostId,
        authorName: row.authorName,
        authorPictureUrl: row.authorPictureUrl ?? null,
        text: row.text,
        postPreview: row.postPreview ?? 'Post',
        postText: row.postPreview ?? null,
        postImageUrl: proxyInboxImageUrl(row.postImageUrl) ?? row.postImageUrl ?? null,
        postUrl: row.postUrl ?? null,
        createdAt: row.createdAt,
        inboxKind: row.inboxKind ?? null,
        ...(() => {
          const elig = inboxCommentReplyEligibility({
            platform: acc.platform,
            createdAt: row.createdAt,
            postPublishedAt: row.postPublishedAt ?? null,
            openOnPlatformOnly: row.openOnPlatformOnly,
          });
          return {
            canSuggestReply: elig.canSuggestReply,
            replyBlockedReason: elig.reason,
          };
        })(),
      });
    }
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    type: 'inbox_feed',
    title: contentFilter === 'replies_only' ? 'Replies on Threads' : 'Recent inbox',
    items: items.slice(0, Math.min(Math.max(limit, 1), 25)),
  };
}

async function buildInboxCommentSummary(
  userId: string,
  days: number,
  platformFilter?: Platform | null,
  contentFilter: InboxContentFilter = 'all'
) {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId,
      ...(platformFilter ? { platform: platformFilter } : {}),
    },
    select: { id: true, platform: true, username: true },
    orderBy: { createdAt: 'asc' },
  });

  const caches = await Promise.all(accounts.map((acc) => getInboxCommentsFromDb(acc.id)));

  let totalComments = 0;
  const byPlatform: Record<string, number> = {};
  const sampleComments: Array<{
    platform: string;
    authorName: string;
    text: string;
    createdAt: string;
    postPreview: string;
  }> = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]!;
    const label = platformLabel(acc.platform);
    const cached = caches[i] ?? [];
    let platformCount = 0;
    for (const row of cached) {
      if (row.isFromMe) continue;
      if (!inboxRowPassesContentFilter(row, acc.platform, contentFilter)) continue;
      const createdMs = new Date(row.createdAt).getTime();
      if (Number.isNaN(createdMs) || createdMs < sinceMs) continue;
      platformCount += 1;
      totalComments += 1;
      if (sampleComments.length < 40) {
        sampleComments.push({
          platform: label,
          authorName: row.authorName,
          text: row.text,
          createdAt: row.createdAt,
          postPreview: row.postPreview ?? 'Post',
        });
      }
    }
    if (platformCount > 0) {
      byPlatform[label] = (byPlatform[label] ?? 0) + platformCount;
    }
  }

  return {
    days,
    since: new Date(sinceMs).toISOString().slice(0, 10),
    totalComments,
    byPlatform,
    sampleComments,
    accountsScanned: accounts.length,
    dataSource: 'cached_inbox' as const,
    note:
      totalComments === 0
        ? 'No cached inbox comments in this range. Open Inbox once to sync recent comments, then ask again.'
        : 'Counts from cached inbox comments. Lead interest is your estimate from samples, not exact CRM data.',
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

function parseMediaUrlsArg(args: Record<string, unknown>): { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[] {
  if (!Array.isArray(args.mediaUrls)) return [];
  return mediaListFromUrls(args.mediaUrls.filter((u): u is string => typeof u === 'string'));
}

function canPublishDraftFromChat(
  platform: string,
  mediaType: AysopComposerMediaType,
  hasMedia: boolean
): boolean {
  const upper = platform.toUpperCase();
  if (platformSupportsTextOnly(upper) && mediaType === 'text' && !hasMedia) return true;
  if (upper === 'THREADS' && hasMedia && (mediaType === 'photo' || mediaType === 'video')) return true;
  return false;
}

async function resolvePlatformsFromArgs(
  userId: string,
  args: Record<string, unknown>
): Promise<string[]> {
  const rawList = Array.isArray(args.platforms) ? args.platforms : [];
  const singles = args.platform ? [args.platform] : [];
  const inputs = [...rawList, ...singles]
    .map((p) => (typeof p === 'string' ? p : String(p ?? '')))
    .filter(Boolean);
  if (!inputs.length) {
    throw new Error('Pass platform or platforms (Instagram, TikTok, etc.).');
  }

  const resolved: string[] = [];
  for (const input of inputs) {
    const platformArg = normalizePlatformArg(input);
    const accountId = await resolveAccountId(
      userId,
      { ...args, platform: platformArg ?? input },
      { required: true }
    );
    const account = await assertAccount(userId, accountId!);
    if (!resolved.includes(account.platform)) resolved.push(account.platform);
  }
  return resolved;
}

async function buildComposerSessionDraft(
  userId: string,
  args: Record<string, unknown>
): Promise<{
  artifact: Extract<AysopArtifact, { type: 'composer_session_draft' }>;
  result: Record<string, unknown>;
}> {
  const caption = String(args.caption ?? '').trim();
  if (!caption) throw new Error('caption is required');

  const platforms = await resolvePlatformsFromArgs(userId, args);
  const postType = String(args.postType ?? '');
  const mediaList = parseMediaUrlsArg(args);
  const mediaType = mediaList.length
    ? mediaList.some((m) => m.type === 'VIDEO')
      ? 'video'
      : 'photo'
    : inferComposerMediaType(platforms, postType, platformRequiresMedia);

  if (mediaType === 'text' && platforms.some((p) => platformRequiresMedia(p))) {
    throw new Error(
      `${platforms.filter(platformRequiresMedia).map(platformLabel).join(', ')} need media. Use postType photo or video for Composer drafts.`
    );
  }

  const draft: AysopComposerDraftPayload = buildAysopComposerDraftPayload({
    platforms,
    caption,
    mediaType,
    mediaList,
  });

  const artifact: Extract<AysopArtifact, { type: 'composer_session_draft' }> = {
    type: 'composer_session_draft',
    composerUrl: AYSOP_COMPOSER_HREF,
    platforms,
    platformLabels: platforms.map(platformLabel),
    caption,
    mediaType,
    draft,
  };

  return {
    artifact,
    result: {
      platforms,
      platformLabels: artifact.platformLabels,
      mediaType,
      composerUrl: artifact.composerUrl,
      note: 'User opens Composer to review platforms, caption, and upload media.',
    },
  };
}

async function buildComposerPostDraft(
  userId: string,
  args: Record<string, unknown>,
  opts?: { allowComposerOnly?: boolean }
): Promise<{ artifact: Extract<AysopArtifact, { type: 'composer_post_draft' }>; result: Record<string, unknown> }> {
  const caption = String(args.caption ?? '').trim();
  if (!caption) throw new Error('caption is required');

  const postType = String(args.postType ?? 'text');
  const mediaList = parseMediaUrlsArg(args);
  const mediaType = mediaList.length
    ? mediaList.some((m) => m.type === 'VIDEO')
      ? 'video'
      : 'photo'
    : mapPostTypeToMediaType(postType);
  const platformArg = normalizePlatformArg(args.platform as string | undefined);
  const accountId = await resolveAccountId(
    userId,
    { ...args, platform: platformArg ?? args.platform },
    { required: true }
  );
  const account = await assertAccount(userId, accountId!);
  const platformUpper = account.platform;
  const textOnlySupported = platformSupportsTextOnly(platformUpper);
  const hasMedia = mediaList.length > 0;
  const canPublishFromChat = canPublishDraftFromChat(platformUpper, mediaType, hasMedia);

  if (mediaType === 'text' && platformRequiresMedia(platformUpper) && !opts?.allowComposerOnly) {
    throw new Error(
      `${platformLabel(platformUpper)} requires an image or video. Mention it in your reply and offer Composer; do not create a draft unless the user asks.`
    );
  }

  const sessionDraft = buildAysopComposerDraftPayload({
    platforms: [platformUpper],
    caption,
    mediaType: mediaType === 'text' && platformRequiresMedia(platformUpper) ? 'photo' : mediaType,
    mediaList,
  });

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
    composerUrl: AYSOP_COMPOSER_HREF,
    sessionDraft,
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
      name: 'list_connect_platforms',
      description:
        'Show Connect buttons in chat for platforms not yet linked. Use when the user wants to connect, add, or link Instagram, TikTok, Facebook, etc.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_inbox_comment_summary',
      description:
        'Fast comment volume for a date range from cached Inbox data. Use when the user asks how many comments they got, comment trends, or which comments might be interested leads. Pass days: 7 or 30 for the range. For Threads, pass contentFilter replies_only when they mean replies on their posts (not @mentions), or mentions_only for @mentions only.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          days: { type: 'number', description: 'Lookback days: 7, 14, 30, 60, or 90 (default 30)' },
          contentFilter: {
            type: 'string',
            enum: ['all', 'replies_only', 'mentions_only'],
            description:
              'Threads only: replies_only excludes @mentions; mentions_only excludes post replies. Default all.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_recent_inbox',
      description:
        'Show recent comments from Inbox with inline Reply in chat buttons. Use for messages, comments, inbox, or replying without opening Inbox. When the user asks for Threads replies (not @mentions), pass platform THREADS and contentFilter replies_only. Use mentions_only only when they explicitly ask for @mentions or tags.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          limit: { type: 'number', description: 'Max items (default 12, max 25)' },
          contentFilter: {
            type: 'string',
            enum: ['all', 'replies_only', 'mentions_only'],
            description:
              'Threads only: replies_only excludes @mentions; mentions_only excludes post replies. Default all.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_inbox_comments_to_leads',
      description:
        'Save inbox comments to the Leads list (default intent: low). Use when the user asks to add comments/replies to leads, extract leads from shown replies, or save commenters as leads. Skips duplicates already in Leads. Do NOT use scan_leads for this unless they explicitly want AI intent scoring.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          commentIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional comment ids from list_recent_inbox. Omit to add all cached comments for the platform.',
          },
          intent: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Default low for generic praise replies the user still wants tracked.',
          },
          limit: { type: 'number', description: 'Max comments to process (default 50)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_app_in_chat',
      description:
        'Preview an app screen in chat. Prefer actionable tools (connect, drafts, inbox, schedule) so the user can complete tasks in chat. Only use when they explicitly want the full page UI.',
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
        'Show platform-specific post preview cards in chat. Nothing is published until the user clicks Approve & publish on a card. Use for text-only platforms (X, Facebook, LinkedIn, Threads) when posting without media. Skip media-required platforms unless allowComposerDrafts is true and the user asked for Composer.',
      parameters: {
        type: 'object',
        properties: {
          allowComposerDrafts: {
            type: 'boolean',
            description:
              'Set true only when the user explicitly asked to create Composer drafts for Instagram, TikTok, YouTube, or Pinterest. Default false.',
          },
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
                mediaUrls: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Attached media URLs from chat (for Threads image/video posts).',
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
        'Open inline Composer in chat with platforms, caption, media type, and any attached media URLs pre-filled. Ask which platform(s), caption, schedule, and post type first if missing. Call when the user attaches media, asks to post to Threads/Instagram/etc., or wants the full Composer flow.',
      parameters: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          platform: platformParam,
          platforms: {
            type: 'array',
            items: { type: 'string' },
            description:
              'All platforms to pre-select in Composer (e.g. Instagram, TikTok, YouTube, Pinterest from the conversation).',
          },
          postType: {
            type: 'string',
            enum: ['text', 'feed', 'photo', 'video', 'reel', 'carousel', 'story'],
            description: 'Use photo for media platforms when no file is attached yet.',
          },
          mediaUrls: {
            type: 'array',
            items: { type: 'string' },
            description:
              'HTTPS URLs from user chat attachments (image or video). Pass every attached file URL when opening Composer or posting to Threads.',
          },
        },
        required: ['caption'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_brand_context',
      description:
        "Show the user's current brand context (product, audience, tone, examples) as a card in chat. Use when they ask what their brand context is or want to review it.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_brand_context_update',
      description:
        "Propose changes to the user's brand context and show an editable Approve card in chat. ONLY pass fields the user explicitly asked to change: product/features → productDescription only; audience → targetAudience only; tone → toneOfVoice only. Never pass targetAudience or toneOfVoice when the user only mentions product or features. CRITICAL: copy the existing field text verbatim and make the smallest edit (remove one bullet, add one sentence). Do NOT rewrite, summarize, or rephrase unchanged sections. Nothing is saved until Approve.",
      parameters: {
        type: 'object',
        properties: {
          productDescription: { type: 'string', description: 'New product / service description' },
          targetAudience: { type: 'string', description: 'New target audience' },
          toneOfVoice: { type: 'string', description: 'New tone of voice' },
          toneExamples: { type: 'string', description: 'New tone examples' },
          additionalContext: { type: 'string', description: 'New additional context' },
          inboxReplyExamples: { type: 'string', description: 'New inbox reply examples' },
          commentReplyExamples: { type: 'string', description: 'New comment reply examples' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_saved_leads',
      description:
        'Return the user\'s most recent lead scan (same results as the Leads page). Use when they ask how many leads they have or to show saved results without rescanning. Shows a Scan for leads button if empty. Do NOT use when they ask to scan, rescan, or find new leads (use scan_leads instead).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scan_leads',
      description:
        'Run a fresh AI lead scan from cached post comments (same as the Leads page Scan button). Use only when the user explicitly asks to scan, rescan, or mine comments with AI intent scoring. For adding commenters as low-intent leads, use add_inbox_comments_to_leads instead.',
      parameters: {
        type: 'object',
        properties: {
          platform: platformParam,
          accountId: { type: 'string', description: 'Optional internal account id to scan one account.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_support_options',
      description:
        "Show support options in chat (send feedback, open a ticket, schedule a 15 minute Zoom call). Use when the user is stuck, reports an error you cannot fix, or asks for help/support/contact.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_brand_context_onboarding',
      description:
        'Add Set up brand context / Continue without setup buttons in chat when brand context is missing. You write the recommendation in your reply; this tool only adds the buttons (no duplicate text in the card).',
      parameters: {
        type: 'object',
        properties: {
          hasConnectedAccounts: {
            type: 'boolean',
            description: 'Whether user has connected social media accounts for AI analysis',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_guided_brand_setup',
      description:
        'Start guided brand context setup flow. Ask questions to fill brand context fields progressively. Use when user chooses to set up brand context from onboarding.',
      parameters: {
        type: 'object',
        properties: {
          autoFillFromAccounts: {
            type: 'boolean',
            description: 'Whether to attempt auto-filling from connected account analysis',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'collect_contextual_brand_info',
      description:
        'Add Set up brand context / Just create this post buttons when user uploads media without brand setup. You write ONE message in your reply (acknowledge upload once, ask topic, audience, tone). This tool only adds buttons; do not duplicate your text in the card.',
      parameters: {
        type: 'object',
        properties: {
          mediaType: {
            type: 'string',
            enum: ['image', 'video'],
            description: 'Type of media uploaded',
          },
        },
        required: ['mediaType'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_workspace_page',
      description:
        'Open a workspace page card in chat with a button: Brand, Leads, Team members, Support, or Brainstorm. Use when the user asks to open one of these pages and a richer in-chat tool (scan_leads, propose_brand_context_update, show_support_options) does not apply.',
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            enum: ['brand', 'leads', 'team', 'support', 'brainstorm'],
          },
        },
        required: ['page'],
        additionalProperties: false,
      },
    },
  },
];

function buildLeadsToolResponse(
  leads: ScannedLead[],
  scanned: number,
  message?: string,
  scannedAt?: string | null,
  accountId?: string | null,
  extra?: { newCount?: number; skippedExisting?: number; totalMatched?: number }
) {
  const highCount = leads.filter((l) => l.intent === 'high').length;
  const lowCount = leads.filter((l) => l.intent === 'low').length;
  return {
    result: {
      scanned,
      totalLeads: leads.length,
      highIntent: highCount,
      lowIntent: lowCount,
      newLeadsAdded: extra?.newCount ?? null,
      skippedExisting: extra?.skippedExisting ?? null,
      totalMatched: extra?.totalMatched ?? null,
      message,
      scannedAt: scannedAt ?? null,
      uiNote: 'Leads render in the card below. Do not list every lead again in text.',
    },
    artifacts:
      leads.length > 0
        ? leadsToChatArtifacts(leads, scanned, { lastScannedAt: scannedAt, accountId })
        : [],
  };
}

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
      const connectArtifact = await buildConnectPlatformsArtifact(ctx.userId);
      return {
        result: { accounts, missingPlatforms: connectArtifact.missing.map((m) => m.name) },
        artifacts: [
          { type: 'accounts', accounts },
          ...(connectArtifact.missing.length ? [connectArtifact] : []),
        ],
      };
    }

    case 'list_connect_platforms': {
      const artifact = await buildConnectPlatformsArtifact(ctx.userId);
      return {
        result: {
          connected: artifact.connected,
          missing: artifact.missing,
        },
        artifacts: [artifact],
      };
    }

    case 'get_inbox_comment_summary': {
      const days = resolveDaysFromArgs(args, 30);
      const platform = normalizePlatformArg(args.platform as string | undefined);
      const contentFilter = normalizeInboxContentFilter(args.contentFilter);
      const summary = await buildInboxCommentSummary(ctx.userId, days, platform, contentFilter);
      return { result: summary };
    }

    case 'list_recent_inbox': {
      const limit = Math.min(Math.max(Number(args.limit) || 12, 1), 25);
      const platform = normalizePlatformArg(args.platform as string | undefined);
      const contentFilter = normalizeInboxContentFilter(args.contentFilter);
      const artifact = await buildRecentInboxArtifact(ctx.userId, limit, platform, contentFilter);
      return {
        result: {
          count: artifact.items.length,
          contentFilter,
          uiNote: 'Comments are shown in the inbox card below. Do not list them again in your reply.',
        },
        artifacts: [artifact],
      };
    }

    case 'add_inbox_comments_to_leads': {
      const platform = normalizePlatformArg(args.platform as string | undefined);
      const commentIds = Array.isArray(args.commentIds)
        ? args.commentIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : undefined;
      const intentRaw = typeof args.intent === 'string' ? args.intent.trim().toLowerCase() : 'low';
      const intent: ScannedLead['intent'] =
        intentRaw === 'high' || intentRaw === 'medium' || intentRaw === 'low' ? intentRaw : 'low';
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
      const out = await addInboxCommentsToLeads(ctx.userId, {
        platform,
        commentIds,
        defaultIntent: intent,
        limit,
      });
      const scannedAt = new Date().toISOString();
      return buildLeadsToolResponse(out.leads, out.scanned, out.message, scannedAt, out.accountId, {
        newCount: out.newCount,
        skippedExisting: out.skippedExisting,
        totalMatched: out.totalMatched,
      });
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
      const account = await assertAccount(ctx.userId, accountId);

      const cached = (await getInboxCommentsFromDb(accountId)) ?? [];
      const filtered = cached
        .filter((c) => c.platformPostId === platformPostId && !c.isFromMe)
        .slice(0, limit)
        .map((row) => commentToPublic(row, platformLabel(account.platform)));
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
            title: 'Posting from chat',
            body: `Caption-only previews can be approved and published from chat on: ${textOnlyPlatformsSummary()}.\n\nThese platforms need media before posting: ${mediaRequiredPlatformsSummary()}. Suggest Composer; create Composer drafts only if the user asks.`,
          },
        ],
      };
    }

    case 'prepare_platform_post_drafts': {
      const drafts = Array.isArray(args.drafts) ? args.drafts : [];
      if (!drafts.length) throw new Error('At least one draft is required.');
      const allowComposerDrafts = args.allowComposerDrafts === true;
      const artifacts: AysopArtifact[] = [];
      const results: Record<string, unknown>[] = [];
      const skipped: Array<{ platform?: unknown; reason: string }> = [];
      const composerDraftRows: Record<string, unknown>[] = [];

      for (const raw of drafts.slice(0, 8)) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const platformArg = normalizePlatformArg(row.platform as string | undefined);
        const isMediaPlatform =
          platformArg != null
            ? platformRequiresMedia(platformArg)
            : false;

        if (allowComposerDrafts && isMediaPlatform) {
          composerDraftRows.push(row);
          continue;
        }

        try {
          const built = await buildComposerPostDraft(ctx.userId, row, {
            allowComposerOnly: allowComposerDrafts,
          });
          artifacts.push(built.artifact);
          results.push(built.result);
        } catch (e) {
          skipped.push({
            platform: row.platform,
            reason: e instanceof Error ? e.message : 'Could not prepare draft',
          });
        }
      }

      if (composerDraftRows.length) {
        const captions = composerDraftRows
          .map((r) => String(r.caption ?? '').trim())
          .filter(Boolean);
        const sharedCaption = captions[0] ?? '';
        try {
          const session = await buildComposerSessionDraft(ctx.userId, {
            caption: sharedCaption,
            platforms: composerDraftRows.map((r) => r.platform),
            postType: composerDraftRows.find((r) => r.postType)?.postType ?? 'photo',
          });
          artifacts.push(session.artifact);
          results.push(session.result);
        } catch (e) {
          skipped.push({
            reason: e instanceof Error ? e.message : 'Could not prepare Composer session draft',
          });
        }
      }

      if (!artifacts.length && !skipped.length) throw new Error('No valid drafts.');
      return {
        result: {
          drafts: results,
          skippedPlatforms: skipped,
          requiresUserApproval: true,
          note: 'Chat previews require Approve & publish. Composer drafts open with platforms and caption pre-filled.',
        },
        artifacts,
      };
    }

    case 'open_composer_draft': {
      const built = await buildComposerSessionDraft(ctx.userId, args);
      return {
        result: built.result,
        artifacts: [built.artifact],
      };
    }

    case 'get_brand_context': {
      const current = await loadBrandContext(ctx.userId);
      const fields = BRAND_CONTEXT_FIELDS.filter((f) => current[f.key]?.trim()).map((f) => ({
        label: f.label,
        value: current[f.key]!,
      }));
      if (!fields.length) {
        return {
          result: { isEmpty: true, note: 'No brand context set yet.' },
          artifacts: [
            {
              type: 'text_block',
              title: 'Brand context',
              body: 'No brand context yet. Tell me about your product, audience, and tone and I can set it up, or open the Brand page.',
              href: '/dashboard/brand',
              hrefLabel: 'Open Brand',
            },
          ],
        };
      }
      return {
        result: { fields },
        artifacts: [{ type: 'brand_context', fields, href: '/dashboard/brand' }],
      };
    }

    case 'propose_brand_context_update': {
      const current = await loadBrandContext(ctx.userId);
      const changes: Array<{ field: string; label: string; current: string; proposed: string }> = [];
      for (const { key, label } of BRAND_CONTEXT_FIELDS) {
        const raw = args[key];
        if (typeof raw !== 'string') continue;
        let proposed = raw.trim();
        if (!proposed) continue;
        const cur = (current[key] ?? '').trim();
        if (key === 'productDescription' && cur) {
          proposed = surgicalProductDescriptionUpdate(cur, proposed);
        }
        if (shouldSkipCosmeticRewrite(cur, proposed)) continue;
        if (proposed === cur) continue;
        changes.push({ field: key, label, current: current[key] ?? '', proposed });
      }
      if (!changes.length) {
        return {
          result: {
            note: 'No brand context changes detected. Ask the user what to update (product, audience, or tone).',
          },
        };
      }
      return {
        result: {
          requiresUserApproval: true,
          changedFields: changes.map((c) => c.field),
          note: 'An editable Approve card is shown in chat. Nothing is saved until the user clicks Approve. Do not claim the brand context was updated.',
        },
        artifacts: [{ type: 'brand_context_update', changes }],
      };
    }

    case 'get_saved_leads': {
      const saved = await getSavedLeadsScan(ctx.userId);
      if (!saved) {
        return {
          result: {
            totalLeads: 0,
            note: 'No saved leads yet. Ask to add inbox comments to leads, or open the Leads page.',
          },
          artifacts: [],
        };
      }
      return buildLeadsToolResponse(
        saved.leads,
        saved.scanned,
        saved.message,
        saved.scannedAt,
        saved.accountId
      );
    }

    case 'scan_leads': {
      let accountId: string | null = null;
      try {
        accountId = await resolveAccountId(ctx.userId, args);
      } catch {
        accountId = null;
      }
      const { leads, scanned, message } = await scanLeads(ctx.userId, accountId);
      const scannedAt = new Date().toISOString();
      await saveLeadsScan(ctx.userId, { accountId, scanned, leads, message });
      return buildLeadsToolResponse(leads, scanned, message, scannedAt, accountId);
    }

    case 'show_support_options': {
      return {
        result: {
          options: ['feedback', 'ticket', 'zoom'],
          note: 'Support card shown in chat with Send feedback, Open a ticket, and Schedule a Zoom call buttons.',
        },
        artifacts: [{ type: 'support_options', href: '/dashboard/support' }],
      };
    }

    case 'show_brand_context_onboarding': {
      const hasConnectedAccounts = Boolean(args.hasConnectedAccounts);

      return {
        result: { onboardingShown: true, hasConnectedAccounts },
        artifacts: [
          {
            type: 'interactive_card',
            actions: [
              {
                type: 'button',
                label: 'Set up brand context',
                action: 'brand_setup_start',
                style: 'primary',
              },
              {
                type: 'button',
                label: 'Continue without setup',
                action: 'brand_setup_skip',
                style: 'secondary',
              },
            ],
          },
        ],
      };
    }

    case 'start_guided_brand_setup': {
      const autoFillFromAccounts = Boolean(args.autoFillFromAccounts);
      const current = await loadBrandContext(ctx.userId);

      const missingFields = BRAND_CONTEXT_FIELDS.filter(
        (field) => !String(current[field.key] ?? '').trim()
      );

      if (missingFields.length === 0) {
        return {
          result: { alreadyComplete: true },
          artifacts: [
            {
              type: 'text_block',
              title: 'Brand context complete',
              body: 'Your brand context is already set up! You can review or update it anytime.',
              href: '/dashboard/brand',
              hrefLabel: 'Review Brand Context',
            },
          ],
        };
      }

      let autoFillResult = null;
      if (autoFillFromAccounts) {
        try {
          autoFillResult = await autoFillBrandContextFromAccounts(ctx.userId);
        } catch (error) {
          console.error('[Brand setup auto-fill]', error);
        }
      }

      const proposed = autoFillResult?.brandContext ?? {};
      const changes: Array<{ field: string; label: string; current: string; proposed: string }> = [];

      for (const { key, label } of BRAND_CONTEXT_FIELDS) {
        const cur = String(current[key] ?? '').trim();
        if (cur) continue;
        const prop = String(proposed[key as keyof typeof proposed] ?? '').trim();
        if (prop.length >= 8) {
          changes.push({ field: key, label, current: cur, proposed: prop });
        }
      }

      if (!changes.length) {
        for (const key of missingBrandContextFieldKeys(current, proposed)) {
          const meta = BRAND_CONTEXT_FIELDS.find((f) => f.key === key);
          if (!meta) continue;
          changes.push({
            field: meta.key,
            label: meta.label,
            current: '',
            proposed: '',
          });
        }
      }

      if (!changes.length) {
        return {
          result: { setupComplete: true },
          artifacts: [
            {
              type: 'text_block',
              title: 'Brand context complete',
              body: 'Your brand context is already set up.',
            },
          ],
        };
      }

      const fromAccounts = (autoFillResult?.sources?.length ?? 0) > 0;
      const analyzedNote = fromAccounts
        ? `Analyzed: ${autoFillResult!.sources.join(', ')}.`
        : 'Fill in the fields below. Connect a platform and sync posts for automatic suggestions next time.';

      return {
        result: {
          setupStarted: true,
          autoFillSuccess: autoFillResult?.success ?? false,
          autoFillConfidence: autoFillResult?.confidence ?? 0,
          sources: autoFillResult?.sources ?? [],
          requiresUserApproval: true,
          note: analyzedNote,
        },
        artifacts: [
          {
            type: 'brand_context_update',
            changes,
          },
        ],
      };
    }

    case 'collect_contextual_brand_info': {
      const mediaType = String(args.mediaType ?? 'image') as 'image' | 'video';
      const current = await loadBrandContext(ctx.userId);

      const hasMinimalContext =
        !!current.productDescription?.trim() && !!current.targetAudience?.trim();

      if (hasMinimalContext) {
        return {
          result: { contextualPrompt: true, hasMinimalContext: true, buttonsOnly: false },
          artifacts: [],
        };
      }

      return {
        result: { contextualPrompt: true, hasMinimalContext: false, buttonsOnly: true, mediaType },
        artifacts: [
          {
            type: 'interactive_card',
            actions: [
              {
                type: 'button',
                label: 'Set up brand context',
                action: 'brand_setup_from_media',
                style: 'primary',
              },
              {
                type: 'button',
                label: 'Just create this post',
                action: 'create_post_only',
                style: 'secondary',
              },
            ],
          },
        ],
      };
    }

    case 'open_workspace_page': {
      const page = String(args.page ?? '').toLowerCase() as AppViewId;
      if (!WORKSPACE_PAGE_VIEWS.has(page)) {
        throw new Error('Unknown page. Use brand, leads, team, support, or brainstorm.');
      }
      return {
        result: { opened: page },
        artifacts: [appViewArtifact(page)],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
