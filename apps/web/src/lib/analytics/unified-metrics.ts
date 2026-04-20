import { prisma } from '@/lib/db';
export type {
  UnifiedKpiSummary,
  UnifiedChartPoint,
  UnifiedChartData,
  UnifiedTopPost,
  UnifiedHistoryPost,
  UnifiedSummaryResponse,
  UnifiedEngagementDay,
  UnifiedActivityDay,
} from './unified-metrics-types';
export { PLATFORM_LABEL, PLATFORM_COLOR, CHART_PLATFORMS } from './unified-metrics-types';
import { PLATFORM_LABEL, CHART_PLATFORMS } from './unified-metrics-types';
import type {
  UnifiedKpiSummary,
  UnifiedChartData,
  UnifiedChartPoint,
  UnifiedTopPost,
  UnifiedHistoryPost,
} from './unified-metrics-types';

function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** Inclusive calendar window + equally long prior window (for growth %). */
export type UnifiedPeriod = { since: Date; until: Date; prevSince: Date; prevUntil: Date };

function periodBounds(days: number): UnifiedPeriod {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - days);
  return { since, until, prevSince, prevUntil };
}

function parseLocalYmdStart(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseLocalYmdEnd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(y, m - 1, d, 23, 59, 59, 999);
  return x;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/**
 * Build the reporting window. Prefer explicit `since`/`until` (YYYY-MM-DD, local calendar);
 * otherwise use rolling `days` (7, 30, or 90) like the legacy summary API.
 */
export function resolveUnifiedPeriod(params: {
  days?: number;
  since?: string | null;
  until?: string | null;
}): UnifiedPeriod {
  const sIn = params.since?.trim() ?? '';
  const uIn = params.until?.trim() ?? '';
  if (sIn && uIn && YMD.test(sIn) && YMD.test(uIn)) {
    let since = parseLocalYmdStart(sIn);
    let until = parseLocalYmdEnd(uIn);
    if (since.getTime() > until.getTime()) return periodBounds(30);
    const spanDays = Math.floor((until.getTime() - since.getTime()) / 86_400_000) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      since = new Date(until);
      since.setDate(since.getDate() - (MAX_RANGE_DAYS - 1));
      since.setHours(0, 0, 0, 0);
    }
    const effectiveSpan = Math.floor((until.getTime() - since.getTime()) / 86_400_000) + 1;
    const prevUntil = new Date(since);
    prevUntil.setDate(prevUntil.getDate() - 1);
    prevUntil.setHours(23, 59, 59, 999);
    const prevSince = new Date(prevUntil);
    prevSince.setDate(prevSince.getDate() - (effectiveSpan - 1));
    prevSince.setHours(0, 0, 0, 0);
    return { since, until, prevSince, prevUntil };
  }
  const d = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  return periodBounds(d);
}

function sumEngagement(p: {
  likeCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
  repostsCount: number | null;
}): number {
  return (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0) + (p.repostsCount ?? 0);
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────

export async function getUnifiedKpiSummary(userId: string, period: UnifiedPeriod): Promise<UnifiedKpiSummary> {
  const { since, until, prevSince, prevUntil } = period;

  // Latest follower count per social account (most recent snapshot overall)
  const allSnapshots = await prisma.accountMetricSnapshot.findMany({
    where: { userId },
    select: { socialAccountId: true, followersCount: true, fansCount: true, metricDate: true },
    orderBy: { metricDate: 'desc' },
  });

  const seenAccounts = new Set<string>();
  const seenStartAccounts = new Set<string>();
  let totalAudience = 0;
  let startAudience = 0;
  const sinceDateStr = since.toISOString().slice(0, 10);

  for (const s of allSnapshots) {
    if (!seenAccounts.has(s.socialAccountId)) {
      seenAccounts.add(s.socialAccountId);
      totalAudience += s.followersCount ?? s.fansCount ?? 0;
    }
    if (s.metricDate <= sinceDateStr && !seenStartAccounts.has(s.socialAccountId)) {
      seenStartAccounts.add(s.socialAccountId);
      startAudience += s.followersCount ?? s.fansCount ?? 0;
    }
  }

  // Current period posts
  const [currentPosts, prevPosts, linkedinCurrent, linkedinPrev] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
      select: {
        impressions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: prevSince, lte: prevUntil } },
      select: {
        impressions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: since, lte: until } },
      select: { impressions: true, comments: true, shares: true },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: prevSince, lte: prevUntil } },
      select: { impressions: true, comments: true, shares: true },
    }),
  ]);

  const totalImpressions =
    currentPosts.reduce((s, p) => s + (p.impressions ?? 0), 0) +
    linkedinCurrent.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalEngagement =
    currentPosts.reduce((s, p) => s + sumEngagement(p), 0) +
    linkedinCurrent.reduce((s, p) => s + (p.comments ?? 0) + (p.shares ?? 0), 0);
  const totalPosts = currentPosts.length + linkedinCurrent.length;

  const prevImpressions =
    prevPosts.reduce((s, p) => s + (p.impressions ?? 0), 0) +
    linkedinPrev.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const prevEngagement =
    prevPosts.reduce((s, p) => s + sumEngagement(p), 0) +
    linkedinPrev.reduce((s, p) => s + (p.comments ?? 0) + (p.shares ?? 0), 0);
  const prevPostsCount = prevPosts.length + linkedinPrev.length;

  return {
    totalAudience,
    totalImpressions,
    totalEngagement,
    totalPosts,
    audienceGrowthPercentage: growthPct(totalAudience, startAudience),
    impressionsGrowthPercentage: growthPct(totalImpressions, prevImpressions),
    engagementGrowthPercentage: growthPct(totalEngagement, prevEngagement),
    postsGrowthPercentage: growthPct(totalPosts, prevPostsCount),
  };
}

