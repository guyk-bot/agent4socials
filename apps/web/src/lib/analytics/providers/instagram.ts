import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import type { BreakdownResponse } from '@/lib/analytics/breakdown-types';
import {
  approximateRangeDatesForInstagram,
  computePercentsFromValues,
  countryCodeToLabel,
  mapUiRangeToInstagramTimeframe,
} from '@/lib/analytics/breakdown-helpers';
import { breakdownResponseSchema, metaIgInsightEnvelopeSchema } from '@/lib/analytics/breakdown-zod';
import { AnalyticsApiError, userSafeMessageFromAxios } from '@/lib/analytics/api-errors';
import { mockInstagramAudienceByCountry, shouldUseBreakdownMock } from '@/lib/analytics/mock-breakdown';

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

/**
 * Fetches Instagram professional account follower demographics by country (Meta Graph API).
 * TODO: Replace META_ACCESS_TOKEN with per-account tokens from your DB after OAuth.
 */
export async function fetchInstagramAudienceByCountry(opts: {
  accountId: string;
  range: string;
}): Promise<BreakdownResponse> {
  if (shouldUseBreakdownMock()) {
    return mockInstagramAudienceByCountry();
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return mockInstagramAudienceByCountry();
  }

  const timeframe = mapUiRangeToInstagramTimeframe(opts.range);
  const dateRange = approximateRangeDatesForInstagram(timeframe);
  const baseUrl = facebookGraphBaseUrl;
  const url = `${baseUrl}/${encodeURIComponent(opts.accountId)}/insights`;

  try {
    const res = await axios.get<unknown>(url, {
      params: {
        metric: 'follower_demographics',
        period: 'lifetime',
        timeframe,
        breakdowns: 'country',
        metric_type: 'total_value',
        access_token: token,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (res.status === 429) {
      throw new AnalyticsApiError({
        code: 'RATE_LIMIT',
        message: 'Meta rate limit',
        httpStatus: 429,
        exposeMessage: 'Rate limited by Meta. Try again shortly.',
      });
    }

    const parsed = metaIgInsightEnvelopeSchema.safeParse(res.data);
    if (!parsed.success) {
      throw new AnalyticsApiError({
        code: 'UPSTREAM_SHAPE',
        message: 'Unexpected Meta response shape',
        httpStatus: 502,
        exposeMessage: 'Could not read audience data from Instagram.',
      });
    }

    const graphError = parsed.data.error;
    if (graphError) {
      const insufficient =
        typeof graphError.message === 'string' &&
        /100|audience|demographic|not enough|insufficient/i.test(graphError.message);
      if (res.status === 400 && insufficient) {
        return assertBreakdownResponse({
          provider: 'instagram',
          metric: 'audience_by_country',
          total: 0,
          items: [],
          dateRange,
          meta: { insufficientAudienceData: true, upstreamMessage: graphError.message },
        });
      }
      throw new AnalyticsApiError({
        code: 'META_ERROR',
        message: graphError.message,
        httpStatus: res.status >= 400 && res.status < 500 ? res.status : 502,
        exposeMessage: userSafeMessageFromAxios({ response: { status: res.status, data: { error: graphError } } }),
      });
    }

    const first = parsed.data.data?.[0];
    const results = first?.total_value?.breakdowns?.[0]?.results ?? [];
    const rawRows = results
      .map((r) => ({
        key: String(r.dimension_values?.[0] ?? '').trim(),
        value: Number(r.value ?? 0),
      }))
      .filter((r) => r.key.length > 0 && r.value > 0);

    if (rawRows.length === 0) {
      return assertBreakdownResponse({
        provider: 'instagram',
        metric: 'audience_by_country',
        total: 0,
        items: [],
        dateRange,
        meta: { insufficientAudienceData: true },
      });
    }

    const rows = rawRows.map((r) => ({
      key: r.key,
      label: countryCodeToLabel(r.key),
      value: r.value,
    }));

    const items = computePercentsFromValues(rows);
    const total = items.reduce((s, i) => s + i.value, 0);

    return assertBreakdownResponse({
      provider: 'instagram',
      metric: 'audience_by_country',
      total,
      items,
      dateRange,
      meta: { timeframe },
    });
  } catch (e) {
    if (e instanceof AnalyticsApiError) throw e;
    throw new AnalyticsApiError({
      code: 'INSTAGRAM_FETCH_FAILED',
      message: (e as Error)?.message ?? String(e),
      httpStatus: 502,
      exposeMessage: userSafeMessageFromAxios(e),
    });
  }
}
