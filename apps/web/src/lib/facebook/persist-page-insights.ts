import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { persistInsightsSeries } from '@/lib/analytics/metric-snapshots';

/**
 * Writes Facebook Page day metrics to (1) `AccountMetricSnapshot.insightsJson` merged by date and
 * (2) `FacebookPageInsightDaily` rows for normalized storage and row counts.
 * Uses Graph-native `metricKey` in the daily table; adds `page_impressions` alias in snapshots when `page_media_view` exists (UI compatibility).
 */
export async function persistFacebookPageInsightsNormalized(params: {
  userId: string;
  socialAccountId: string;
  pageId: string;
  /** Keys = Graph metric names as returned by the API (e.g. page_views_total). */
  seriesByGraphMetric: Record<string, Array<{ date: string; value: number }>>;
}): Promise<{ dailyRowsUpserted: number }> {
  const { userId, socialAccountId, pageId, seriesByGraphMetric } = params;

  const forSnapshots: Record<string, Array<{ date: string; value: number }>> = { ...seriesByGraphMetric };
  const pmv = seriesByGraphMetric.page_media_view;
  if (pmv?.length) {
    forSnapshots.page_impressions = pmv;
  }

  await persistInsightsSeries({
    userId,
    socialAccountId,
    platform: Platform.FACEBOOK,
    externalAccountId: pageId,
    seriesByMetric: forSnapshots,
  });

  let dailyRowsUpserted = 0;
  for (const [metricKey, series] of Object.entries(seriesByGraphMetric)) {
    if (!series?.length) continue;
    for (const { date, value } of series) {
      if (!date || typeof value !== 'number') continue;
      await prisma.facebookPageInsightDaily.upsert({
        where: {
          socialAccountId_metricKey_metricDate: {
            socialAccountId,
            metricKey,
            metricDate: date,
          },
        },
        create: {
          userId,
          socialAccountId,
          pageId,
          metricDate: date,
          metricKey,
          value,
          source: 'insights_api',
        },
        update: {
          value,
          pageId,
          fetchedAt: new Date(),
        },
      });
      dailyRowsUpserted += 1;
    }
  }

  return { dailyRowsUpserted };
}