// ─── Chart Data ───────────────────────────────────────────────────────────────

function emptyChartPoint(ymd: string): UnifiedChartPoint {
  return {
    date: ymd,
    Instagram: 0,
    Meta: 0,
    X: 0,
    LinkedIn: 0,
    YouTube: 0,
    TikTok: 0,
    Pinterest: 0,
  };
}

/** One row per calendar day in `[since, until]` (UTC YYYY-MM-DD buckets, same as legacy chart). */
function buildEmptyDateRangeMap(since: Date, until: Date): Record<string, UnifiedChartPoint> {
  const dateMap: Record<string, UnifiedChartPoint> = {};
  const cursor = new Date(since);
  while (cursor <= until) {
    const d = cursor.toISOString().slice(0, 10);
    dateMap[d] = emptyChartPoint(d);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dateMap;
}

export async function getUnifiedChartData(userId: string, period: UnifiedPeriod): Promise<UnifiedChartData> {
  const { since, until } = period;

  const [posts, linkedinPosts] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
      select: { publishedAt: true, impressions: true, platform: true },
      orderBy: { publishedAt: 'asc' },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: since, lte: until } },
      select: { fetchedAt: true, impressions: true },
    }),
  ]);

  const dateMap = buildEmptyDateRangeMap(since, until);

  for (const post of posts) {
    const d = new Date(post.publishedAt).toISOString().slice(0, 10);
    const label = PLATFORM_LABEL[post.platform ?? ''] ?? null;
    if (label && dateMap[d] && label in dateMap[d]) {
      (dateMap[d] as Record<string, number>)[label] += post.impressions ?? 0;
    }
  }

  for (const pp of linkedinPosts) {
    const d = new Date(pp.fetchedAt).toISOString().slice(0, 10);
    if (dateMap[d]) dateMap[d].LinkedIn += pp.impressions ?? 0;
  }

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Snapshot-based audience series has 0 on days with no DB row. Carry the last known total forward
 * (and extend the first known value backward) so missing sync days do not look like follower loss.
 */
function forwardFillAudienceSnapshotGaps(sortedRows: UnifiedChartData): UnifiedChartData {
  const out = sortedRows.map((row) => ({ ...row }));
  for (const key of CHART_PLATFORMS) {
    const nums = out.map((r) => Number((r as Record<string, number>)[key] ?? 0));
    let firstIdx = -1;
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] > 0) {
        firstIdx = i;
        break;
      }
    }
    if (firstIdx < 0) continue;

    const firstVal = nums[firstIdx];
    for (let i = 0; i < firstIdx; i++) {
      (out[i] as Record<string, number>)[key] = firstVal;
    }

    let last = firstVal;
    for (let i = firstIdx; i < out.length; i++) {
      const v = Number((out[i] as Record<string, number>)[key] ?? 0);
      if (v > 0) {
        last = v;
      } else {
        (out[i] as Record<string, number>)[key] = last;
      }
    }
  }
  return out;
}

