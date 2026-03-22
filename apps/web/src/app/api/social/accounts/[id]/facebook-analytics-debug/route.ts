import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform, Prisma } from '@prisma/client';
import { getFacebookMetricDiscoveryReport } from '@/lib/facebook/discovery';
import { META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';

/**
 * GET /api/social/accounts/[id]/facebook-analytics-debug
 * Discovery registry, normalized insight row counts, and implementation gaps (dev/support).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getPrismaUserIdFromRequest(_request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'FACEBOOK' },
    select: { id: true, platformUserId: true, username: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Facebook account not found' }, { status: 404 });
  }

  const discovery = await getFacebookMetricDiscoveryReport(account.id);

  const safeCount = async (fn: () => Promise<number>): Promise<number> => {
    try {
      return await fn();
    } catch {
      return 0;
    }
  };

  const [facebookPageInsightDailyCount, snapshotRowsWithInsights, importedPostCount, syncRunCount] = await Promise.all([
    safeCount(() => prisma.facebookPageInsightDaily.count({ where: { socialAccountId: account.id } })),
    safeCount(() =>
      prisma.accountMetricSnapshot.count({
        where: {
          userId,
          platform: Platform.FACEBOOK,
          externalAccountId: account.platformUserId,
          insightsJson: { not: Prisma.DbNull },
        },
      })
    ),
    safeCount(() => prisma.importedPost.count({ where: { socialAccountId: account.id, platform: 'FACEBOOK' } })),
    safeCount(() => prisma.facebookSyncRun.count({ where: { socialAccountId: account.id } })),
  ]);

  const debugSummary = {
    validPageDayMetrics: discovery.pageDay.valid,
    invalidPageDayMetrics: discovery.pageDay.invalid,
    deprecatedPageDayMetrics: discovery.pageDay.deprecated,
    unavailablePageDayMetrics: discovery.pageDay.unavailable,
    validPostLifetimeMetrics: discovery.postLifetime.valid,
    invalidPostLifetimeMetrics: discovery.postLifetime.invalid,
    deprecatedPostLifetimeMetrics: discovery.postLifetime.deprecated,
    unavailablePostLifetimeMetrics: discovery.postLifetime.unavailable,
    counts: {
      validPageDay: discovery.pageDay.valid.length,
      invalidPageDay: discovery.pageDay.invalid.length,
      validPostLifetime: discovery.postLifetime.valid.length,
      invalidPostLifetime: discovery.postLifetime.invalid.length,
      storedFacebookPageInsightDailyRows: facebookPageInsightDailyCount,
      accountMetricSnapshotsWithInsightsJson: snapshotRowsWithInsights,
      importedFacebookPosts: importedPostCount,
      facebookSyncRunsLogged: syncRunCount,
    },
  };

  return NextResponse.json(
    {
      graphApiVersion: META_GRAPH_FACEBOOK_API_VERSION,
      pageId: account.platformUserId,
      username: account.username,
      discovery,
      debugSummary,
      storage: {
        facebookPageInsightDailyRows: facebookPageInsightDailyCount,
        accountMetricSnapshotsWithInsightsJson: snapshotRowsWithInsights,
        importedFacebookPosts: importedPostCount,
        facebookSyncRunsLogged: syncRunCount,
      },
      unimplementedOrNotExposed: [
        'Page notifications edge (invalid on Page; never implemented).',
        'Instagram demographics-style breakdowns for Facebook Pages depend on metric support from Meta (partial via extended demographics fetcher).',
        'Real-time Webhooks for insights (not implemented; polling via insights GET + post sync).',
        'Dedicated breakdown tables for post_insights (values stored on ImportedPost.platformMetadata.facebookInsights and scalar columns).',
      ],
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
