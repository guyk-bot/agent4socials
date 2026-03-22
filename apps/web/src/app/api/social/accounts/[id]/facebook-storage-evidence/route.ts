import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform, Prisma } from '@prisma/client';
import { metaGraphInsightsBaseUrl, META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';
import { persistFacebookPageInsightsNormalized } from '@/lib/facebook/persist-page-insights';
import { facebookMetricDateFromEndTime } from '@/lib/facebook/dates';
import { isFacebookMetricDiscoveryTableAvailable } from '@/lib/facebook/discovery-db';
import type { FacebookInsightMetricRow } from '@/lib/facebook/types';

const DISCOVERY_MIGRATION = '20260322180000_facebook_analytics_discovery';
const DAILY_MIGRATION = '20260324100000_facebook_page_insight_daily';

const PRISMA_MODEL_FACEBOOK_METRIC_DISCOVERY = `model FacebookMetricDiscovery {
  id               String                    @id @default(cuid())
  socialAccountId  String
  pageId           String
  scope            String
  metricName       String
  status           FacebookMetricProbeStatus
  lastError        String?
  graphVersion     String
  validatedAt      DateTime                  @default(now())
  createdAt        DateTime                  @default(now())
  updatedAt        DateTime                  @updatedAt
  @@unique([socialAccountId, scope, metricName])
}`;

const PRISMA_MODEL_FACEBOOK_PAGE_INSIGHT_DAILY = `model FacebookPageInsightDaily {
  id               String        @id @default(cuid())
  userId           String
  socialAccountId  String
  pageId           String
  metricDate       String        // YYYY-MM-DD from Graph daily point end_time
  metricKey        String        // Graph name e.g. page_views_total
  value            Float
  source           String        @default("insights_api")
  fetchedAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  @@unique([socialAccountId, metricKey, metricDate])
  @@map("facebook_page_insight_daily")
}`;

/**
 * GET /api/social/accounts/[id]/facebook-storage-evidence
 * Database-backed proof for Facebook analytics storage (not Graph-only).
 *
 * Query:
 *   storageProof=1  — optional: fetch page_views_total from Graph, upsert persist, re-read DB (writes data)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const runStorageProof = request.nextUrl.searchParams.get('storageProof') === '1';

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'FACEBOOK' },
    select: { id: true, platformUserId: true, username: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Facebook account not found' }, { status: 404 });
  }

  const pageId = account.platformUserId;
  const token = account.accessToken;

  let discoveryTableExists = false;
  let dailyTableExists = false;
  try {
    const [d] = await prisma.$queryRaw<{ reg: string | null }[]>`
      SELECT to_regclass('public."FacebookMetricDiscovery"')::text AS reg
    `;
    discoveryTableExists = Boolean(d?.reg);
  } catch {
    discoveryTableExists = false;
  }
  try {
    const [d] = await prisma.$queryRaw<{ reg: string | null }[]>`
      SELECT to_regclass('public.facebook_page_insight_daily')::text AS reg
    `;
    dailyTableExists = Boolean(d?.reg);
  } catch {
    dailyTableExists = false;
  }

  const discoveryAvailableViaPrisma = await isFacebookMetricDiscoveryTableAvailable();

  let discoverySample: unknown[] = [];
  if (discoveryTableExists) {
    try {
      discoverySample = await prisma.facebookMetricDiscovery.findMany({
        where: { socialAccountId: account.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          pageId: true,
          scope: true,
          metricName: true,
          status: true,
          graphVersion: true,
          validatedAt: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      discoverySample = [{ error: (e as Error).message }];
    }
  }

  let dailySample: unknown[] = [];
  if (dailyTableExists) {
    try {
      dailySample = await prisma.facebookPageInsightDaily.findMany({
        where: { socialAccountId: account.id },
        orderBy: [{ metricDate: 'desc' }, { metricKey: 'asc' }],
        take: 5,
      });
    } catch (e) {
      dailySample = [{ error: (e as Error).message }];
    }
  }

  let snapshotSample: unknown[] = [];
  try {
    snapshotSample = await prisma.accountMetricSnapshot.findMany({
      where: {
        userId,
        platform: Platform.FACEBOOK,
        externalAccountId: pageId,
        insightsJson: { not: Prisma.DbNull },
      },
      orderBy: { metricDate: 'desc' },
      take: 3,
      select: { metricDate: true, insightsJson: true, createdAt: true },
    });
  } catch (e) {
    snapshotSample = [{ error: (e as Error).message }];
  }

  const storageProofBlock: Record<string, unknown> = {};
  if (runStorageProof && dailyTableExists) {
    const until = new Date();
    const since = new Date(Date.now() - 7 * 86400000);
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);
    const metric = 'page_views_total';
    const url = `${metaGraphInsightsBaseUrl}/${pageId}/insights`;
    let rawStatus = 0;
    let rawBody: unknown = null;
    try {
      const res = await axios.get<{ data?: FacebookInsightMetricRow[]; error?: unknown }>(url, {
        params: { metric, period: 'day', since: sinceStr, until: untilStr, access_token: token },
        timeout: 20_000,
        validateStatus: () => true,
      });
      rawStatus = res.status;
      rawBody = res.data;
    } catch (e) {
      rawBody = { error: (e as Error).message };
    }

    const series: Array<{ date: string; value: number }> = [];
    const row = (rawBody as { data?: FacebookInsightMetricRow[] })?.data?.[0];
    for (const v of row?.values ?? []) {
      const end = v.end_time;
      if (!end) continue;
      const date = facebookMetricDateFromEndTime(end);
      const n = typeof v.value === 'number' ? v.value : Number(v.value);
      if (Number.isFinite(n)) series.push({ date, value: n });
    }

    let persistResult: { dailyRowsUpserted: number } | { error: string } = { dailyRowsUpserted: 0 };
    try {
      persistResult = await persistFacebookPageInsightsNormalized({
        userId,
        socialAccountId: account.id,
        pageId,
        seriesByGraphMetric: { [metric]: series },
      });
    } catch (e) {
      persistResult = { error: (e as Error).message };
    }

    let afterSample: unknown[] = [];
    try {
      afterSample = await prisma.facebookPageInsightDaily.findMany({
        where: { socialAccountId: account.id, metricKey: metric },
        orderBy: { metricDate: 'desc' },
        take: 5,
      });
    } catch (e) {
      afterSample = [{ error: (e as Error).message }];
    }

    storageProofBlock.metric = metric;
    storageProofBlock.since = sinceStr;
    storageProofBlock.until = untilStr;
    storageProofBlock.graphUrlPattern = `${metaGraphInsightsBaseUrl}/{page-id}/insights?metric=${metric}&period=day`;
    storageProofBlock.rawHttpStatus = rawStatus;
    storageProofBlock.rawApiResponseBody = rawBody;
    storageProofBlock.normalizedSeriesForPersist = series;
    storageProofBlock.persistFacebookPageInsightsNormalizedResult = persistResult;
    storageProofBlock.facebookPageInsightDailyAfterUpsertSample = afterSample;
  } else if (runStorageProof && !dailyTableExists) {
    storageProofBlock.skipped =
      'facebook_page_insight_daily table missing; run migrations or apps/web/scripts/ensure-facebook-metric-discovery.sql (and page insight daily migration)';
  }

  const failingLayers: string[] = [];
  if (!discoveryTableExists) failingLayers.push('migration_missing_or_not_deployed: FacebookMetricDiscovery');
  if (!dailyTableExists) failingLayers.push('migration_missing_or_not_deployed: facebook_page_insight_daily');
  if (!discoveryAvailableViaPrisma && discoveryTableExists) failingLayers.push('unexpected: information_schema says table exists but Prisma probe failed');

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      graphApiVersion: META_GRAPH_FACEBOOK_API_VERSION,
      accountId: account.id,
      pageId,
      username: account.username,
      checks: {
        discoveryTableExists_informationSchema: discoveryTableExists,
        dailyTableExists_informationSchema: dailyTableExists,
        discoveryTableReadableViaAppLayer: discoveryAvailableViaPrisma,
      },
      failingLayers: failingLayers.length ? failingLayers : undefined,
      prismaModels: {
        FacebookMetricDiscovery: PRISMA_MODEL_FACEBOOK_METRIC_DISCOVERY,
        FacebookPageInsightDaily: PRISMA_MODEL_FACEBOOK_PAGE_INSIGHT_DAILY,
        schemaFile: 'apps/web/prisma/schema.prisma',
      },
      migrationsThatCreatedThem: {
        FacebookMetricDiscovery_and_FacebookSyncRun: `apps/web/prisma/migrations/${DISCOVERY_MIGRATION}/migration.sql`,
        facebook_page_insight_daily: `apps/web/prisma/migrations/${DAILY_MIGRATION}/migration.sql`,
      },
      samples: {
        facebookMetricDiscovery_rows_latest5: discoverySample,
        facebookPageInsightDaily_rows_latest5: dailySample,
        accountMetricSnapshot_insightsJson_latest3: snapshotSample,
      },
      dailyRowSemantics: {
        oneRowPer: '(socialAccountId, metricKey, metricDate) unique; metricDate is the calendar day derived from Graph daily insight value end_time (see facebookMetricDateFromEndTime)',
        columnsNote:
          'We store metricDate (YYYY-MM-DD), not separate date_start/date_end. Graph end_time for each daily point maps to that day bucket.',
      },
      frontendDataFlow: {
        clientRequest:
          'Dashboard: api.get(`/social/accounts/${accountId}/insights`, { params: { since, until, extended: 1 } }) in apps/web/src/app/dashboard/page.tsx',
        serverHandler: 'GET apps/web/src/app/api/social/accounts/[id]/insights/route.ts',
        facebookPageInsightsFetch: 'fetchMergedFacebookPageDayInsights → live Graph per-metric',
        persistenceAfterFetch: 'persistFacebookPageInsightsNormalized → (1) AccountMetricSnapshot.insightsJson via persistInsightsSeries, (2) facebook_page_insight_daily rows',
        responseSeriesSource:
          'Charts use live API series merged with getInsightsTimeSeries() reading AccountMetricSnapshot.insightsJson (not a direct SELECT from facebook_page_insight_daily). The daily table is normalized storage for audits, counts, and tooling.',
        responsePayloadKeysForFacebook:
          'followers, impressionsTimeSeries, pageViewsTimeSeries, reachTotal, facebookPageMetricSeries, facebookAnalytics, growthTimeSeries, followersTimeSeries (snapshots), optional facebookInsightPersistence when extended=1',
      },
      failureFallback: {
        whenDiscoveryTableMissing:
          'apps/web/src/lib/facebook/discovery-db.ts + discovery.ts: skip cache, use PAGE_DAY_METRICS_FALLBACK_NO_TABLE; no throw from invalidate/deleteMany',
        codePaths: ['discovery-db.ts:isFacebookMetricDiscoveryTableAvailable', 'discovery.ts:getOrDiscoverPageDayMetrics'],
      },
      storageProof: runStorageProof ? storageProofBlock : { note: 'Pass storageProof=1 to run one live upsert + readback (writes DB).' },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
