/**
 * Dashboard-equivalent analytics for iZop AI (same source as /dashboard insights).
 */
import { NextRequest } from 'next/server';
import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import {
  resolveUnifiedPeriod,
  getUnifiedKpiSummary,
  getUnifiedEngagementChartData,
} from '@/lib/analytics/unified-metrics';
import { PLATFORM_LABEL } from '@/lib/analytics/unified-metrics-types';

export type DashboardDateRange = { start: string; end: string };

export type DashboardAnalyticsReport = {
  accountId: string;
  platform: string;
  platformLabel: string;
  username: string | null;
  dateRange: DashboardDateRange;
  kpis: {
    followers: number;
    newFollowers: number;
    views: number;
    engagement: number;
    posts: number;
    impressions?: number;
    reach?: number;
  };
  chartSeries: {
    followers: Array<{ date: string; value: number }>;
    views: Array<{ date: string; value: number }>;
    engagement: Array<{ date: string; value: number }>;
  };
  insightsHint?: string;
  source: 'dashboard_insights' | 'synced_db';
};

function sumSeries(series: Array<{ date: string; value: number }>): number {
  return series.reduce((s, p) => s + (Number(p.value) || 0), 0);
}

function sortSeries(series: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

function followersIncreaseInRange(series: Array<{ date: string; value: number }>): number {
  const sorted = sortSeries(series);
  if (sorted.length < 2) return 0;
  return Math.max(0, sorted[sorted.length - 1].value - sorted[0].value);
}

function sumEngagementFromPost(p: {
  interactions?: number | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  sharesCount?: number | null;
  repostsCount?: number | null;
}): number {
  const detailed =
    (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0) + (p.repostsCount ?? 0);
  const aggregate = p.interactions ?? 0;
  return detailed > 0 ? detailed : Math.max(0, aggregate);
}

function engagementSeriesFromPosts(
  posts: Array<{
    publishedAt: Date;
    interactions?: number | null;
    likeCount?: number | null;
    commentsCount?: number | null;
    sharesCount?: number | null;
    repostsCount?: number | null;
  }>
): Array<{ date: string; value: number }> {
  const map: Record<string, number> = {};
  for (const p of posts) {
    const d = p.publishedAt.toISOString().slice(0, 10);
    map[d] = (map[d] ?? 0) + sumEngagementFromPost(p);
  }
  return Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function asSeries(raw: unknown): Array<{ date: string; value: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const row = p as { date?: string; value?: unknown };
      const value = Number(row.value);
      if (!row.date || !Number.isFinite(value)) return null;
      return { date: row.date, value };
    })
    .filter((x): x is { date: string; value: number } => x != null);
}

