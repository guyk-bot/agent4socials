import axios from 'axios';
import type { BreakdownResponse } from '@/lib/analytics/breakdown-types';
import { breakdownResponseSchema, youtubeReportEnvelopeSchema } from '@/lib/analytics/breakdown-zod';
import { AnalyticsApiError, userSafeMessageFromAxios } from '@/lib/analytics/api-errors';
import { getYoutubeAccessTokenFromEnv } from '@/lib/analytics/youtube-env-token';
import { computePercentsFromValues, countryCodeToLabel } from '@/lib/analytics/breakdown-helpers';
import { mockYoutubeAudienceByCountry, mockYoutubeTrafficSources, shouldUseBreakdownMock } from '@/lib/analytics/mock-breakdown';

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  YT_SEARCH: 'YouTube Search',
  SUGGESTED_VIDEO: 'Suggested Videos',
  EXT_URL: 'External',
  PLAYLIST: 'Playlists',
  SUBSCRIBER: 'Subscriptions',
  SHORTS: 'Shorts Feed',
  NO_LINK_OTHER: 'Other',
};

function trafficSourceLabel(key: string): { mergeKey: string; label: string } {
  const k = key.trim();
  if (k === 'NO_LINK_OTHER') return { mergeKey: 'OTHER', label: 'Other' };
  if (TRAFFIC_SOURCE_LABELS[k]) {
    return { mergeKey: k, label: TRAFFIC_SOURCE_LABELS[k] };
  }
  return { mergeKey: 'OTHER', label: 'Other' };
}

function assertBreakdownResponse(input: BreakdownResponse): BreakdownResponse {
  const out = breakdownResponseSchema.safeParse(input);
  if (!out.success) {
    throw new AnalyticsApiError({
      code: 'INTERNAL_NORMALIZE',
      message: out.error.message,
      httpStatus: 500,
      exposeMessage: 'Internal normalization error.',
    });
  }
  return out.data as BreakdownResponse;
}

function channelIdsParam(channelId: string): string {
  const id = channelId.trim();
  if (id === 'MINE') return 'channel==MINE';
  return `channel==${id}`;
}

