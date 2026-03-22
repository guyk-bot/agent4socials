/**
 * Extended analytics fetchers per platform (demographics, traffic source, growth).
 * Used when GET /api/social/accounts/[id]/insights?extended=1 or GET /api/social/accounts/[id]/analytics.
 */

import axios from 'axios';
import type { Demographics, TrafficSourceItem, GrowthDataPoint } from '@/types/analytics';
import { metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';

const baseUrl = 'https://graph.facebook.com/v18.0';

type IgInsightsBreakdown = {
  dimension_keys?: string[];
  results?: Array<{ dimension_values?: string[]; value?: number }>;
};

export async function fetchInstagramDemographics(
  igUserId: string,
  accessToken: string,
  timeframe: 'last_14_days' | 'last_30_days' | 'last_90_days' = 'last_30_days'
): Promise<{ demographics: Demographics; raw?: unknown }> {
  const demographics: Demographics = {};
  const raw: Record<string, unknown> = {};

  const metrics = [
    { metric: 'follower_demographics', breakdown: 'country' as const },
    { metric: 'follower_demographics', breakdown: 'age' as const },
    { metric: 'follower_demographics', breakdown: 'gender' as const },
    { metric: 'follower_demographics', breakdown: 'city' as const },
    { metric: 'engaged_audience_demographics', breakdown: 'country' as const },
    { metric: 'engaged_audience_demographics', breakdown: 'age' as const },
    { metric: 'engaged_audience_demographics', breakdown: 'gender' as const },
    { metric: 'engaged_audience_demographics', breakdown: 'city' as const },
  ];

  for (const { metric, breakdown } of metrics) {
    try {
      const res = await axios.get<{
        data?: Array<{
          name: string;
          total_value?: { value?: number; breakdowns?: IgInsightsBreakdown[] };
        }>;
        error?: { message?: string };
      }>(`${baseUrl}/${igUserId}/insights`, {
        params: {
          metric,
          period: 'lifetime',
          timeframe,
          breakdowns: breakdown,
          metric_type: 'total_value',
          access_token: accessToken,
        },
        timeout: 10_000,
      });
      if (res.data?.error) {
        raw[`${metric}_${breakdown}_error`] = res.data.error.message;
        continue;
      }
      const data = res.data?.data?.[0];
      if (!data?.total_value?.breakdowns?.[0]?.results?.length) continue;
      raw[`${metric}_${breakdown}`] = data;
      const items = data.total_value.breakdowns[0].results.map((r) => ({
        dimensionValue: r.dimension_values?.[0] ?? '',
        value: r.value ?? 0,
      }));
      if (breakdown === 'country') {
        if (metric === 'follower_demographics') demographics.byCountry = items;
        else if (!demographics.byCountry) demographics.byCountry = items;
      } else if (breakdown === 'city') {
        demographics.byCity = items;
      } else if (breakdown === 'age') {
        demographics.byAge = items;
      } else if (breakdown === 'gender') {
        demographics.byGender = items;
      }
    } catch (e) {
      raw[`${metric}_${breakdown}_error`] = (e as Error)?.message ?? String(e);
    }
  }

  if (Object.keys(demographics).length === 0) {
    demographics.hint = 'Demographics require 100+ followers and may be delayed up to 48 hours.';
  }
  return { demographics, raw: Object.keys(raw).length ? raw : undefined };
}

export async function fetchFacebookDemographics(
  pageId: string,
  accessToken: string
): Promise<{ demographics: Demographics; raw?: unknown }> {
  const demographics: Demographics = {};
  const raw: Record<string, unknown> = {};

  const metricsToTry = ['page_fans_gender_age', 'page_fans_country', 'page_impressions_by_country_unique'];
  for (const metric of metricsToTry) {
    try {
      const res = await axios.get<{
        data?: Array<{
          name: string;
          values?: Array<{ value: Record<string, number> | number; end_time?: string }>;
        }>;
        error?: { message?: string; code?: number };
      }>(`${metaGraphInsightsBaseUrl}/${pageId}/insights`, {
        params: {
          metric,
          period: 'lifetime',
          access_token: accessToken,
        },
        timeout: 10_000,
        validateStatus: () => true,
      });
      if (res.data?.error) {
        raw[`${metric}_error`] = res.data.error.message;
        continue;
      }
      const data = res.data?.data?.[0];
      raw[metric] = data;
      if (!data?.values?.[0]) continue;
      const v = data.values[0].value;
      if (typeof v === 'number') continue;
      const entries = Object.entries(v);
      if (metric === 'page_fans_country' || metric === 'page_impressions_by_country_unique') {
        demographics.byCountry = entries.map(([dimensionValue, value]) => ({ dimensionValue, value }));
      } else if (metric === 'page_fans_gender_age') {
        demographics.byAge = entries.map(([dimensionValue, value]) => ({ dimensionValue, value }));
      }
    } catch (e) {
      raw[`${metric}_error`] = (e as Error)?.message ?? String(e);
    }
  }

  if (Object.keys(demographics).length === 0) {
    demographics.hint = 'Page demographics require 100+ likes and read_insights permission.';
  }
  return { demographics, raw: Object.keys(raw).length ? raw : undefined };
}

export async function fetchYouTubeExtended(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<{
  demographics: Demographics;
  trafficSources: TrafficSourceItem[];
  growthTimeSeries: GrowthDataPoint[];
  extra: Record<string, number | Array<{ date: string; value: number }>>;
  raw?: unknown;
}> {
  const demographics: Demographics = {};
  const trafficSources: TrafficSourceItem[] = [];
  const growthTimeSeries: GrowthDataPoint[] = [];
  const extra: Record<string, number | Array<{ date: string; value: number }>> = {};
  const raw: Record<string, unknown> = {};
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    const [viewsByCountryRes, viewsByAgeRes, viewsByGenderRes, trafficRes, watchTimeRes, subsRes] = await Promise.allSettled([
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'views', dimensions: 'country', sort: '-views' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'views', dimensions: 'ageGroup', sort: '-views' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'views', dimensions: 'gender', sort: '-views' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'estimatedMinutesWatched,averageViewDuration', dimensions: 'day', sort: 'day' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
      axios.get<{ rows?: Array<(string | number)[]>; error?: { message?: string } }>('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: { ids: 'channel==MINE', startDate, endDate, metrics: 'subscribersGained,subscribersLost', dimensions: 'day', sort: 'day' },
        headers,
        timeout: 12_000,
        validateStatus: () => true,
      }),
    ]);

    const getRows = (res: PromiseSettledResult<{ data?: { rows?: Array<(string | number)[]>; error?: { message?: string } } }>, key: string): Array<(string | number)[]> => {
      if (res.status === 'fulfilled' && res.value?.data && !res.value.data.error) {
        const data = res.value.data;
        raw[key] = data;
        return data.rows ?? [];
      }
      return [];
    };

    const countryRows = getRows(viewsByCountryRes, 'viewsByCountry');
    if (countryRows.length) {
      demographics.byCountry = countryRows.map((row) => ({
        dimensionValue: String(row[0] ?? ''),
        value: Number(row[1] ?? 0),
      }));
    }
    const ageRows = getRows(viewsByAgeRes, 'viewsByAge');
    if (ageRows.length) {
      demographics.byAge = ageRows.map((row) => ({
        dimensionValue: String(row[0] ?? ''),
        value: Number(row[1] ?? 0),
      }));
    }
    const genderRows = getRows(viewsByGenderRes, 'viewsByGender');
    if (genderRows.length) {
      demographics.byGender = genderRows.map((row) => ({
        dimensionValue: String(row[0] ?? ''),
        value: Number(row[1] ?? 0),
      }));
    }
    const trafficRows = getRows(trafficRes, 'trafficSource');
    if (trafficRows.length) {
      trafficSources.push(
        ...trafficRows.map((row) => ({ source: String(row[0] ?? ''), value: Number(row[1] ?? 0) }))
      );
    }
    const watchRows = getRows(watchTimeRes, 'watchTime');
    if (watchRows.length) {
      const totalMinutes = watchRows.reduce((s, row) => s + (Number(row[1] ?? 0)), 0);
      const avgDuration = watchRows.length ? watchRows.reduce((s, row) => s + (Number(row[2] ?? 0)), 0) / watchRows.length : 0;
      extra.estimatedMinutesWatched = totalMinutes;
      extra.averageViewDurationSeconds = avgDuration;
    }
    const subsRows = getRows(subsRes, 'subscribers');
    if (subsRows.length) {
      growthTimeSeries.push(
        ...subsRows.map((row) => ({
          date: String(row[0] ?? '').slice(0, 10),
          gained: Number(row[1] ?? 0),
          lost: Number(row[2] ?? 0),
          net: Number(row[1] ?? 0) - Number(row[2] ?? 0),
        }))
      );
    }

    if (Object.keys(demographics).length === 0) {
      demographics.hint = 'Demographics may be limited for low traffic. Enable YouTube Analytics API in Google Cloud.';
    }
  } catch (e) {
    raw.fetchError = (e as Error)?.message ?? String(e);
  }

  return {
    demographics,
    trafficSources,
    growthTimeSeries,
    extra,
    raw: Object.keys(raw).length ? raw : undefined,
  };
}