function fillDateRangeSeries(
  series: Array<{ date: string; value: number }>,
  dateRange: DashboardDateRange
): Array<{ date: string; value: number }> {
  const map = new Map(series.map((p) => [p.date, p.value]));
  const out: Array<{ date: string; value: number }> = [];
  const cursor = new Date(`${dateRange.start}T12:00:00`);
  const end = new Date(`${dateRange.end}T12:00:00`);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    out.push({ date: d, value: map.get(d) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function resolveDashboardDateRange(args: {
  days?: number;
  since?: string;
  until?: string;
}): DashboardDateRange {
  const period = resolveUnifiedPeriod({
    days: args.days,
    since: args.since ?? null,
    until: args.until ?? null,
  });
  return {
    start: period.since.toISOString().slice(0, 10),
    end: period.until.toISOString().slice(0, 10),
  };
}

export async function fetchAccountInsightsPayload(
  userId: string,
  accountId: string,
  dateRange: DashboardDateRange
): Promise<Record<string, unknown>> {
  const { GET } = await import('@/app/api/social/accounts/[id]/insights/route');
  const url = new URL(`http://internal/api/social/accounts/${accountId}/insights`);
  url.searchParams.set('since', dateRange.start);
  url.searchParams.set('until', dateRange.end);
  const req = new NextRequest(url, {
    headers: {
      'X-Internal-Prisma-User-Id': userId,
      'X-Cron-Secret': process.env.CRON_SECRET ?? '',
    },
  });
  const res = await GET(req, { params: Promise.resolve({ id: accountId }) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(body.message ?? 'Could not load dashboard insights for this account.'));
  }
  return body;
}

export async function buildDashboardAnalyticsReport(
  userId: string,
  accountId: string,
  dateRange?: DashboardDateRange
): Promise<DashboardAnalyticsReport> {
  const range = dateRange ?? getDefaultAnalyticsDateRange();
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, platform: true, username: true },
  });
  if (!account) throw new Error('Account not found or not connected to your workspace.');

  const [insights, posts, period] = await Promise.all([
    fetchAccountInsightsPayload(userId, accountId, range),
    prisma.importedPost.findMany({
      where: {
        socialAccountId: accountId,
        publishedAt: {
          gte: new Date(`${range.start}T00:00:00`),
          lte: new Date(`${range.end}T23:59:59.999`),
        },
      },
      select: {
        publishedAt: true,
        impressions: true,
        interactions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    Promise.resolve(resolveUnifiedPeriod({ since: range.start, until: range.end })),
  ]);

  const followersSeries = fillDateRangeSeries(
    asSeries(insights.followersTimeSeries),
    range
  );
  let viewsSeries = fillDateRangeSeries(asSeries(insights.impressionsTimeSeries), range);
  let engagementSeries = fillDateRangeSeries(engagementSeriesFromPosts(posts), range);

  const igTotals = insights.instagramInteractionTotals as
    | { totalInteractions?: number; likes?: number; comments?: number; shares?: number }
    | undefined;
  const twitterTotals = insights.twitterTotals as
    | { impressions?: number; engagements?: number }
    | undefined;

  let views = Number(insights.impressionsTotal ?? 0);
  if (!views) views = sumSeries(viewsSeries);
  if (!views && account.platform === 'INSTAGRAM') {
    views = Number(insights.instagramAccountVideoViewsTotal ?? 0);
  }
  if (!views && twitterTotals?.impressions) views = Number(twitterTotals.impressions);

  let engagement = sumSeries(engagementSeries);
  if (!engagement && igTotals?.totalInteractions) engagement = Number(igTotals.totalInteractions);
  if (!engagement && twitterTotals?.engagements) engagement = Number(twitterTotals.engagements);

  if (engagementSeries.every((p) => p.value === 0) && engagement > 0 && posts.length > 0) {
    engagementSeries = fillDateRangeSeries(engagementSeriesFromPosts(posts), range);
  }
  if (viewsSeries.every((p) => p.value === 0) && views > 0) {
    viewsSeries = [{ date: range.start, value: views }, { date: range.end, value: views }];
  }

  const followers = Number(insights.followers ?? 0);
  const newFollowers = followersIncreaseInRange(followersSeries);
  const reach = Number(insights.reachTotal ?? 0) || undefined;

  const platformLabel = PLATFORM_LABEL[account.platform] ?? account.platform;

  const unifiedEngagement = await getUnifiedEngagementChartData(userId, period, [accountId]);
  const platformEngagementSeries = unifiedEngagement.map((row) => ({
    date: row.date,
    value: Number((row as Record<string, number>)[platformLabel] ?? 0),
  }));
  if (platformEngagementSeries.some((p) => p.value > 0)) {
    engagementSeries = fillDateRangeSeries(platformEngagementSeries, range);
    if (!engagement) engagement = sumSeries(engagementSeries);
  }

  return {
    accountId: account.id,
    platform: account.platform,
    platformLabel,
    username: account.username,
    dateRange: range,
    kpis: {
      followers,
      newFollowers,
      views,
      engagement,
      posts: posts.length,
      impressions: views,
      reach: reach || undefined,
    },
    chartSeries: {
      followers: followersSeries,
      views: viewsSeries,
      engagement: engagementSeries,
    },
    insightsHint: typeof insights.insightsHint === 'string' ? insights.insightsHint : undefined,
    source: 'dashboard_insights',
  };
}

export async function buildLightweightDashboardReport(
  userId: string,
  accountId: string,
  dateRange?: DashboardDateRange
): Promise<DashboardAnalyticsReport> {
  const range = dateRange ?? getDefaultAnalyticsDateRange();
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, platform: true, username: true },
  });
  if (!account) throw new Error('Account not found or not connected to your workspace.');

  const rangeStart = new Date(`${range.start}T00:00:00`);
  const rangeEnd = new Date(`${range.end}T23:59:59.999`);

  const [posts, latestSnapshot, startSnapshot] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccountId: accountId, publishedAt: { gte: rangeStart, lte: rangeEnd } },
      select: {
        publishedAt: true,
        impressions: true,
        interactions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    prisma.accountMetricSnapshot.findFirst({
      where: { socialAccountId: accountId },
      orderBy: { metricDate: 'desc' },
      select: { followersCount: true, fansCount: true, metricDate: true },
    }),
    prisma.accountMetricSnapshot.findFirst({
      where: { socialAccountId: accountId, metricDate: { lte: range.start } },
      orderBy: { metricDate: 'desc' },
      select: { followersCount: true, fansCount: true },
    }),
  ]);

  const followers = latestSnapshot?.followersCount ?? latestSnapshot?.fansCount ?? 0;
  const startFollowers = startSnapshot?.followersCount ?? startSnapshot?.fansCount ?? followers;
  const newFollowers = Math.max(0, followers - startFollowers);

  const views = posts.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const engagement = posts.reduce((s, p) => s + sumEngagementFromPost(p), 0);
  const engagementSeries = fillDateRangeSeries(engagementSeriesFromPosts(posts), range);
  const viewsSeries = fillDateRangeSeries(
    posts.reduce(
      (acc, p) => {
        const d = p.publishedAt.toISOString().slice(0, 10);
        const row = acc.find((x) => x.date === d);
        const v = p.impressions ?? 0;
        if (row) row.value += v;
        else acc.push({ date: d, value: v });
        return acc;
      },
      [] as Array<{ date: string; value: number }>
    ),
    range
  );

  const platformLabel = PLATFORM_LABEL[account.platform] ?? account.platform;

  return {
    accountId: account.id,
    platform: account.platform,
    platformLabel,
    username: account.username,
    dateRange: range,
    kpis: {
      followers,
      newFollowers,
      views,
      engagement,
      posts: posts.length,
      impressions: views,
    },
    chartSeries: {
      followers: fillDateRangeSeries(
        latestSnapshot
          ? [
              { date: range.start, value: startFollowers },
              { date: range.end, value: followers },
            ]
          : [],
        range
      ),
      views: viewsSeries,
      engagement: engagementSeries,
    },
    insightsHint: 'Totals from synced posts and follower snapshots in your workspace (fast path).',
    source: 'synced_db',
  };
}

