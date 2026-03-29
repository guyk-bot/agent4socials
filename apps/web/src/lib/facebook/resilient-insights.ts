import axios from 'axios';
import { metaGraphInsightsBaseUrl, META_GRAPH_INSIGHTS_VERSION } from '@/lib/meta-graph-insights';
import { getOrDiscoverPageDayMetrics, markPageDayMetricInvalidAfterFetchFailure } from './discovery';
import type { FacebookInsightMetricRow, FacebookSyncSummary } from './types';
import { startFacebookSyncRun, finishFacebookSyncRun } from './sync-run';

const PARALLEL_METRIC_FETCH = 4;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const part = await Promise.all(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

/**
 * Fetch Page daily insights by querying each VALID metric in its own Graph call (no comma lists).
 * Uses discovery cache + periodic revalidation.
 */
export async function fetchMergedFacebookPageDayInsights(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
  since: string;
  until: string;
  logSync?: boolean;
}): Promise<{
  rows: FacebookInsightMetricRow[];
  summary: FacebookSyncSummary;
}> {
  const { socialAccountId, pageId, accessToken, since, until, logSync } = params;
  const sync = logSync ? await startFacebookSyncRun(socialAccountId, 'page_insights_day') : null;
  const invalidEncountered: string[] = [];
  try {
    const { metrics, discoveryRan } = await getOrDiscoverPageDayMetrics({
      socialAccountId,
      pageId,
      accessToken,
      since,
      until,
    });
    const rows: FacebookInsightMetricRow[] = [];
    const fetchOne = async (metric: string) => {
      try {
        const res = await axios.get<{ data?: FacebookInsightMetricRow[]; error?: { message?: string; code?: number } }>(
          `${metaGraphInsightsBaseUrl}/${pageId}/insights`,
          {
            params: { metric, period: 'day', since, until, access_token: accessToken },
            timeout: 14_000,
            validateStatus: () => true,
          }
        );
        if (res.data?.error) {
          invalidEncountered.push(metric);
          const err = res.data.error;
          await markPageDayMetricInvalidAfterFetchFailure({
            socialAccountId,
            pageId,
            metricName: metric,
            errorMessage: err.message ?? JSON.stringify(err),
            errorCode: err.code,
          });
          return;
        }
        const chunk = res.data?.data ?? [];
        for (const r of chunk) {
          if (r?.name) rows.push(r);
        }
      } catch {
        invalidEncountered.push(metric);
      }
    };
    await mapPool(metrics, PARALLEL_METRIC_FETCH, fetchOne);
    const summary: FacebookSyncSummary = {
      graphInsightsVersion: META_GRAPH_INSIGHTS_VERSION,
      metricsFetched: metrics,
      metricsInvalid: invalidEncountered.length ? invalidEncountered : undefined,
      endpoints: [`${metaGraphInsightsBaseUrl}/{page-id}/insights`],
    };
    if (discoveryRan) summary.paginationPages = 1;
    if (sync) await finishFacebookSyncRun(sync.id, true, summary);
    return { rows, summary };
  } catch (e) {
    const msg = (e as Error).message;
    if (sync) await finishFacebookSyncRun(sync.id, false, { graphInsightsVersion: META_GRAPH_INSIGHTS_VERSION }, msg);
    throw e;
  }
}