/** Daily audience (followers or fans) from metric snapshots, summed across accounts per platform. */
export async function getUnifiedAudienceChartData(userId: string, period: UnifiedPeriod): Promise<UnifiedChartData> {
  const { since, until } = period;
  const dateMap = buildEmptyDateRangeMap(since, until);
  const keys = Object.keys(dateMap).sort();
  if (keys.length === 0) return [];

  const snapshots = await prisma.accountMetricSnapshot.findMany({
    where: { userId, metricDate: { gte: keys[0], lte: keys[keys.length - 1] } },
    select: { metricDate: true, platform: true, followersCount: true, fansCount: true },
  });

  for (const s of snapshots) {
    const label = PLATFORM_LABEL[s.platform] ?? null;
    if (!label || !dateMap[s.metricDate]) continue;
    const v = (s.followersCount ?? s.fansCount ?? 0) as number;
    if (label in dateMap[s.metricDate]) {
      (dateMap[s.metricDate] as Record<string, number>)[label] += v;
    }
  }

  const sorted = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  return forwardFillAudienceSnapshotGaps(sorted);
}

/** Daily engagement from synced posts (and LinkedIn PostPerformance rows) by platform. */
export async function getUnifiedEngagementChartData(userId: string, period: UnifiedPeriod): Promise<UnifiedChartData> {
  const { since, until } = period;

  const [posts, linkedinPosts] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
      select: {
        publishedAt: true,
        platform: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
      orderBy: { publishedAt: 'asc' },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: since, lte: until } },
      select: { fetchedAt: true, comments: true, shares: true },
    }),
  ]);

  const dateMap = buildEmptyDateRangeMap(since, until);

  for (const post of posts) {
    const d = new Date(post.publishedAt).toISOString().slice(0, 10);
    const label = PLATFORM_LABEL[post.platform ?? ''] ?? null;
    if (label && dateMap[d] && label in dateMap[d]) {
      (dateMap[d] as Record<string, number>)[label] += sumEngagement(post);
    }
  }

  for (const pp of linkedinPosts) {
    const d = new Date(pp.fetchedAt).toISOString().slice(0, 10);
    if (dateMap[d]) {
      dateMap[d].LinkedIn += (pp.comments ?? 0) + (pp.shares ?? 0);
    }
  }

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Top Posts ────────────────────────────────────────────────────────────────

export async function getUnifiedTopPosts(userId: string, period: UnifiedPeriod, limit = 5): Promise<UnifiedTopPost[]> {
  const { since, until } = period;

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      id: true,
      content: true,
      permalinkUrl: true,
      thumbnailUrl: true,
      impressions: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
      publishedAt: true,
      platform: true,
    },
    orderBy: [{ likeCount: 'desc' }, { impressions: 'desc' }],
    take: limit * 4,
  });

  return posts
    .map((p) => ({
      id: p.id,
      platform: PLATFORM_LABEL[p.platform ?? ''] ?? (p.platform ?? 'Unknown'),
      caption: p.content ?? '',
      url: p.permalinkUrl,
      thumbnailUrl: p.thumbnailUrl,
      totalEngagement: sumEngagement(p),
      impressions: p.impressions ?? 0,
      likes: p.likeCount ?? 0,
      comments: p.commentsCount ?? 0,
      shares: (p.sharesCount ?? 0) + (p.repostsCount ?? 0),
      postedAt: p.publishedAt.toISOString(),
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, limit);
}

// ─── Combined History ─────────────────────────────────────────────────────────

export async function getUnifiedPostsHistory(
  userId: string,
  period: UnifiedPeriod,
  limit = 60
): Promise<UnifiedHistoryPost[]> {
  const { since, until } = period;

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      id: true,
      content: true,
      permalinkUrl: true,
      thumbnailUrl: true,
      impressions: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
      publishedAt: true,
      platform: true,
      mediaType: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  return posts.map((p) => ({
    id: p.id,
    platform: PLATFORM_LABEL[p.platform ?? ''] ?? (p.platform ?? 'Unknown'),
    caption: p.content ?? '',
    url: p.permalinkUrl,
    thumbnailUrl: p.thumbnailUrl,
    likes: p.likeCount ?? 0,
    comments: p.commentsCount ?? 0,
    shares: (p.sharesCount ?? 0) + (p.repostsCount ?? 0),
    impressions: p.impressions ?? 0,
    totalEngagement: sumEngagement(p),
    postedAt: p.publishedAt.toISOString(),
    mediaType: p.mediaType,
  }));
}

// ─── Engagement Breakdown (likes / comments / shares / reposts by day) ────────

import type { UnifiedEngagementDay, UnifiedActivityDay } from './unified-metrics-types';

export async function getUnifiedEngagementBreakdown(
  userId: string,
  period: UnifiedPeriod
): Promise<UnifiedEngagementDay[]> {
  const { since, until } = period;

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      publishedAt: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
    },
    orderBy: { publishedAt: 'asc' },
  });

  const emptyDay = (): Omit<UnifiedEngagementDay, 'date'> => ({ likes: 0, comments: 0, shares: 0, reposts: 0 });
  const map: Record<string, UnifiedEngagementDay> = {};
  const cursor = new Date(since);
  while (cursor <= until) {
    const d = cursor.toISOString().slice(0, 10);
    map[d] = { date: d, ...emptyDay() };
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const p of posts) {
    const d = new Date(p.publishedAt).toISOString().slice(0, 10);
    if (!map[d]) continue;
    map[d].likes += p.likeCount ?? 0;
    map[d].comments += p.commentsCount ?? 0;
    map[d].shares += p.sharesCount ?? 0;
    map[d].reposts += p.repostsCount ?? 0;
  }

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Posts Breakdown (daily per-platform per-type counts, uncapped) ───────────

