import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  getUnifiedKpiSummary,
  getUnifiedChartData,
  getUnifiedAudienceChartData,
  getUnifiedEngagementChartData,
  getUnifiedEngagementBreakdown,
  getUnifiedActivityBreakdown,
  getUnifiedPostsBreakdown,
  getUnifiedTopPosts,
  getUnifiedPostsHistory,
  resolveUnifiedPeriod,
} from '@/lib/analytics/unified-metrics';

export async function GET(req: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(req.headers.get('authorization'));
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const since = sp.get('since') ?? sp.get('start');
  const until = sp.get('until') ?? sp.get('end');
  const rawDays = sp.get('days');
  const days = [7, 30, 90].includes(Number(rawDays)) ? Number(rawDays) : undefined;
  const rawAccountIds = sp.get('accountIds');
  const accountIds = rawAccountIds
    ? rawAccountIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  const period = resolveUnifiedPeriod({
    days,
    since: since?.trim() || null,
    until: until?.trim() || null,
  });

  const [
    kpi,
    chart,
    audienceChart,
    engagementChart,
    engagementBreakdown,
    activityBreakdown,
    postsBreakdown,
    topPosts,
    history,
  ] = await Promise.all([
    getUnifiedKpiSummary(userId, period, accountIds),
    getUnifiedChartData(userId, period, accountIds),
    getUnifiedAudienceChartData(userId, period, accountIds),
    getUnifiedEngagementChartData(userId, period, accountIds),
    getUnifiedEngagementBreakdown(userId, period, accountIds),
    getUnifiedActivityBreakdown(userId, period, accountIds),
    getUnifiedPostsBreakdown(userId, period, accountIds),
    getUnifiedTopPosts(userId, period, 5, accountIds),
    getUnifiedPostsHistory(userId, period, 60, accountIds),
  ]);

  return NextResponse.json({
    kpi,
    chart,
    audienceChart,
    engagementChart,
    engagementBreakdown,
    activityBreakdown,
    postsBreakdown,
    topPosts,
    history,
  });
}