async function youtubeReport(opts: {
  accessToken: string;
  channelId: string;
  startDate: string;
  endDate: string;
  dimensions: string;
  metrics: string;
  sort?: string;
}): Promise<{ rows: Array<(string | number)[]>; headers: string[] }> {
  const res = await axios.get<unknown>('https://youtubeanalytics.googleapis.com/v2/reports', {
    params: {
      ids: channelIdsParam(opts.channelId),
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      metrics: opts.metrics,
      ...(opts.sort ? { sort: opts.sort } : {}),
    },
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    timeout: 20_000,
    validateStatus: () => true,
  });

  if (res.status === 429) {
    throw new AnalyticsApiError({
      code: 'RATE_LIMIT',
      message: 'YouTube rate limit',
      httpStatus: 429,
      exposeMessage: 'Rate limited by YouTube. Try again shortly.',
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new AnalyticsApiError({
      code: 'YOUTUBE_AUTH',
      message: 'YouTube auth failed',
      httpStatus: res.status,
      exposeMessage: 'YouTube authorization failed. Refresh tokens or reconnect.',
    });
  }

  const parsed = youtubeReportEnvelopeSchema.safeParse(res.data);
  if (!parsed.success) {
    throw new AnalyticsApiError({
      code: 'UPSTREAM_SHAPE',
      message: 'Unexpected YouTube Analytics response',
      httpStatus: 502,
      exposeMessage: 'Could not read YouTube Analytics data.',
    });
  }

  const topLevelMsg = parsed.data.error?.message;
  if (topLevelMsg) {
    throw new AnalyticsApiError({
      code: 'YOUTUBE_API',
      message: topLevelMsg,
      httpStatus: res.status >= 400 && res.status < 600 ? res.status : 502,
      exposeMessage: userSafeMessageFromAxios({ response: { status: res.status, data: { error: { message: topLevelMsg } } } }),
    });
  }

  if (parsed.data.errors?.length) {
    const msg = parsed.data.errors.map((e) => e.message).filter(Boolean).join('; ') || 'YouTube Analytics error';
    throw new AnalyticsApiError({
      code: 'YOUTUBE_ANALYTICS_ERROR',
      message: msg,
      httpStatus: res.status >= 400 && res.status < 500 ? res.status : 502,
      exposeMessage: userSafeMessageFromAxios({ response: { status: res.status, data: { error: { message: msg } } } }),
    });
  }

  const headers = (parsed.data.columnHeaders ?? []).map((h) => h.name);
  return { rows: parsed.data.rows ?? [], headers };
}

/**
 * YouTube Analytics: views / watch time by country.
 * TODO: Pass accessToken from DB via getValidYoutubeToken(account) instead of env-only refresh.
 */
export async function fetchYoutubeAudienceByCountry(opts: {
  channelId: string;
  startDate: string;
  endDate: string;
  primaryMetric: 'views' | 'estimatedMinutesWatched';
}): Promise<BreakdownResponse> {
  if (shouldUseBreakdownMock()) {
    return mockYoutubeAudienceByCountry();
  }

  const accessToken = await getYoutubeAccessTokenFromEnv();
  if (!accessToken) {
    return mockYoutubeAudienceByCountry();
  }

  const sortKey = opts.primaryMetric === 'estimatedMinutesWatched' ? '-estimatedMinutesWatched' : '-views';
  const { rows } = await youtubeReport({
    accessToken,
    channelId: opts.channelId,
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: 'country',
    metrics: 'views,estimatedMinutesWatched',
    sort: sortKey,
  });

  const valueIdx = opts.primaryMetric === 'estimatedMinutesWatched' ? 2 : 1;

  const raw = rows
    .map((row) => ({
      key: String(row[0] ?? '').trim(),
      value: Number(row[valueIdx] ?? 0),
    }))
    .filter((r) => r.key.length > 0 && Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (raw.length === 0) {
    return assertBreakdownResponse({
      provider: 'youtube',
      metric: 'audience_by_country',
      total: 0,
      items: [],
      dateRange: {
        start: opts.startDate,
        end: opts.endDate,
        label: `${opts.startDate} → ${opts.endDate}`,
      },
      meta: { primaryMetric: opts.primaryMetric },
    });
  }

  const rowsForPercent = raw.map((r) => ({
    key: r.key,
    label: countryCodeToLabel(r.key),
    value: r.value,
  }));

  const items = computePercentsFromValues(rowsForPercent);
  const total = items.reduce((s, i) => s + i.value, 0);

  return assertBreakdownResponse({
    provider: 'youtube',
    metric: 'audience_by_country',
    total,
    items,
    dateRange: {
      start: opts.startDate,
      end: opts.endDate,
      label: `${opts.startDate} → ${opts.endDate}`,
    },
    meta: { primaryMetric: opts.primaryMetric },
  });
}

/**
 * YouTube Analytics: traffic source type breakdown (views + watch time; percents from views).
 */
export async function fetchYoutubeTrafficSources(opts: {
  channelId: string;
  startDate: string;
  endDate: string;
}): Promise<BreakdownResponse> {
  if (shouldUseBreakdownMock()) {
    return mockYoutubeTrafficSources();
  }

  const accessToken = await getYoutubeAccessTokenFromEnv();
  if (!accessToken) {
    return mockYoutubeTrafficSources();
  }

  const { rows } = await youtubeReport({
    accessToken,
    channelId: opts.channelId,
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: 'insightTrafficSourceType',
    metrics: 'views,estimatedMinutesWatched',
    sort: '-views',
  });

  const merged = new Map<string, { key: string; label: string; value: number }>();
  for (const row of rows) {
    const sourceKey = String(row[0] ?? '').trim();
    const views = Number(row[1] ?? 0);
    if (!sourceKey || !Number.isFinite(views) || views <= 0) continue;
    const mapped = trafficSourceLabel(sourceKey);
    const prev = merged.get(mapped.mergeKey);
    if (prev) prev.value += views;
    else merged.set(mapped.mergeKey, { key: mapped.mergeKey, label: mapped.label, value: views });
  }

  const list = Array.from(merged.values()).sort((a, b) => b.value - a.value);
  if (list.length === 0) {
    return assertBreakdownResponse({
      provider: 'youtube',
      metric: 'traffic_sources',
      total: 0,
      items: [],
      dateRange: {
        start: opts.startDate,
        end: opts.endDate,
        label: `${opts.startDate} → ${opts.endDate}`,
      },
    });
  }

  const items = computePercentsFromValues(list);
  const total = items.reduce((s, i) => s + i.value, 0);

  return assertBreakdownResponse({
    provider: 'youtube',
    metric: 'traffic_sources',
    total,
    items,
    dateRange: {
      start: opts.startDate,
      end: opts.endDate,
      label: `${opts.startDate} → ${opts.endDate}`,
    },
  });
}