type PostTypeBucket = 'reels' | 'image' | 'carousel';

/**
 * Classify a post into the Console "Posts" chart buckets. Mirrors
 * `classifyConsolePostType` in the Console page so server and client agree.
 */
function classifyPostBucket(
  mediaType: string | null,
  permalinkUrl: string | null,
  platform: string | null
): PostTypeBucket | null {
  const plat = String(platform ?? '').toUpperCase();
  const url = String(permalinkUrl ?? '').toLowerCase();
  if (plat === 'YOUTUBE' && url.includes('/shorts/')) return 'reels';
  const mt = String(mediaType ?? '').toUpperCase();
  if (!mt) {
    // X text-only tweets (and some LinkedIn / Pinterest rows) have no mediaType
    // but must still roll into the posts chart so those platforms aren't 0.
    if (plat === 'TWITTER' || plat === 'LINKEDIN' || plat === 'PINTEREST') return 'image';
    return null;
  }
  if (mt === 'REEL' || mt === 'VIDEO' || mt === 'SHORT') return 'reels';
  if (mt === 'CAROUSEL' || mt === 'ALBUM' || mt === 'CAROUSEL_ALBUM' || mt.includes('CAROUSEL')) return 'carousel';
  if (
    mt === 'IMAGE' || mt === 'PHOTO' || mt === 'PIN' || mt === 'PIN_IMAGE' ||
    mt === 'STORY' || mt === 'TEXT' || mt === 'NOTE'
  ) return 'image';
  return null;
}

export async function getUnifiedPostsBreakdown(
  userId: string,
  period: UnifiedPeriod
): Promise<import('./unified-metrics-types').UnifiedPostsBreakdownDay[]> {
  const { since, until } = period;

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      publishedAt: true,
      platform: true,
      mediaType: true,
      permalinkUrl: true,
    },
  });

  const emptyPlatformMap = (): Record<string, number> => {
    const obj: Record<string, number> = {};
    for (const p of CHART_PLATFORMS) obj[p] = 0;
    return obj;
  };

  const map: Record<string, import('./unified-metrics-types').UnifiedPostsBreakdownDay> = {};
  const cursor = new Date(since);
  while (cursor <= until) {
    const d = cursor.toISOString().slice(0, 10);
    map[d] = {
      date: d,
      reels: emptyPlatformMap(),
      image: emptyPlatformMap(),
      carousel: emptyPlatformMap(),
      all: emptyPlatformMap(),
    };
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const post of posts) {
    const d = new Date(post.publishedAt).toISOString().slice(0, 10);
    const row = map[d];
    if (!row) continue;
    const label = PLATFORM_LABEL[post.platform ?? ''] ?? null;
    if (!label) continue;
    const bucket = classifyPostBucket(post.mediaType, post.permalinkUrl, post.platform);
    if (!bucket) continue;
    row[bucket][label] = (row[bucket][label] ?? 0) + 1;
    row.all[label] = (row.all[label] ?? 0) + 1;
  }

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Activity Breakdown (posts by day) ────────────────────────────────────────

export async function getUnifiedActivityBreakdown(
  userId: string,
  period: UnifiedPeriod
): Promise<UnifiedActivityDay[]> {
  const { since, until } = period;

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: { publishedAt: true },
    orderBy: { publishedAt: 'asc' },
  });

  const map: Record<string, UnifiedActivityDay> = {};
  const cursor = new Date(since);
  while (cursor <= until) {
    const d = cursor.toISOString().slice(0, 10);
    map[d] = { date: d, posts: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const p of posts) {
    const d = new Date(p.publishedAt).toISOString().slice(0, 10);
    if (map[d]) map[d].posts += 1;
  }

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}