const INSIGHTS_BUDGET_MS = Number(process.env.IZOP_INSIGHTS_BUDGET_MS) || 22_000;

/** Full dashboard insights with timeout; falls back to synced DB metrics. */
export async function buildDashboardAnalyticsReportSafe(
  userId: string,
  accountId: string,
  dateRange?: DashboardDateRange
): Promise<DashboardAnalyticsReport> {
  try {
    return await Promise.race([
      buildDashboardAnalyticsReport(userId, accountId, dateRange),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('insights_timeout')), INSIGHTS_BUDGET_MS);
      }),
    ]);
  } catch {
    return buildLightweightDashboardReport(userId, accountId, dateRange);
  }
}

/** Fast cross-platform summary from DB (no live platform API calls). */
export async function buildFastAllAccountsDashboardReports(
  userId: string,
  dateRange?: DashboardDateRange
): Promise<DashboardAnalyticsReport[]> {
  const range = dateRange ?? getDefaultAnalyticsDateRange();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!accounts.length) return [];
  return Promise.all(
    accounts.map((acc) => buildLightweightDashboardReport(userId, acc.id, range))
  );
}

export async function buildAllAccountsDashboardReports(
  userId: string,
  dateRange?: DashboardDateRange
): Promise<DashboardAnalyticsReport[]> {
  const range = dateRange ?? getDefaultAnalyticsDateRange();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const reports: DashboardAnalyticsReport[] = [];
  for (const acc of accounts) {
    try {
      reports.push(await buildDashboardAnalyticsReport(userId, acc.id, range));
    } catch {
      /* skip broken account */
    }
  }
  return reports;
}

export async function buildCrossPlatformKpiSummary(
  userId: string,
  dateRange?: DashboardDateRange
): Promise<{
  dateRange: DashboardDateRange;
  kpi: Awaited<ReturnType<typeof getUnifiedKpiSummary>>;
}> {
  const range = dateRange ?? getDefaultAnalyticsDateRange();
  const period = resolveUnifiedPeriod({ since: range.start, until: range.end });
  const kpi = await getUnifiedKpiSummary(userId, period);
  return { dateRange: range, kpi };
}

export function platformMatchesRequest(requested: Platform | null, accountPlatform: Platform): boolean {
  if (!requested) return true;
  return requested === accountPlatform;
}
