import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import { getValidPinterestToken } from '@/lib/pinterest-token';
import { fetchInstagramDemographics, fetchFacebookDemographics, fetchYouTubeExtended } from '@/lib/analytics/extended-fetchers';
import {
  getAccountHistorySeries,
  buildBootstrapFlatSeries,
  persistInsightsSeries,
  getInsightsTimeSeries,
} from '@/lib/analytics/metric-snapshots';
import { fetchMergedFacebookPageDayInsights } from '@/lib/facebook/resilient-insights';
import { fetchPageProfile } from '@/lib/facebook/fetchers';
import { facebookMetricDateFromEndTime } from '@/lib/facebook/dates';
import { persistFacebookPageInsightsNormalized } from '@/lib/facebook/persist-page-insights';
import { buildFacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';
import { buildPinterestFrontendAnalyticsBundle } from '@/lib/pinterest-analytics-bundle';
import { syncFacebookAuxiliaryIngest, ensureFacebookTables } from '@/lib/facebook/sync-extras';
import { facebookGraphBaseUrl, instagramGraphHostBaseUrl } from '@/lib/meta-graph-insights';
import { linkedInAuthorUrnForUgc } from '@/lib/linkedin/sync-ugc-posts';
import { fetchTwitterTimelineInsights } from '@/lib/twitter-insights';
import type { TwitterRecentTweetRow, TwitterTotals, TwitterUserPublicRow } from '@/lib/twitter-insights';
import { refreshTwitterToken } from '@/lib/twitter-refresh';
import { getLinkedInRestApiVersion, linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import {
  fetchLinkedInMemberFollowersCountMe,
  fetchLinkedInOrganizationalEntityFollowerStatistics,
} from '@/lib/linkedin/community-analytics';

export const maxDuration = 60;

const fbBaseUrl = facebookGraphBaseUrl;
/** graph.instagram.com — use Instagram host version (see meta-graph-insights), not Facebook Graph version. */
const igBaseUrl = instagramGraphHostBaseUrl;
const baseUrl = fbBaseUrl; // used by Facebook and other platforms

/** Meta sometimes returns counts as strings; normalize so we do not show 0 when the API sent a parseable value. */
function parseIgFollowerCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return null;
}


async function resolveFacebookPageAccessToken(pageId: string, token: string): Promise<string> {
  try {
    const res = await axios.get<{ data?: Array<{ id?: string; access_token?: string }>; error?: { message?: string } }>(
      `${fbBaseUrl}/me/accounts`,
      {
        params: { fields: 'id,access_token', limit: 200, access_token: token },
        timeout: 10_000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200 || res.data?.error) return token;
    const rows = res.data?.data ?? [];
    const match = rows.find((r) => r?.id === pageId && typeof r?.access_token === 'string' && r.access_token.trim() !== '');
    return match?.access_token?.trim() || token;
  } catch {
    return token;
  }
}

/**
 * Keys that justify skipping a live Graph fetch when present with positive values in `facebookPageInsightDaily`.
 * Excludes `page_video_views`: cron or partial sync often persists video views alone, which would skip live fetch
 * and leave page_media_view, page_views_total, engagements, and post-level traffic metrics stuck at zero.
 */
const FB_DAILY_SKIP_LIVE_FETCH_KEYS = new Set([
  'page_impressions',
  'page_media_view',
  'page_views_total',
  'page_post_engagements',
]);

function fbDailyRowsHavePositiveCoreSignal(daily: Array<{ metricKey: string; value: unknown }>): boolean {
  for (const row of daily) {
    if (!FB_DAILY_SKIP_LIVE_FETCH_KEYS.has(row.metricKey)) continue;
    const v = typeof row.value === 'number' ? row.value : Number(row.value);
    if (Number.isFinite(v) && v > 0) return true;
  }
  return false;
}

/** Merge API time series with snapshot-backed series. API values take precedence. Only include dates that have a value so the UI can carry forward the last known value for missing dates (avoids showing zeros when Meta has no data yet for recent days). */
function mergeSeriesWithSnapshots(
  apiSeries: Array<{ date: string; value: number }>,
  snapshotSeries: Array<{ date: string; value: number }>,
  since: string,
  until: string
): Array<{ date: string; value: number }> {
  const apiMap = new Map(apiSeries.map((p) => [p.date, p.value]));
  const snapshotMap = new Map(snapshotSeries.map((p) => [p.date, p.value]));
  const dates: string[] = [];
  for (let d = new Date(since + 'T12:00:00Z'); d <= new Date(until + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates
    .map((date) => ({ date, value: apiMap.get(date) ?? snapshotMap.get(date) }))
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number');
}

/** KPI rollup for the selected range: one value per calendar day, API wins over snapshot (same as merge). Missing days count as 0. */
function sumMergedDailyOverCalendarRange(
  apiSeries: Array<{ date: string; value: number }>,
  snapshotSeries: Array<{ date: string; value: number }>,
  since: string,
  until: string
): number {
  const apiMap = new Map(
    apiSeries.map((p) => [p.date, typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0])
  );
  const snapMap = new Map(
    snapshotSeries.map((p) => [p.date, typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0])
  );
  let sum = 0;
  for (let d = new Date(since + 'T12:00:00Z'); d <= new Date(until + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    sum += apiMap.get(key) ?? snapMap.get(key) ?? 0;
  }
  return sum;
}

type AudienceCountryRow = { country: string; value: number; percent: number };

function normalizeAudienceCountryRows(
  input: Array<{ dimensionValue: string; value: number }>
): AudienceCountryRow[] {
  const cleaned = input
    .map((r) => ({ country: String(r.dimensionValue || '').trim(), value: Number(r.value || 0) }))
    .filter((r) => r.country.length > 0 && Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = cleaned.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return [];
  return cleaned.map((r) => ({
    country: r.country,
    value: r.value,
    percent: Number(((r.value / total) * 100).toFixed(1)),
  }));
}

/**
 * GET /api/social/accounts/[id]/insights?since=YYYY-MM-DD&until=YYYY-MM-DD&extended=1
 * Returns account-level analytics. If extended=1, also fetches demographics, traffic sources, and growth where available.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Wall-clock budget: stop making new API calls after 50s so we never hit the 60s maxDuration hard limit.
  const requestStartMs = Date.now();
  const budgetMs = 50_000;
  const budgetExpired = () => Date.now() - requestStartMs > budgetMs;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const emptyOut = (platform: string) => ({
    platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [] as Array<{ date: string; value: number }>,
    insightsHint: 'Could not load insights. Try reconnecting from the sidebar.',
  });
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      credentialsJson: true,
      firstConnectedAt: true,
      username: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const since = request.nextUrl.searchParams.get('since') ?? '';
  const until = request.nextUrl.searchParams.get('until') ?? '';
  /** Set persist=0 on background revalidation to skip heavy normalized upserts (default: persist). */
  const persistInsightsToDb = request.nextUrl.searchParams.get('persist') !== '0';
  let sinceParam = since;
  let untilParam = until;
  if (!sinceParam || !untilParam) {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    untilParam = untilParam || end.toISOString().slice(0, 10);
    sinceParam = sinceParam || start.toISOString().slice(0, 10);
  }
  const sinceTs = sinceParam ? Math.floor(new Date(sinceParam).getTime() / 1000) : null;
  const untilTs = untilParam ? Math.floor(new Date(untilParam).getTime() / 1000) : null;

  const INSTAGRAM_INSIGHTS_DAYS = 28;
  const FACEBOOK_INSIGHTS_DAYS = 90;
  let effectiveSinceTs = sinceTs;
  let effectiveUntilTs = untilTs;
  let insightsRangeHint: string | undefined;

  if (account.platform === 'INSTAGRAM' && sinceTs != null && untilTs != null) {
    const rangeDays = (untilTs - sinceTs) / (24 * 60 * 60);
    if (rangeDays > INSTAGRAM_INSIGHTS_DAYS) {
      effectiveUntilTs = Math.floor(Date.now() / 1000);
      effectiveSinceTs = effectiveUntilTs - INSTAGRAM_INSIGHTS_DAYS * 24 * 60 * 60;
      insightsRangeHint = `Showing last ${INSTAGRAM_INSIGHTS_DAYS} days (Instagram\'s API limits insights to ${INSTAGRAM_INSIGHTS_DAYS} days).`;
    }
  }
  let effectiveSinceParam = sinceParam;
  let effectiveUntilParam = untilParam;
  if (account.platform === 'FACEBOOK' && sinceTs != null && untilTs != null) {
    const rangeDays = (untilTs - sinceTs) / (24 * 60 * 60);
    if (rangeDays > FACEBOOK_INSIGHTS_DAYS) {
      effectiveUntilTs = Math.floor(Date.now() / 1000);
      effectiveSinceTs = effectiveUntilTs - FACEBOOK_INSIGHTS_DAYS * 24 * 60 * 60;
      effectiveUntilParam = new Date(effectiveUntilTs * 1000).toISOString().slice(0, 10);
      effectiveSinceParam = new Date(effectiveSinceTs * 1000).toISOString().slice(0, 10);
      insightsRangeHint = `Showing last ${FACEBOOK_INSIGHTS_DAYS} days (Facebook allows up to ${FACEBOOK_INSIGHTS_DAYS} days per request).`;
    }
  }

  const out: {
    platform: string;
    followers: number;
    followingCount?: number;
    impressionsTotal: number;
    impressionsTimeSeries: Array<{ date: string; value: number }>;
    pageViewsTotal?: number;
    pageViewsTimeSeries?: Array<{ date: string; value: number }>;
    reachTotal?: number;
    profileViewsTotal?: number;
    followersTimeSeries?: Array<{ date: string; value: number }>;
    insightsHint?: string;
    demographics?: import('@/types/analytics').Demographics;
    trafficSources?: import('@/types/analytics').TrafficSourceItem[];
    growthTimeSeries?: import('@/types/analytics').GrowthDataPoint[];
    audienceByCountry?: { label: string; rows: AudienceCountryRow[] };
    /** Platform-specific metrics; values may be numbers, series, or structured objects. */
    extra?: Record<string, unknown>;
    raw?: Record<string, unknown>;
    /** When true, followersTimeSeries is from our DB (snapshots or bootstrap). */
    metricHistoryFromSnapshots?: boolean;
    /** True when we have fewer than 2 snapshots and are showing a flat bootstrap line; show "Tracking started on …" helper. */
    isBootstrap?: boolean;
    /** First time this account was connected (preserved across disconnect/reconnect). For bootstrap flat line start. */
    firstConnectedAt?: string | null;
    /** Per-day following count from our snapshots (Instagram); when present chart uses this instead of flat followingCount. */
    followingTimeSeries?: Array<{ date: string; value: number }>;
    /** Instagram: sum of accounts_engaged in range (from Graph insights). */
    accountsEngaged?: number;
    /** Instagram: Graph `views` total in range when available. */
    instagramAccountVideoViewsTotal?: number;
    /** Instagram User /insights interaction totals (likes, comments, …) for the selected range. */
    instagramInteractionTotals?: {
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      reposts?: number;
      totalInteractions?: number;
    };
    /** Instagram: daily series keyed by Graph metric name (impressions, profile_views, accounts_engaged, …). */
    facebookPageMetricSeries?: Record<string, Array<{ date: string; value: number }>>;
    /** X (Twitter): user fields + timeline analytics (see `fetchTwitterTimelineInsights`). */
    twitterUser?: TwitterUserPublicRow | null;
    twitterTotals?: TwitterTotals;
    twitterEngagementTimeSeries?: Array<{ date: string; value: number }>;
    recentTweets?: TwitterRecentTweetRow[];
  } = {
    platform: account.platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [],
    ...(insightsRangeHint && account.platform !== 'INSTAGRAM' ? { insightsHint: insightsRangeHint } : {}),
  };

  try {
    if (account.platform === 'INSTAGRAM') {
      let token = account.accessToken;
      token = await resolveFacebookPageAccessToken(account.platformUserId, token);
      const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object' ? account.credentialsJson : {}) as { loginMethod?: string };
      const isInstagramBusinessLogin = credJson?.loginMethod === 'instagram_business';

      const tryProfile = async (base: string): Promise<boolean> => {
        try {
          const profileRes = await axios.get<{
            followers_count?: number | string;
            media_count?: number;
            follows_count?: number | string;
            error?: { message?: string; code?: number };
          }>(`${base}/${account.platformUserId}`, {
            params: { fields: 'followers_count,media_count,follows_count', access_token: token },
            timeout: 8_000,
            validateStatus: () => true,
          });
          if (profileRes.status >= 400) return false;
          if (profileRes.data?.error?.message) {
            console.warn('[Insights] Instagram profile:', base, profileRes.data.error.message.slice(0, 120));
          }
          const fc = parseIgFollowerCount(profileRes.data?.followers_count);
          if (fc != null) out.followers = fc;
          const fwing = parseIgFollowerCount(profileRes.data?.follows_count);
          if (fwing != null) out.followingCount = fwing;
          return fc != null;
        } catch (e) {
          console.warn('[Insights] Instagram profile:', base, (e as Error)?.message ?? e);
        }
        return false;
      };

      // Prefer graph.facebook.com for Page-linked; fall back to graph.instagram.com for Instagram-only (Business Login).
      // Also retry with igBaseUrl when fbBaseUrl returned followers_count=0 (profileOk can be true yet followers=0).
      let profileOk = await tryProfile(fbBaseUrl);
      if (!profileOk || out.followers === 0) {
        await tryProfile(igBaseUrl);
      }
      // Page-linked IG: user node sometimes returns followers_count=0; Page → instagram_business_account is authoritative.
      const credLinked = credJson as { loginMethod?: string; linkedPageId?: string };
      if (out.followers === 0 && credLinked.linkedPageId && token) {
        try {
          const pageRes = await axios.get<{
            instagram_business_account?: { id?: string; followers_count?: number; follows_count?: number };
            error?: { message?: string };
          }>(`${fbBaseUrl}/${credLinked.linkedPageId}`, {
            params: { fields: 'instagram_business_account{id,followers_count,follows_count}', access_token: token },
            timeout: 8_000,
            validateStatus: () => true,
          });
          const igba = pageRes.data?.instagram_business_account;
          if (igba && igba.id === account.platformUserId) {
            const fc = parseIgFollowerCount(igba.followers_count);
            if (fc != null) out.followers = fc;
            const fwing = parseIgFollowerCount(igba.follows_count);
            if (fwing != null) out.followingCount = fwing;
          }
        } catch (e) {
          console.warn('[Insights] Instagram followers via linked Page:', (e as Error)?.message?.slice(0, 120));
        }
      }
      // Page access token: Graph /me is the Page; read instagram_business_account for the connected IG user (fixes missing/wrong linkedPageId in DB).
      if (out.followers === 0 && token) {
        try {
          const meFb = await axios.get<{ id?: string; error?: { message?: string } }>(`${fbBaseUrl}/me`, {
            params: { fields: 'id', access_token: token },
            timeout: 8_000,
            validateStatus: () => true,
          });
          if (meFb.status < 400 && meFb.data?.id && !meFb.data.error) {
            const pageNode = await axios.get<{
              instagram_business_account?: { id?: string; followers_count?: number | string; follows_count?: number | string };
              error?: { message?: string };
            }>(`${fbBaseUrl}/${meFb.data.id}`, {
              params: { fields: 'instagram_business_account{id,followers_count,follows_count}', access_token: token },
              timeout: 8_000,
              validateStatus: () => true,
            });
            if (pageNode.status < 400 && !pageNode.data?.error) {
              const iba = pageNode.data?.instagram_business_account;
              if (iba?.id === account.platformUserId) {
                const fc = parseIgFollowerCount(iba.followers_count);
                if (fc != null) out.followers = fc;
                const fwing = parseIgFollowerCount(iba.follows_count);
                if (fwing != null) out.followingCount = fwing;
              }
            }
          }
        } catch (_) {
          /* best-effort */
        }
      }
      // User access token: enumerate Pages and match the Instagram Business account id.
      if (out.followers === 0 && token) {
        try {
          const accountsRes = await axios.get<{
            data?: Array<{ instagram_business_account?: { id?: string; followers_count?: number | string; follows_count?: number | string } }>;
            error?: { message?: string };
          }>(`${fbBaseUrl}/me/accounts`, {
            params: { fields: 'instagram_business_account{id,followers_count,follows_count}', access_token: token },
            timeout: 10_000,
            validateStatus: () => true,
          });
          if (accountsRes.status < 400 && !accountsRes.data?.error) {
            for (const row of accountsRes.data?.data ?? []) {
              const iba = row.instagram_business_account;
              if (iba?.id === account.platformUserId) {
                const fc = parseIgFollowerCount(iba.followers_count);
                if (fc != null) out.followers = fc;
                const fwing = parseIgFollowerCount(iba.follows_count);
                if (fwing != null) out.followingCount = fwing;
                break;
              }
            }
          }
        } catch (_) {
          /* best-effort */
        }
      }
      // Final fallback: use /me endpoint with token directly (bypasses any platformUserId mismatch).
      if (out.followers === 0) {
        try {
          const meRes = await axios.get<{ followers_count?: number | string; follows_count?: number | string; error?: { message?: string } }>(
            `${igBaseUrl}/me`,
            { params: { fields: 'followers_count,follows_count', access_token: token }, timeout: 8_000, validateStatus: () => true }
          );
          const fc = parseIgFollowerCount(meRes.data?.followers_count);
          if (fc != null && fc > 0) out.followers = fc;
          const fwing = parseIgFollowerCount(meRes.data?.follows_count);
          if (fwing != null && out.followingCount === undefined) out.followingCount = fwing;
        } catch (_) { /* silent — best-effort */ }
      }

      const igSeriesByMetric: Record<string, Array<{ date: string; value: number }>> = {};

      const parseIgInsightsData = (data: Array<{
        name: string;
        values?: Array<{ value: number; end_time?: string }>;
        total_value?: { value: number; breakdowns?: unknown[] };
      }>) => {
        for (const d of data) {
          const sumDaily =
            (d.values ?? []).reduce((s, v) => s + (typeof v.value === 'number' ? v.value : 0), 0);
          const totalRaw =
            typeof d.total_value?.value === 'number' ? d.total_value.value : sumDaily;
          const total = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
          const series: Array<{ date: string; value: number }> =
            (d.values ?? []).length > 0
              ? (d.values ?? [])
                  .map((v) => ({
                    date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '',
                    value: Math.max(0, typeof v.value === 'number' ? v.value : 0),
                  }))
                  .filter((x) => x.date)
                  .sort((a, b) => a.date.localeCompare(b.date))
              : [];
          if (series.length > 0) igSeriesByMetric[d.name] = series;
          if (d.name === 'impressions') {
            out.impressionsTotal = total;
            out.impressionsTimeSeries = series.length ? series : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
          } else if (d.name === 'reach') {
            out.reachTotal = Math.max(out.reachTotal ?? 0, total);
            if (!(out.impressionsTimeSeries?.length) && series.length) {
              out.impressionsTimeSeries = series;
              if (!out.impressionsTotal) out.impressionsTotal = total;
            }
          } else if (d.name === 'profile_views') {
            out.profileViewsTotal = total;
          } else if (d.name === 'accounts_engaged') {
            out.accountsEngaged = total;
          }
        }
      };

      const tryInsights = async (base: string): Promise<boolean> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return false;
        if (budgetExpired()) return false;
        // v22.0: `reach` is a valid period=day metric; `accounts_engaged` requires metric_type=total_value
        // and must be fetched alone; `accounts_reached` is not valid — only `reach` works.
        let reachOk = false;
        try {
          const reachRes = await axios.get<{
            data?: Array<{
              name: string;
              values?: Array<{ value: number; end_time?: string }>;
              total_value?: { value: number; breakdowns?: unknown[] };
            }>;
            error?: { message?: string; code?: number };
          }>(`${base}/${account.platformUserId}/insights`, {
            params: {
              metric: 'reach',
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
              access_token: token,
            },
            timeout: 10_000,
            validateStatus: () => true,
          });
          if (!reachRes.data?.error && reachRes.data?.data?.length) {
            parseIgInsightsData(reachRes.data.data);
            reachOk = true;
          } else if (reachRes.data?.error) {
            console.warn('[Insights] IG reach failed:', base, reachRes.data.error.message?.slice(0, 120));
          }
        } catch (e) {
          console.warn('[Insights] IG reach error:', base, (e as Error)?.message ?? e);
        }
        return reachOk;
      };

      let insightsOk = await tryInsights(fbBaseUrl);
      // graph.instagram.com only accepts Instagram User tokens (Instagram Business Login). Page tokens fail with "Cannot parse access token".
      if (!insightsOk || isInstagramBusinessLogin) {
        const igOk = await tryInsights(igBaseUrl);
        if (!insightsOk) insightsOk = igOk;
      }
      /** Fallback metric sets can omit accounts_engaged; fetch it alone so the Performance card is not stuck at 0. */
      const supplementIgAccountsEngaged = async (base: string): Promise<void> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return;
        if (budgetExpired()) return;
        if (igSeriesByMetric.accounts_engaged?.length) return;

        const tryFetch = async (extraParams: Record<string, string | number | undefined>): Promise<boolean> => {
          try {
            const res = await axios.get<{
              data?: Array<{
                name: string;
                values?: Array<{ value: number; end_time?: string }>;
                total_value?: { value: number };
              }>;
              error?: { message?: string };
            }>(`${base}/${account.platformUserId}/insights`, {
              params: { metric: 'accounts_engaged', period: 'day', since: effectiveSinceTs, until: effectiveUntilTs, access_token: token, ...extraParams },
              timeout: 10_000,
              validateStatus: () => true,
            });
            if (res.data?.error || !res.data?.data?.length) return false;
            const d = res.data.data.find((x) => x.name === 'accounts_engaged');
            if (!d) return false;
            const sumDaily = (d.values ?? []).reduce((s, v) => s + (typeof v.value === 'number' ? v.value : 0), 0);
            const totalRaw = typeof d.total_value?.value === 'number' ? d.total_value.value : sumDaily;
            out.accountsEngaged = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
            const series: Array<{ date: string; value: number }> = (d.values ?? []).length > 0
              ? (d.values ?? []).map((v) => ({ date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '', value: Math.max(0, typeof v.value === 'number' ? v.value : 0) })).filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date))
              : [];
            if (series.length > 0) igSeriesByMetric.accounts_engaged = series;
            return (out.accountsEngaged ?? 0) > 0 || series.length > 0;
          } catch { return false; }
        };

        await tryFetch({ metric_type: 'total_value' }) || await tryFetch({});
      };
      await supplementIgAccountsEngaged(fbBaseUrl);
      if (!igSeriesByMetric.accounts_engaged?.length && isInstagramBusinessLogin) {
        await supplementIgAccountsEngaged(igBaseUrl);
      }

      /** Account-level video views (reels + feed video); complements post-synced plays in the UI. */
      const supplementIgViews = async (base: string): Promise<void> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return;
        if (igSeriesByMetric.views?.length) return;
        if (budgetExpired()) return;
        try {
          const res = await axios.get<{
            data?: Array<{
              name: string;
              values?: Array<{ value: number; end_time?: string }>;
              total_value?: { value: number };
            }>;
            error?: { message?: string };
          }>(`${base}/${account.platformUserId}/insights`, {
            params: {
              metric: 'views',
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
              access_token: token,
            },
            timeout: 10_000,
          });
          if (res.data?.error || !res.data?.data?.length) return;
          const d = res.data.data.find((x) => x.name === 'views');
          if (!d) return;
          const sumDaily = (d.values ?? []).reduce((s, v) => s + (typeof v.value === 'number' ? v.value : 0), 0);
          const totalRaw = typeof d.total_value?.value === 'number' ? d.total_value.value : sumDaily;
          const total = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
          const series: Array<{ date: string; value: number }> =
            (d.values ?? []).length > 0
              ? (d.values ?? [])
                  .map((v) => ({
                    date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '',
                    value: Math.max(0, typeof v.value === 'number' ? v.value : 0),
                  }))
                  .filter((x) => x.date)
                  .sort((a, b) => a.date.localeCompare(b.date))
              : [];
          if (series.length > 0) igSeriesByMetric.views = series;
          out.instagramAccountVideoViewsTotal = total;
        } catch {
          /* metric may be unavailable for some account types */
        }
      };
      await supplementIgViews(fbBaseUrl);
      if (!igSeriesByMetric.views?.length && isInstagramBusinessLogin) await supplementIgViews(igBaseUrl);

      /**
       * Meta requires profile_views with metric_type=total_value (IG User Insights). Page tokens only work on graph.facebook.com.
       */
      const supplementIgProfileViews = async (): Promise<void> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return;
        if (igSeriesByMetric.profile_views?.length) return;
        if (budgetExpired()) return;

        const parseProfileViewsRow = (
          data:
            | Array<{
                name: string;
                values?: Array<{ value: number; end_time?: string }>;
                total_value?: {
                  value?: number;
                  breakdowns?: Array<{
                    dimension_keys?: string[];
                    results?: Array<{ dimension_values?: string[]; value: number; end_time?: string }>;
                  }>;
                };
              }>
            | undefined
        ): { total: number; series: Array<{ date: string; value: number }> } | null => {
          const d = data?.find((x) => x.name === 'profile_views');
          if (!d) return null;
          const fromValues = (d.values ?? []).filter((v) => typeof v.value === 'number');
          let series: Array<{ date: string; value: number }> =
            fromValues.length > 0
              ? fromValues
                  .map((v) => ({
                    date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '',
                    value: Math.max(0, v.value),
                  }))
                  .filter((x) => x.date)
                  .sort((a, b) => a.date.localeCompare(b.date))
              : [];
          const byDate = new Map<string, number>();
          for (const b of d.total_value?.breakdowns ?? []) {
            for (const r of b.results ?? []) {
              const date = r.end_time ? facebookMetricDateFromEndTime(r.end_time) : '';
              if (!date) continue;
              const val = typeof r.value === 'number' ? r.value : 0;
              byDate.set(date, (byDate.get(date) ?? 0) + val);
            }
          }
          if (series.length === 0 && byDate.size > 0) {
            series = Array.from(byDate.entries())
              .map(([date, value]) => ({ date, value: Math.max(0, value) }))
              .sort((a, b) => a.date.localeCompare(b.date));
          }
          const sumDaily = fromValues.reduce((s, v) => s + v.value, 0);
          const totalFromSeries = series.reduce((s, p) => s + p.value, 0);
          const totalRaw =
            series.length > 0
              ? totalFromSeries
              : typeof d.total_value?.value === 'number'
                ? d.total_value.value
                : sumDaily;
          const total = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
          if (series.length === 0 && total > 0) {
            series = [{ date: untilParam.slice(0, 10), value: total }];
          }
          if (total === 0 && series.length === 0) return null;
          return { total, series };
        };

        const probes: Array<{ period: 'day' | 'week' }> = [{ period: 'day' }, { period: 'week' }];
        const bases = isInstagramBusinessLogin ? [fbBaseUrl, igBaseUrl] : [fbBaseUrl];

        for (const base of bases) {
          const host = base.includes('instagram.com') ? 'ig' : 'fb';
          for (const { period } of probes) {
            try {
              const res = await axios.get<{
                data?: Array<{
                  name: string;
                  values?: Array<{ value: number; end_time?: string }>;
                  total_value?: {
                    value?: number;
                    breakdowns?: Array<{
                      dimension_keys?: string[];
                      results?: Array<{ dimension_values?: string[]; value: number; end_time?: string }>;
                    }>;
                  };
                }>;
                error?: { message?: string; code?: number };
              }>(`${base}/${account.platformUserId}/insights`, {
                params: {
                  metric: 'profile_views',
                  period,
                  metric_type: 'total_value',
                  since: effectiveSinceTs,
                  until: effectiveUntilTs,
                  access_token: token,
                },
                timeout: 12_000,
                validateStatus: () => true,
              });
              if (res.status >= 400) {
                const msg = res.data?.error?.message ?? `HTTP ${res.status}`;
                console.warn(`[Insights] IG profile_views ${host} ${period}…`, msg.slice(0, 160));
                continue;
              }
              const parsed = parseProfileViewsRow(res.data?.data);
              if (!parsed) continue;
              out.profileViewsTotal = parsed.total;
              if (parsed.series.length > 0) {
                igSeriesByMetric.profile_views = parsed.series;
                out.pageViewsTimeSeries = parsed.series;
              }
              return;
            } catch (e) {
              console.warn('[Insights] IG profile_views request failed:', host, (e as Error)?.message?.slice(0, 120));
            }
          }
        }
      };
      await supplementIgProfileViews();

      /**
       * Meta v22.0+ deprecated `impressions` for Instagram User Insights; the replacements are
       * `reach` / `accounts_reached` and `accounts_engaged`. Fetch them with metric_type=total_value
       * (required by Meta's newer endpoint format) when the regular period=day calls returned nothing.
       */
      const supplementIgReachAndEngagement = async (): Promise<void> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return;
        if (budgetExpired()) return;
        const needImpressions =
          !(out.impressionsTimeSeries ?? []).some((p) => p.value > 0) && !(out.impressionsTotal ?? 0);
        const needEngaged = !(out.accountsEngaged ?? 0);
        if (!needImpressions && !needEngaged) return;

        const parseDailyMetricRow = (
          d: { name: string; values?: Array<{ value: number; end_time?: string }>; total_value?: { value?: number } } | undefined
        ): { total: number; series: Array<{ date: string; value: number }> } | null => {
          if (!d) return null;
          const fromValues = (d.values ?? []).filter((v) => typeof v.value === 'number');
          const series: Array<{ date: string; value: number }> = fromValues.length > 0
            ? fromValues
                .map((v) => ({ date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '', value: Math.max(0, v.value) }))
                .filter((x) => x.date)
                .sort((a, b) => a.date.localeCompare(b.date))
            : [];
          const sumDaily = fromValues.reduce((s, v) => s + v.value, 0);
          const totalRaw = typeof d.total_value?.value === 'number' ? d.total_value.value : sumDaily;
          const total = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
          if (total === 0 && series.length === 0) return null;
          return { total, series: series.length > 0 ? series : (total > 0 ? [{ date: untilParam.slice(0, 10), value: total }] : []) };
        };

        // Try batches from broadest to narrowest; use reach/accounts_reached as impressions replacement.
        const buildBatch = (m: string[], p: 'day' | 'week'): { metrics: string[]; period: 'day' | 'week' } => ({ metrics: m, period: p });
        const batches = [
          buildBatch(needImpressions && needEngaged ? ['reach', 'accounts_engaged'] : needImpressions ? ['reach'] : ['accounts_engaged'], 'day'),
          buildBatch(needImpressions && needEngaged ? ['accounts_reached', 'accounts_engaged'] : needImpressions ? ['accounts_reached'] : ['accounts_engaged'], 'day'),
          buildBatch(needImpressions ? ['reach'] : [], 'week'),
          buildBatch(needImpressions ? ['accounts_reached'] : [], 'week'),
        ].filter((b) => b.metrics.length > 0);

        const bases = isInstagramBusinessLogin ? [fbBaseUrl, igBaseUrl] : [fbBaseUrl];

        for (const { metrics, period } of batches) {
          if (!needImpressions && !needEngaged) break;
          for (const base of bases) {
            try {
              const res = await axios.get<{
                data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }>; total_value?: { value?: number } }>;
                error?: { message?: string; code?: number };
              }>(`${base}/${account.platformUserId}/insights`, {
                params: {
                  metric: metrics.join(','),
                  period,
                  metric_type: 'total_value',
                  since: effectiveSinceTs,
                  until: effectiveUntilTs,
                  access_token: token,
                },
                timeout: 12_000,
                validateStatus: () => true,
              });
              if (res.status >= 400 || res.data?.error) {
                console.warn('[Insights] IG reach+engaged total_value:', res.data?.error?.message?.slice(0, 120));
                continue;
              }
              const data = res.data?.data ?? [];
              if (data.length === 0) continue;
              for (const d of data) {
                const parsed = parseDailyMetricRow(d);
                if (!parsed) continue;
                // reach / accounts_reached → content views (impressions)
                if ((d.name === 'reach' || d.name === 'accounts_reached') && needImpressions && !(out.impressionsTotal ?? 0)) {
                  out.impressionsTotal = parsed.total;
                  out.impressionsTimeSeries = parsed.series;
                  if (parsed.series.length > 0) igSeriesByMetric[d.name] = parsed.series;
                } else if (d.name === 'accounts_engaged' && needEngaged && !(out.accountsEngaged ?? 0)) {
                  out.accountsEngaged = parsed.total;
                  if (parsed.series.length > 0) igSeriesByMetric.accounts_engaged = parsed.series;
                }
              }
              break; // move to next batch if this base worked
            } catch (e) {
              console.warn('[Insights] IG reach+engaged total_value request failed:', (e as Error)?.message?.slice(0, 120));
            }
          }
        }
      };
      await supplementIgReachAndEngagement();

      /** IG User /insights: likes, comments, shares, saves, reposts, total_interactions (period=day). */
      const mergeIgInteractionTotals = (
        prev: NonNullable<(typeof out)['instagramInteractionTotals']>,
        next: NonNullable<(typeof out)['instagramInteractionTotals']>
      ): NonNullable<(typeof out)['instagramInteractionTotals']> => ({
        likes: Math.max(prev.likes ?? 0, next.likes ?? 0),
        comments: Math.max(prev.comments ?? 0, next.comments ?? 0),
        shares: Math.max(prev.shares ?? 0, next.shares ?? 0),
        saves: Math.max(prev.saves ?? 0, next.saves ?? 0),
        reposts: Math.max(prev.reposts ?? 0, next.reposts ?? 0),
        totalInteractions: Math.max(prev.totalInteractions ?? 0, next.totalInteractions ?? 0),
      });
      const supplementIgInteractionMetrics = async (base: string): Promise<void> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return;
        if (budgetExpired()) return;
        const metricSets = [
          'likes,comments,shares,saves,total_interactions,reposts',
          'likes,comments,shares,saves,total_interactions',
          'likes,comments,shares,saves',
          'likes,comments',
          'likes',
          'comments',
          'shares',
          'saves',
          'reposts',
          'total_interactions',
        ];
        for (const metricSet of metricSets) {
          try {
            const insightsRes = await axios.get<{
              data?: Array<{
                name: string;
                values?: Array<{ value: number; end_time?: string }>;
                total_value?: { value: number };
              }>;
              error?: { message?: string };
            }>(`${base}/${account.platformUserId}/insights`, {
              params: {
                metric: metricSet,
                period: 'day',
                since: effectiveSinceTs,
                until: effectiveUntilTs,
                access_token: token,
              },
              timeout: 12_000,
            });
            if (insightsRes.data?.error || !insightsRes.data?.data?.length) continue;
            const picked: NonNullable<(typeof out)['instagramInteractionTotals']> = {};
            for (const d of insightsRes.data.data) {
              const sumDaily = (d.values ?? []).reduce((s, v) => s + (typeof v.value === 'number' ? v.value : 0), 0);
              const totalRaw = typeof d.total_value?.value === 'number' ? d.total_value.value : sumDaily;
              const total = Math.max(0, Math.round(Number.isFinite(totalRaw) ? totalRaw : 0));
              const series: Array<{ date: string; value: number }> =
                (d.values ?? []).length > 0
                  ? (d.values ?? [])
                      .map((v) => ({
                        date: v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '',
                        value: Math.max(0, typeof v.value === 'number' ? v.value : 0),
                      }))
                      .filter((x) => x.date)
                      .sort((a, b) => a.date.localeCompare(b.date))
                  : [];
              if (series.length > 0) igSeriesByMetric[d.name] = series;
              if (d.name === 'likes') picked.likes = total;
              else if (d.name === 'comments') picked.comments = total;
              else if (d.name === 'shares') picked.shares = total;
              else if (d.name === 'saves') picked.saves = total;
              else if (d.name === 'reposts') picked.reposts = total;
              else if (d.name === 'total_interactions') picked.totalInteractions = total;
            }
            if (Object.keys(picked).length > 0) {
              out.instagramInteractionTotals = mergeIgInteractionTotals(
                out.instagramInteractionTotals ?? {
                  likes: 0,
                  comments: 0,
                  shares: 0,
                  saves: 0,
                  reposts: 0,
                  totalInteractions: 0,
                },
                picked
              );
            }
            return;
          } catch {
            /* try next set */
          }
        }
      };
      await supplementIgInteractionMetrics(fbBaseUrl);
      if (isInstagramBusinessLogin) await supplementIgInteractionMetrics(igBaseUrl);

      const profileViewsSeries = igSeriesByMetric.profile_views;
      if (profileViewsSeries && profileViewsSeries.length > 0) {
        out.pageViewsTimeSeries = profileViewsSeries;
      }
      if (Object.keys(igSeriesByMetric).length > 0) {
        try {
          await persistInsightsSeries({
            userId,
            socialAccountId: account.id,
            platform: 'INSTAGRAM',
            externalAccountId: account.platformUserId,
            seriesByMetric: igSeriesByMetric,
          });
        } catch (e) {
          console.warn('[Insights] Persist IG insights:', (e as Error)?.message ?? e);
        }
      }

      // Fetch daily follower change so we can show exact follower count over time (same scope: instagram_manage_insights / instagram_business_manage_insights).
      // Prefer follows_and_unfollows (net per day) so past days are correct; fallback to follower_count (new per day only, so unfollows not reflected).
      // end_time is end-of-day (often Pacific) so normalize to metric date like Facebook (subtract 1 day in UTC).
      const toMetricDate = (endTime: string): string => {
        const d = new Date(endTime);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      };
      const tryFollowsAndUnfollows = async (base: string): Promise<boolean> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null || out.followers < 100) return false;
        try {
          const res = await axios.get<{
            data?: Array<{
              name: string;
              total_value?: { breakdowns?: Array<{ dimension_keys?: string[]; results?: Array<{ dimension_values?: string[]; value: number; end_time?: string }> }> };
              values?: Array<{ value: number; end_time?: string }>;
            }>;
            error?: { message?: string };
          }>(`${base}/${account.platformUserId}/insights`, {
            params: {
              metric: 'follows_and_unfollows',
              period: 'day',
              metric_type: 'total_value',
              breakdown: 'follow_type',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
              access_token: token,
            },
            timeout: 10_000,
          });
          if (res.data?.error || !res.data?.data?.length) return false;
          const metric = res.data.data.find((m) => m.name === 'follows_and_unfollows');
          const breakdowns = metric?.total_value?.breakdowns ?? [];
          const netByDate = new Map<string, number>();
          for (const b of breakdowns) {
            const results = b.results ?? [];
            for (const r of results) {
              const date = r.end_time ? toMetricDate(r.end_time) : '';
              if (!date) continue;
              const val = typeof r.value === 'number' ? r.value : 0;
              const dim = ((r.dimension_values ?? [])[0] ?? '').toLowerCase();
              const current = netByDate.get(date) ?? 0;
              // New followers = add; Unfollows / deactivated = subtract
              if (dim.includes('unfollow') || dim.includes('deactivat')) {
                netByDate.set(date, current - val);
              } else {
                netByDate.set(date, current + val);
              }
            }
          }
          const points = Array.from(netByDate.entries())
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));
          if (points.length === 0) return false;
          const totalNetInRange = points.reduce((s, p) => s + p.value, 0);
          const baseline = Math.max(0, out.followers - totalNetInRange);
          let running = baseline;
          out.followersTimeSeries = points.map((p) => {
            running = Math.max(0, running + p.value);
            return { date: p.date, value: running };
          });
          return true;
        } catch {
          return false;
        }
      };
      const tryFollowerCount = async (base: string): Promise<boolean> => {
        // Do not require followers >= 100: small accounts still get daily follower_count from Insights.
        if (effectiveSinceTs == null || effectiveUntilTs == null) return false;
        try {
          const res = await axios.get<{
            data?: Array<{
              name: string;
              values?: Array<{ value: number; end_time?: string }>;
            }>;
            error?: { message?: string };
          }>(`${base}/${account.platformUserId}/insights`, {
            params: {
              metric: 'follower_count',
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
              access_token: token,
            },
            timeout: 10_000,
          });
          if (res.data?.error || !res.data?.data?.length) return false;
          const metric = res.data.data.find((m) => m.name === 'follower_count');
          const values = metric?.values ?? [];
          if (values.length === 0) return false;
          const points = values
            .map((v) => ({
              date: v.end_time ? toMetricDate(v.end_time) : '',
              value: typeof v.value === 'number' ? v.value : 0,
            }))
            .filter((x) => x.date)
            .sort((a, b) => a.date.localeCompare(b.date));
          const totalGainedInRange = points.reduce((s, p) => s + p.value, 0);
          const baseline = Math.max(0, out.followers - totalGainedInRange);
          let running = baseline;
          out.followersTimeSeries = points.map((p) => {
            running += p.value;
            return { date: p.date, value: running };
          });
          return true;
        } catch {
          return false;
        }
      };
      const fuOk = await tryFollowsAndUnfollows(fbBaseUrl);
      if (!fuOk && (isInstagramBusinessLogin || out.followers > 0)) await tryFollowsAndUnfollows(igBaseUrl);
      if (!out.followersTimeSeries?.length) {
        const fcOk = await tryFollowerCount(fbBaseUrl);
        if (!fcOk && (isInstagramBusinessLogin || out.followers > 0)) await tryFollowerCount(igBaseUrl);
      }

      const extended = request.nextUrl.searchParams.get('extended') === '1';
      if (extended) {
        try {
          const { demographics, raw: igRaw } = await fetchInstagramDemographics(
            account.platformUserId,
            account.accessToken ?? '',
            'last_30_days'
          );
          out.demographics = demographics;
          const byCountry = normalizeAudienceCountryRows(demographics.byCountry ?? []);
          if (byCountry.length > 0) {
            const rawObj = (igRaw && typeof igRaw === 'object') ? (igRaw as Record<string, unknown>) : {};
            const hasFollowerCountry = Boolean(rawObj.follower_demographics_country);
            out.audienceByCountry = {
              label: hasFollowerCountry ? 'Follower demographics by country' : 'Engaged audience demographics by country',
              rows: byCountry,
            };
          }
          if (igRaw && typeof igRaw === 'object') out.raw = { ...(out.raw ?? {}), instagram: igRaw };
        } catch (e) {
          console.warn('[Insights] Instagram extended demographics:', (e as Error)?.message ?? e);
        }
      }
      // Persistent follower/following history (Instagram only; YouTube excluded). Use our snapshots or bootstrap flat line.
      try {
        const history = await getAccountHistorySeries({
          userId,
          socialAccountId: account.id,
          platform: 'INSTAGRAM',
          externalAccountId: account.platformUserId,
          since: effectiveSinceParam ?? sinceParam,
          until: effectiveUntilParam ?? untilParam,
        });
        const connectionStart = account.firstConnectedAt ?? (sinceParam ? new Date(sinceParam + 'T12:00:00Z') : new Date());
        out.firstConnectedAt = account.firstConnectedAt?.toISOString().slice(0, 10) ?? null;
        if (history.snapshotCount >= 2) {
          out.followersTimeSeries = history.followersTimeSeries;
          if (history.followingTimeSeries) out.followingTimeSeries = history.followingTimeSeries;
          out.metricHistoryFromSnapshots = true;
          out.isBootstrap = false;
        } else {
          out.isBootstrap = true;
          const bootstrap = buildBootstrapFlatSeries({
            firstConnectedAt: connectionStart ?? new Date(),
            endDate: effectiveUntilParam ?? untilParam ?? new Date().toISOString().slice(0, 10),
            followersCount: out.followers,
            followingCount: out.followingCount ?? null,
          });
          out.followersTimeSeries = bootstrap.followersTimeSeries;
          if (bootstrap.followingTimeSeries) out.followingTimeSeries = bootstrap.followingTimeSeries;
          out.metricHistoryFromSnapshots = true;
        }
      } catch (e) {
        console.warn('[Insights] Instagram metric history:', (e as Error)?.message ?? e);
      }
      // Merge snapshot-backed insights so we show full timeline from connection when API window (e.g. 28 days) is shorter than requested range.
      if (sinceParam && untilParam) {
        try {
          const snapshotImpressions = await getInsightsTimeSeries({
            userId,
            platform: 'INSTAGRAM',
            externalAccountId: account.platformUserId,
            since: sinceParam,
            until: untilParam,
            metricKey: 'impressions',
          });
          out.impressionsTimeSeries = mergeSeriesWithSnapshots(
            out.impressionsTimeSeries,
            snapshotImpressions,
            sinceParam,
            untilParam
          );
        } catch (e) {
          console.warn('[Insights] Merge IG impressions from snapshots:', (e as Error)?.message ?? e);
        }
        try {
          const snapshotProfileViews = await getInsightsTimeSeries({
            userId,
            platform: 'INSTAGRAM',
            externalAccountId: account.platformUserId,
            since: sinceParam,
            until: untilParam,
            metricKey: 'profile_views',
          });
          if (snapshotProfileViews.length > 0) {
            const mergedPv = mergeSeriesWithSnapshots(
              out.pageViewsTimeSeries ?? [],
              snapshotProfileViews,
              sinceParam,
              untilParam
            );
            if (mergedPv.length > 0) {
              out.pageViewsTimeSeries = mergedPv;
              const pvSum = mergedPv.reduce((s, p) => s + p.value, 0);
              out.profileViewsTotal = Math.max(out.profileViewsTotal ?? 0, pvSum);
            }
          }
        } catch (e) {
          console.warn('[Insights] Merge IG profile_views from snapshots:', (e as Error)?.message ?? e);
        }
      }
      // When live profile API returned 0 followers, use last known from snapshot-backed series.
      if (out.followers === 0 && out.followersTimeSeries?.length) {
        const lastPoint = out.followersTimeSeries[out.followersTimeSeries.length - 1];
        if (typeof lastPoint?.value === 'number' && lastPoint.value > 0) {
          out.followers = lastPoint.value;
          if (!out.insightsHint) {
            out.insightsHint = 'Follower count is from our last sync. Reconnect Instagram to refresh.';
          }
        }
      }
      if (
        !out.insightsHint &&
        out.followers === 0 &&
        (out.profileViewsTotal ?? 0) === 0 &&
        ((out.accountsEngaged ?? 0) > 0 || (out.impressionsTotal ?? 0) > 0)
      ) {
        out.insightsHint = 'Instagram connected, but Meta did not return follower/profile view totals. Reconnect with Edit previous settings and grant Instagram insights permissions.';
      }
      if (Object.keys(igSeriesByMetric).length > 0) {
        out.facebookPageMetricSeries = {
          ...igSeriesByMetric,
          ...(out.impressionsTimeSeries?.length ? { impressions: out.impressionsTimeSeries } : {}),
        };
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'FACEBOOK') {
      const shouldForceLiveFetch = request.nextUrl.searchParams.get('refresh') === '1';
      (out as Record<string, unknown>).facebookDataSourceDebug = { liveMetricRows: -1, fallbackDailyRows: -1, fallbackMetricKeys: [] };
      let token = account.accessToken;
      token = await resolveFacebookPageAccessToken(account.platformUserId, token);
      let fbTokenValid = false;
      try {
        const pageRes = await fetchPageProfile(account.platformUserId, token);
        if (pageRes.status === 200) {
          fbTokenValid = true;
          const p = pageRes.data;
          (out as Record<string, unknown>).facebookPageProfile = {
            id: p?.id,
            name: p?.name,
            username: p?.username,
            category: p?.category ?? p?.category_list?.[0]?.name,
            followers_count: typeof p?.followers_count === 'number' ? p.followers_count : undefined,
            fan_count: typeof p?.fan_count === 'number' ? p.fan_count : undefined,
            website: p?.website,
            is_published: typeof p?.is_published === 'boolean' ? p.is_published : undefined,
            is_verified: typeof p?.is_verified === 'boolean' ? p.is_verified : undefined,
            verification_status: p?.verification_status,
          };
          const fanN = parseIgFollowerCount(p?.fan_count);
          const folN = parseIgFollowerCount(p?.followers_count);
          if (fanN != null) out.followers = fanN;
          else if (folN != null) out.followers = folN;
        } else {
          const errData = pageRes.data as Record<string, unknown> | null;
          const errCode = (errData?.error as Record<string, unknown> | null)?.code;
          console.warn('[Insights] Facebook page profile non-200:', pageRes.status, JSON.stringify(errData)?.slice(0, 200));
          if (pageRes.status === 400 || pageRes.status === 401 || errCode === 190 || errCode === 102) {
            out.insightsHint = 'Facebook session expired. Please reconnect your Facebook account from the Accounts page.';
          }
        }
      } catch (e) {
        console.warn('[Insights] Facebook page profile:', (e as Error)?.message ?? e);
        if (!out.insightsHint) {
          out.insightsHint = 'Could not load follower count from Facebook. Reconnect from the sidebar (or use the button below) to refresh.';
        }
      }
      try {
        await ensureFacebookTables();
        const loadFacebookCommunity = async () =>
          Promise.all([
            prisma.facebookConversationCache.count({ where: { socialAccountId: account.id } }),
            prisma.facebookConversationCache.findFirst({
              where: { socialAccountId: account.id },
              orderBy: { updatedTime: 'desc' },
              select: { updatedTime: true },
            }),
            prisma.facebookReviewCache.count({ where: { socialAccountId: account.id } }),
            prisma.facebookReviewCache.findFirst({
              where: { socialAccountId: account.id },
              orderBy: { sourceCreatedAt: 'desc' },
              select: { reviewText: true, recommendationType: true },
            }),
          ]);

        let [conversationsCount, latestConversation, ratingsCount, latestReview] = await loadFacebookCommunity();

        const pageCacheRow = await prisma.facebookPageCache.findUnique({
          where: { socialAccountId: account.id },
          select: { fetchedAt: true },
        });
        const auxStaleMs = 10 * 60 * 1000;
        const shouldAuxRefresh =
          conversationsCount === 0 &&
          ratingsCount === 0 &&
          token &&
          shouldForceLiveFetch &&
          (!pageCacheRow?.fetchedAt || Date.now() - pageCacheRow.fetchedAt.getTime() > auxStaleMs);
        if (shouldAuxRefresh && !budgetExpired()) {
          try {
            const aux = await syncFacebookAuxiliaryIngest({
              socialAccountId: account.id,
              pageId: account.platformUserId,
              accessToken: token,
            });
            if (aux.errors.length > 0) {
              console.warn('[Insights] Facebook auxiliary ingest:', aux.errors.join('; '));
            }
            [conversationsCount, latestConversation, ratingsCount, latestReview] = await loadFacebookCommunity();
          } catch (e) {
            console.warn('[Insights] Facebook auxiliary ingest failed:', (e as Error)?.message ?? e);
          }
        }

        const reviewSnippet = latestReview?.reviewText?.trim();
        const latestRecommendationText =
          reviewSnippet ||
          (latestReview?.recommendationType
            ? latestReview.recommendationType
                .split(/[_\s]+/)
                .filter(Boolean)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ')
            : null);

        (out as Record<string, unknown>).facebookCommunity = {
          conversationsCount,
          latestConversationAt: latestConversation?.updatedTime?.toISOString?.() ?? null,
          ratingsCount,
          latestRecommendationText,
        };
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        const missingTable =
          msg.includes('facebook_conversations') ||
          msg.includes('facebook_reviews') ||
          msg.includes('does not exist') ||
          msg.includes('P2021');
        if (!missingTable) {
          console.warn('[Insights] Facebook community summary:', msg);
        }
      }
      if (effectiveSinceTs != null && effectiveUntilTs != null) {
        let skipLiveFetch = false;
        if (!shouldForceLiveFetch && effectiveSinceParam && effectiveUntilParam) {
          try {
            const daily = await prisma.facebookPageInsightDaily.findMany({
              where: {
                socialAccountId: account.id,
                metricDate: { gte: effectiveSinceParam, lte: effectiveUntilParam },
              },
              select: { metricDate: true, metricKey: true, value: true },
              orderBy: [{ metricDate: 'asc' }],
            });
            // Do not skip live Graph when DB only has placeholder/zero rows: that would lock the UI at 0 forever.
            if (daily.length > 0 && fbDailyRowsHavePositiveCoreSignal(daily)) {
              const byMetric = new Map<string, Array<{ date: string; value: number }>>();
              for (const row of daily) {
                const list = byMetric.get(row.metricKey) ?? [];
                list.push({ date: row.metricDate, value: Math.max(0, Math.round(Number(row.value) || 0)) });
                byMetric.set(row.metricKey, list);
              }
              const toSeries = (key: string) => (byMetric.get(key) ?? []).sort((a, b) => a.date.localeCompare(b.date));
              const impressionsSeries = toSeries('page_impressions');
              const mediaViewSeries = toSeries('page_media_view');
              const chosenImpressions = impressionsSeries.length ? impressionsSeries : mediaViewSeries;
              const pageViewsSeries = toSeries('page_views_total');
              const engagementsSeries = toSeries('page_post_engagements');
              if (!out.impressionsTimeSeries.length && chosenImpressions.length) out.impressionsTimeSeries = chosenImpressions;
              if (!out.impressionsTotal && chosenImpressions.length) out.impressionsTotal = chosenImpressions.reduce((s, p) => s + p.value, 0);
              if (!out.pageViewsTimeSeries?.length && pageViewsSeries.length) out.pageViewsTimeSeries = pageViewsSeries;
              if (!out.pageViewsTotal && pageViewsSeries.length) out.pageViewsTotal = pageViewsSeries.reduce((s, p) => s + p.value, 0);
              if (!out.reachTotal && engagementsSeries.length) out.reachTotal = engagementsSeries.reduce((s, p) => s + p.value, 0);
              (out as Record<string, unknown>).facebookPageMetricSeries = Object.fromEntries(
                Array.from(byMetric.entries()).map(([k, v]) => [k, v.sort((a, b) => a.date.localeCompare(b.date))])
              );
              (out as Record<string, unknown>).facebookDataSourceDebug = {
                liveMetricRows: 0,
                fallbackDailyRows: daily.length,
                fallbackMetricKeys: Array.from(byMetric.keys()),
              };
              skipLiveFetch = true;
            }
          } catch (e) {
            console.warn('[Insights] FB normalized daily prefetch:', (e as Error)?.message ?? e);
          }
        }
        if (!skipLiveFetch) try {
          let liveMetricCount = 0;
          const untilForApi = (() => {
            const d = new Date(effectiveUntilParam + 'T12:00:00');
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            if (d >= today) {
              d.setUTCDate(d.getUTCDate() - 1);
            }
            return d.toISOString().slice(0, 10);
          })();
          const untilApi = (() => {
            const d = new Date(untilForApi + 'T12:00:00');
            d.setUTCDate(d.getUTCDate() + 1);
            return d.toISOString().slice(0, 10);
          })();
          // Direct parallel fetch of core metrics - bypasses the discovery probe system
          // (discovery runs up to 16 sequential API calls per metric which can exceed the 30s Vercel limit).
          // The cron/sync path still uses fetchMergedFacebookPageDayInsights for full discovery.
          const CORE_FB_METRICS_LITE = [
            'page_views_total',
            'page_post_engagements',
            'page_impressions',
            'page_media_view',
            'page_fan_adds',
            'page_fan_removes',
            /** Traffic tab: page-level post impressions (distinct from per-post insights in the UI). */
            'page_posts_impressions',
            'page_posts_impressions_nonviral',
            'page_posts_impressions_viral',
          ];
          const CORE_FB_METRICS_FULL = [
            ...CORE_FB_METRICS_LITE,
            'page_video_views',
            'page_follows',
            'page_total_actions',
          ];
          const useFullFbMetricSet =
            shouldForceLiveFetch || request.nextUrl.searchParams.get('extended') === '1';
          const CORE_FB_METRICS = useFullFbMetricSet ? CORE_FB_METRICS_FULL : CORE_FB_METRICS_LITE;
          type FbInsightRow = { name: string; values?: Array<{ value: number | string; end_time?: string }> };
          const rows: FbInsightRow[] = [];
          const graphErrors: string[] = [];
          /** Small batches reduce Meta rate-limit (#613) bursts from firing 9 insights calls at once. */
          const FB_INSIGHT_PARALLEL = 3;
          for (let bi = 0; bi < CORE_FB_METRICS.length; bi += FB_INSIGHT_PARALLEL) {
            if (budgetExpired()) break;
            const chunk = CORE_FB_METRICS.slice(bi, bi + FB_INSIGHT_PARALLEL);
            const chunkResults = await Promise.allSettled(
              chunk.map((metric) =>
                axios.get<{ data?: FbInsightRow[]; error?: { message?: string; code?: number } }>(
                  `${fbBaseUrl}/${account.platformUserId}/insights`,
                  {
                    params: { metric, period: 'day', since: effectiveSinceParam, until: untilApi, access_token: token },
                    timeout: 12_000,
                    validateStatus: () => true,
                  }
                )
              )
            );
            for (let j = 0; j < chunkResults.length; j++) {
              const result = chunkResults[j];
              const metric = chunk[j] ?? '?';
              if (result.status !== 'fulfilled') {
                graphErrors.push(`${metric}: ${(result.reason as Error)?.message ?? 'request failed'}`);
                continue;
              }
              const res = result.value;
              if (res.status !== 200) {
                graphErrors.push(`${metric}: HTTP ${res.status}`);
                continue;
              }
              const body = res.data;
              if (body?.error?.message) {
                graphErrors.push(`${metric}: ${body.error.message}`);
                continue;
              }
              for (const r of body?.data ?? []) {
                if (r?.name) rows.push(r);
              }
            }
          }
          const summary = { metricsFetched: CORE_FB_METRICS, graphErrors: graphErrors.length ? graphErrors : undefined };
          if (request.nextUrl.searchParams.get('extended') === '1') {
            (out as Record<string, unknown>).facebookInsightsSync = summary;
          }
          const data = rows;
          liveMetricCount = data.length;
          if (data.length === 0 && !out.impressionsTotal && !out.pageViewsTotal) {
            const errTail = graphErrors.length ? ` Meta: ${graphErrors.slice(0, 3).join(' | ')}` : '';
            out.insightsHint = !summary.metricsFetched?.length
              ? 'No Page insight metrics passed discovery for this Graph version. Confirm read_insights on the Page token, or set META_GRAPH_API_VERSION in env to match Meta (see docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md).'
              : `Page insights returned no data for this range.${errTail} Try a different date range, reconnect Facebook, or add ?refresh=1 once.`;
          }
          const addsByDate = new Map<string, number>();
          const removesByDate = new Map<string, number>();
          const fbSeriesByGraphMetric: Record<string, Array<{ date: string; value: number }>> = {};
          // Don't add explicit 0 for recent dates (Meta often returns 0 for "not yet available"); UI will carry forward last value
          const cutoffForZero = (() => {
            const d = new Date(untilForApi + 'T12:00:00');
            d.setUTCDate(d.getUTCDate() - 2);
            return d.toISOString().slice(0, 10);
          })();
          for (const d of data) {
            const values = d.values ?? [];
            let total = 0;
            const series: Array<{ date: string; value: number }> = [];
            for (const v of values) {
              const val = typeof v.value === 'number' ? v.value : Number(v.value) || 0;
              total += val;
              const date = v.end_time ? facebookMetricDateFromEndTime(v.end_time) : '';
              if (date) {
                if (val !== 0 || date <= cutoffForZero) series.push({ date, value: val });
              }
            }
            const sortedSeries = series.sort((a, b) => a.date.localeCompare(b.date));
            if (sortedSeries.length > 0) {
              fbSeriesByGraphMetric[d.name] = sortedSeries;
            }
            if (d.name === 'page_impressions' || d.name === 'page_media_view') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = sortedSeries.length ? sortedSeries : (total ? [{ date: effectiveUntilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_views_total') {
              out.pageViewsTotal = total;
              out.pageViewsTimeSeries = sortedSeries.length ? sortedSeries : (total ? [{ date: effectiveUntilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_post_engagements') {
              out.reachTotal = total;
            } else if (d.name === 'page_fan_adds') {
              for (const { date, value } of sortedSeries) addsByDate.set(date, value);
            } else if (d.name === 'page_fan_removes') {
              for (const { date, value } of sortedSeries) removesByDate.set(date, value);
            }
          }
          if (Object.keys(fbSeriesByGraphMetric).length > 0) {
            (out as Record<string, unknown>).facebookPageMetricSeries = fbSeriesByGraphMetric;
            if (persistInsightsToDb) {
              try {
                const { dailyRowsUpserted } = await persistFacebookPageInsightsNormalized({
                  userId,
                  socialAccountId: account.id,
                  pageId: account.platformUserId,
                  seriesByGraphMetric: fbSeriesByGraphMetric,
                });
                if (request.nextUrl.searchParams.get('extended') === '1') {
                  (out as Record<string, unknown>).facebookInsightPersistence = { dailyRowsUpserted };
                }
              } catch (e) {
                console.warn('[Insights] Persist FB insights:', (e as Error)?.message ?? e);
              }
            }
          }
          // Fallback: when live Graph returns no usable rows, read normalized daily rows we already persisted.
          if (Object.keys(fbSeriesByGraphMetric).length === 0 && sinceParam && untilParam) {
            try {
              // Try exact date range first; if empty, broaden to last 90 days so we always show something.
              let daily = await prisma.facebookPageInsightDaily.findMany({
                where: {
                  socialAccountId: account.id,
                  metricDate: { gte: sinceParam, lte: untilParam },
                },
                select: { metricDate: true, metricKey: true, value: true },
                orderBy: [{ metricDate: 'asc' }],
              });
              if (daily.length === 0) {
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                daily = await prisma.facebookPageInsightDaily.findMany({
                  where: { socialAccountId: account.id, metricDate: { gte: ninetyDaysAgo.toISOString().slice(0, 10) } },
                  select: { metricDate: true, metricKey: true, value: true },
                  orderBy: [{ metricDate: 'asc' }],
                });
              }
              if (daily.length > 0) {
                const byMetric = new Map<string, Array<{ date: string; value: number }>>();
                for (const row of daily) {
                  const list = byMetric.get(row.metricKey) ?? [];
                  list.push({ date: row.metricDate, value: Math.max(0, Math.round(row.value)) });
                  byMetric.set(row.metricKey, list);
                }
                const toSeries = (key: string) => (byMetric.get(key) ?? []).sort((a, b) => a.date.localeCompare(b.date));
                const impressionsSeries = toSeries('page_impressions');
                const mediaViewSeries = toSeries('page_media_view');
                const chosenImpressions = impressionsSeries.length ? impressionsSeries : mediaViewSeries;
                const pageViewsSeries = toSeries('page_views_total');
                const engagementsSeries = toSeries('page_post_engagements');
                if (!out.impressionsTimeSeries.length && chosenImpressions.length) {
                  out.impressionsTimeSeries = chosenImpressions;
                }
                if (!out.impressionsTotal && chosenImpressions.length) {
                  out.impressionsTotal = chosenImpressions.reduce((s, p) => s + p.value, 0);
                }
                if (!out.pageViewsTimeSeries?.length && pageViewsSeries.length) {
                  out.pageViewsTimeSeries = pageViewsSeries;
                }
                if (!out.pageViewsTotal && pageViewsSeries.length) {
                  out.pageViewsTotal = pageViewsSeries.reduce((s, p) => s + p.value, 0);
                }
                if (!out.reachTotal && engagementsSeries.length) {
                  out.reachTotal = engagementsSeries.reduce((s, p) => s + p.value, 0);
                }
                (out as Record<string, unknown>).facebookPageMetricSeries = Object.fromEntries(
                  Array.from(byMetric.entries()).map(([k, v]) => [k, v.sort((a, b) => a.date.localeCompare(b.date))])
                );
                (out as Record<string, unknown>).facebookDataSourceDebug = {
                  liveMetricRows: liveMetricCount,
                  fallbackDailyRows: daily.length,
                  fallbackMetricKeys: Array.from(byMetric.keys()),
                };
              }
            } catch (e) {
              console.warn('[Insights] FB normalized daily fallback:', (e as Error)?.message ?? e);
            }
          } else {
            (out as Record<string, unknown>).facebookDataSourceDebug = {
              liveMetricRows: liveMetricCount,
              fallbackDailyRows: 0,
              fallbackMetricKeys: [],
            };
          }
          const allDates = [...new Set([...addsByDate.keys(), ...removesByDate.keys()])].sort((a, b) => a.localeCompare(b));
          if (allDates.length > 0) {
            out.growthTimeSeries = allDates.map((date) => {
              const gained = addsByDate.get(date) ?? 0;
              const lost = removesByDate.get(date) ?? 0;
              return { date, gained, lost, net: gained - lost };
            });
            const currentFollowers = out.followers;
            const points: Array<{ date: string; value: number }> = [];
            let followersAtNext = currentFollowers;
            for (let i = allDates.length - 1; i >= 0; i--) {
              const date = allDates[i];
              const gained = addsByDate.get(date) ?? 0;
              const lost = removesByDate.get(date) ?? 0;
              const net = gained - lost;
              const value = followersAtNext;
              points.unshift({ date, value });
              followersAtNext = followersAtNext - net;
            }
            out.followersTimeSeries = points;
          }
          // Hint when Meta returned data but all key metrics are zero
          if (!out.insightsHint && out.followers === 0 && (out.impressionsTotal ?? 0) === 0 && (out.pageViewsTotal ?? 0) === 0) {
            out.insightsHint = 'Followers, views, and page visits are all zero. This can happen if your Page is new, has no reach in this period, or if the app does not have read_insights permission. Try reconnecting Facebook and ensure read_insights is granted in Meta (Use cases → Pages API).';
          }
        } catch (e) {
          const ax = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
          const status = ax?.response?.status;
          const msg = ax?.response?.data?.error?.message ?? (e as Error)?.message;
          if (status !== 400) console.warn('[Insights] Facebook insights:', msg ?? e);
          if (!out.insightsHint) {
            out.insightsHint = msg
              ? `Page insights failed: ${msg}. Ensure read_insights is in your Meta app (Use cases → Pages API) and reconnect Facebook, then choose your Page.`
              : 'Reconnect from the sidebar and choose your Page when asked to see Page analytics.';
          }
        }
      }
      const extended = request.nextUrl.searchParams.get('extended') === '1';
      if (extended) {
        try {
          const { demographics, raw: fbRaw } = await fetchFacebookDemographics(
            account.platformUserId,
            account.accessToken ?? ''
          );
          out.demographics = demographics;
          const byCountry = normalizeAudienceCountryRows(demographics.byCountry ?? []);
          if (byCountry.length > 0) {
            const rawObj = (fbRaw && typeof fbRaw === 'object') ? (fbRaw as Record<string, unknown>) : {};
            const hasFansCountry = Boolean(rawObj.page_fans_country);
            out.audienceByCountry = {
              label: hasFansCountry ? 'Page fans by country' : 'Audience by country (impressions)',
              rows: byCountry,
            };
          }
          if (fbRaw && typeof fbRaw === 'object') out.raw = { ...(out.raw ?? {}), facebook: fbRaw };
        } catch (e) {
          console.warn('[Insights] Facebook extended demographics:', (e as Error)?.message ?? e);
        }
      }
      // Persistent follower/fans history (Facebook only; YouTube excluded). Use our snapshots or bootstrap flat line.
      try {
        const history = await getAccountHistorySeries({
          userId,
          socialAccountId: account.id,
          platform: 'FACEBOOK',
          externalAccountId: account.platformUserId,
          since: effectiveSinceParam ?? sinceParam,
          until: effectiveUntilParam ?? untilParam,
        });
        const connectionStart = account.firstConnectedAt ?? (sinceParam ? new Date(sinceParam + 'T12:00:00Z') : new Date());
        out.firstConnectedAt = account.firstConnectedAt?.toISOString().slice(0, 10) ?? null;
        if (history.snapshotCount >= 2) {
          out.followersTimeSeries = history.followersTimeSeries;
          out.metricHistoryFromSnapshots = true;
          out.isBootstrap = false;
        } else {
          out.isBootstrap = true;
          const bootstrap = buildBootstrapFlatSeries({
            firstConnectedAt: connectionStart,
            endDate: effectiveUntilParam ?? untilParam ?? new Date().toISOString().slice(0, 10),
            followersCount: out.followers,
            followingCount: null,
            fansCount: out.followers,
          });
          out.followersTimeSeries = bootstrap.followersTimeSeries;
          out.metricHistoryFromSnapshots = true;
        }
      } catch (e) {
        console.warn('[Insights] Facebook metric history:', (e as Error)?.message ?? e);
      }
      // When live API returned 0 followers, use last known count from our snapshots so "followers" doesn’t disappear
      if (out.followers === 0 && out.followersTimeSeries?.length) {
        const lastPoint = out.followersTimeSeries[out.followersTimeSeries.length - 1];
        if (typeof lastPoint?.value === 'number' && lastPoint.value > 0) {
          out.followers = lastPoint.value;
          if (!out.insightsHint) {
            out.insightsHint = 'Follower count is from our last sync. Reconnect Facebook to refresh.';
          }
        }
      }
      // Merge snapshot-backed insights so we show full timeline from connection when API window (e.g. 90 days) is shorter than requested range.
      if (sinceParam && untilParam) {
        try {
          const [snapshotImpressions, snapshotPageViews, snapshotPagePostEngagements] = await Promise.all([
            getInsightsTimeSeries({
              userId,
              platform: 'FACEBOOK',
              externalAccountId: account.platformUserId,
              since: sinceParam,
              until: untilParam,
              metricKey: 'page_impressions',
            }),
            getInsightsTimeSeries({
              userId,
              platform: 'FACEBOOK',
              externalAccountId: account.platformUserId,
              since: sinceParam,
              until: untilParam,
              metricKey: 'page_views_total',
            }),
            getInsightsTimeSeries({
              userId,
              platform: 'FACEBOOK',
              externalAccountId: account.platformUserId,
              since: sinceParam,
              until: untilParam,
              metricKey: 'page_post_engagements',
            }),
          ]);
          const apiImpressionsOnly = [...(out.impressionsTimeSeries ?? [])];
          const apiPageViewsOnly = [...(out.pageViewsTimeSeries ?? [])];
          out.impressionsTimeSeries = mergeSeriesWithSnapshots(
            apiImpressionsOnly,
            snapshotImpressions,
            sinceParam,
            untilParam
          );
          if (apiPageViewsOnly.length > 0) {
            out.pageViewsTimeSeries = mergeSeriesWithSnapshots(
              apiPageViewsOnly,
              snapshotPageViews,
              sinceParam,
              untilParam
            );
          } else if (snapshotPageViews.length > 0) {
            out.pageViewsTimeSeries = mergeSeriesWithSnapshots([], snapshotPageViews, sinceParam, untilParam);
          }
          out.impressionsTotal = sumMergedDailyOverCalendarRange(
            apiImpressionsOnly,
            snapshotImpressions,
            sinceParam,
            untilParam
          );
          out.pageViewsTotal = sumMergedDailyOverCalendarRange(
            apiPageViewsOnly,
            snapshotPageViews,
            sinceParam,
            untilParam
          );

          const graphSeries = {
            ...(((out as Record<string, unknown>).facebookPageMetricSeries ?? {}) as Record<
              string,
              Array<{ date: string; value: number }>
            >),
          };
          const apiEngagementsOnly = [...(graphSeries.page_post_engagements ?? [])];
          graphSeries.page_post_engagements = mergeSeriesWithSnapshots(
            apiEngagementsOnly,
            snapshotPagePostEngagements,
            sinceParam,
            untilParam
          );
          (out as Record<string, unknown>).facebookPageMetricSeries = graphSeries;
          out.reachTotal = sumMergedDailyOverCalendarRange(
            apiEngagementsOnly,
            snapshotPagePostEngagements,
            sinceParam,
            untilParam
          );
        } catch (e) {
          console.warn('[Insights] Merge FB insights from snapshots:', (e as Error)?.message ?? e);
        }
      }
      {
        const graphSeries = ((out as Record<string, unknown>).facebookPageMetricSeries ??
          {}) as Record<string, Array<{ date: string; value: number }>>;
        const bundle = buildFacebookFrontendAnalyticsBundle({
          followers: out.followers,
          graphSeries,
          mergedContentViewsSeries: out.impressionsTimeSeries ?? [],
          mergedPageTabViewsSeries: out.pageViewsTimeSeries,
        });
        if (sinceParam && untilParam) {
          (out as Record<string, unknown>).facebookAnalytics = {
            ...bundle,
            totals: {
              ...bundle.totals,
              contentViews: out.impressionsTotal ?? bundle.totals.contentViews,
              pageTabViews: out.pageViewsTotal ?? bundle.totals.pageTabViews,
              engagement: out.reachTotal ?? bundle.totals.engagement,
            },
          };
        } else {
          (out as Record<string, unknown>).facebookAnalytics = bundle;
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'LINKEDIN') {
      const isOrgPage = account.platformUserId.trim().startsWith('urn:li:organization:');
      const memberOrAuthorUrn = linkedInAuthorUrnForUgc(account.platformUserId, account.credentialsJson);
      const liHeaders = linkedInRestCommunityHeaders(account.accessToken);

      const fetchNetworkSize = async (edgeType: string): Promise<number | undefined> => {
        if (isOrgPage) return undefined;
        try {
          const r = await axios.get<{ firstDegreeSize?: number }>(
            `https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(memberOrAuthorUrn)}`,
            { params: { edgeType }, headers: liHeaders, timeout: 8_000, validateStatus: () => true }
          );
          if (r.status >= 400) return undefined;
          const n = r.data?.firstDegreeSize;
          return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : undefined;
        } catch {
          return undefined;
        }
      };

      const [
        connectionsPrimary,
        connectionsSecond,
        companiesFollowed,
        memberFollowersRes,
        orgFollowerDemographicsRes,
      ] = await Promise.all([
        fetchNetworkSize('FirstDegreeConnection'),
        fetchNetworkSize('FirstDegreeRelationSize'),
        fetchNetworkSize('CompanyFollowedByMember'),
        !isOrgPage
          ? fetchLinkedInMemberFollowersCountMe(account.accessToken)
          : Promise.resolve({ ok: false as const, status: 0, count: undefined as number | undefined }),
        isOrgPage
          ? fetchLinkedInOrganizationalEntityFollowerStatistics(
              account.accessToken,
              account.platformUserId.trim()
            )
          : Promise.resolve({ ok: false as const, status: 0, elements: undefined as unknown[] | undefined }),
      ]);

      const connections = connectionsPrimary ?? connectionsSecond;

      if (connections != null) {
        out.followers = connections;
      } else if (
        memberFollowersRes.ok &&
        typeof memberFollowersRes.count === 'number' &&
        Number.isFinite(memberFollowersRes.count)
      ) {
        // networkSizes often 403 without legacy scopes; memberFollowersCount uses REST Community API
        out.followers = Math.max(0, Math.round(memberFollowersRes.count));
      }

      let userinfoName: string | undefined;
      let picture: string | undefined;
      let email: string | undefined;
      try {
        const ui = await axios.get<{
          name?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
          email?: string;
        }>('https://api.linkedin.com/v2/userinfo', {
          headers: liHeaders,
          timeout: 8_000,
          validateStatus: () => true,
        });
        if (ui.status === 200 && ui.data) {
          const d = ui.data;
          userinfoName =
            (typeof d.name === 'string' && d.name.trim()) ||
            [d.given_name, d.family_name].filter(Boolean).join(' ').trim() ||
            undefined;
          if (typeof d.picture === 'string' && d.picture.trim()) picture = d.picture.trim();
          if (typeof d.email === 'string' && d.email.trim()) email = d.email.trim();
        }
      } catch {
        // optional OpenID userinfo
      }

      let vanityName: string | undefined;
      let localizedHeadline: string | undefined;
      try {
        const me = await axios.get<{
          vanityName?: string;
          localizedHeadline?: string;
        }>('https://api.linkedin.com/v2/me', {
          params: { projection: '(vanityName,localizedHeadline)' },
          headers: liHeaders,
          timeout: 8_000,
          validateStatus: () => true,
        });
        if (me.status === 200 && me.data) {
          if (typeof me.data.vanityName === 'string' && me.data.vanityName.trim()) {
            vanityName = me.data.vanityName.trim();
          }
          if (typeof me.data.localizedHeadline === 'string' && me.data.localizedHeadline.trim()) {
            localizedHeadline = me.data.localizedHeadline.trim();
          }
        }
      } catch {
        // optional profile fields
      }

      const displayName = (userinfoName || account.username || 'LinkedIn').trim();
      (out as Record<string, unknown>).facebookPageProfile = {
        name: displayName,
        username: vanityName ?? account.username ?? undefined,
      };

      if (isOrgPage) {
        try {
          const orgId = account.platformUserId.replace(/^urn:li:organization:/i, '').trim();
          if (orgId) {
            const orgRes = await axios.get<{
              followerCount?: number;
            }>(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(orgId)}`, {
              params: { projection: '(followerCount)' },
              headers: linkedInRestCommunityHeaders(account.accessToken),
              timeout: 10_000,
              validateStatus: () => true,
            });
            const fc = orgRes.data?.followerCount;
            if (typeof fc === 'number' && Number.isFinite(fc) && fc >= 0) {
              out.followers = Math.round(fc);
            }
          }
        } catch {
          // optional org follower count (requires org read scopes)
        }
      }

      const sinceStart = new Date(`${sinceParam}T00:00:00.000Z`);
      const untilEnd = new Date(`${untilParam}T23:59:59.999Z`);
      let importedInRange: Array<{
        publishedAt: Date;
        impressions: number | null;
        interactions: number | null;
        likeCount: number | null;
        commentsCount: number | null;
        sharesCount: number | null;
        mediaType: string | null;
      }> = [];
      let totalSynced = 0;
      try {
        importedInRange = await prisma.importedPost.findMany({
          where: {
            socialAccountId: account.id,
            platform: Platform.LINKEDIN,
            publishedAt: { gte: sinceStart, lte: untilEnd },
          },
          select: {
            publishedAt: true,
            impressions: true,
            interactions: true,
            likeCount: true,
            commentsCount: true,
            sharesCount: true,
            mediaType: true,
          },
        });
        totalSynced = await prisma.importedPost.count({
          where: { socialAccountId: account.id, platform: Platform.LINKEDIN },
        });
      } catch (e) {
        console.warn('[Insights] LinkedIn imported posts:', (e as Error)?.message ?? e);
      }

      let storedPostsPreview: Array<{
        platformPostId: string;
        publishedAt: string;
        impressions: number | null;
        interactions: number | null;
        likeCount: number | null;
        commentsCount: number | null;
        sharesCount: number | null;
        contentPreview: string | null;
        permalinkUrl: string | null;
      }> = [];
      try {
        const rows = await prisma.importedPost.findMany({
          where: { socialAccountId: account.id, platform: Platform.LINKEDIN },
          orderBy: { publishedAt: 'desc' },
          take: 15,
          select: {
            platformPostId: true,
            publishedAt: true,
            impressions: true,
            interactions: true,
            likeCount: true,
            commentsCount: true,
            sharesCount: true,
            content: true,
            permalinkUrl: true,
          },
        });
        storedPostsPreview = rows.map((r) => ({
          platformPostId: r.platformPostId,
          publishedAt: r.publishedAt.toISOString(),
          impressions: r.impressions,
          interactions: r.interactions,
          likeCount: r.likeCount,
          commentsCount: r.commentsCount,
          sharesCount: r.sharesCount,
          contentPreview: r.content ? r.content.slice(0, 120) : null,
          permalinkUrl: r.permalinkUrl,
        }));
      } catch {
        /* ignore */
      }

      const impressionsByDate: Record<string, number> = {};
      const postsByDate: Record<string, number> = {};
      let impSum = 0;
      let engSum = 0;
      for (const p of importedInRange) {
        const d = p.publishedAt.toISOString().slice(0, 10);
        postsByDate[d] = (postsByDate[d] ?? 0) + 1;
        const im = p.impressions ?? 0;
        impressionsByDate[d] = (impressionsByDate[d] ?? 0) + im;
        impSum += im;
        const comp = (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0);
        const intr = p.interactions ?? 0;
        engSum += intr > 0 ? intr : comp;
      }
      out.impressionsTotal = impSum;
      out.reachTotal = engSum;
      out.impressionsTimeSeries = Object.entries(impressionsByDate)
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const activityByDay = Object.entries(postsByDate)
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));

      (out as Record<string, unknown>).linkedIn = {
        network: {
          connections: connections ?? undefined,
          companiesFollowed: companiesFollowed ?? undefined,
          memberProfileFollowersCount:
            memberFollowersRes.ok && typeof memberFollowersRes.count === 'number'
              ? memberFollowersRes.count
              : undefined,
        },
        profile: {
          headline: localizedHeadline,
          vanityName: vanityName ?? undefined,
          picture: picture ?? undefined,
          email: email ?? undefined,
        },
        posts: {
          totalSynced,
          inRangeCount: importedInRange.length,
        },
        activityByDay,
        storedPosts: storedPostsPreview.length > 0 ? storedPostsPreview : undefined,
        communityManagement: {
          linkedInRestApiVersion: getLinkedInRestApiVersion(),
          organizationFollowerStatistics:
            orgFollowerDemographicsRes.ok && orgFollowerDemographicsRes.elements?.length
              ? { elements: orgFollowerDemographicsRes.elements }
              : undefined,
        },
        permissionHint: !isOrgPage
          ? 'Community Management (member): r_member_social for posts, comments, UGC sync; w_member_social for publishing and replies; r_member_profileAnalytics (or the product LinkedIn ties to memberFollowersCount) for profile follower counts; r_member_postAnalytics for memberCreatorPostAnalytics. OpenID alone is basic profile only.'
          : 'Community Management (organization Page): r_organization_social for posts and organizationalEntityShareStatistics; w_organization_social for publishing; organizationalEntityFollowerStatistics for follower demographics (see LinkedIn docs for required admin/follower scopes). Reconnect after each product is approved.',
      };

      const hintParts: string[] = [];
      if (out.followers === 0 && connections == null && companiesFollowed != null) {
        hintParts.push(
          'LinkedIn returned companies you follow but not your connection count in this session.'
        );
      }
      if (totalSynced > 0 && impSum === 0 && importedInRange.length > 0) {
        hintParts.push(
          'Impressions are loaded from post analytics APIs after each post sync. Use Sync on Posts with r_member_postAnalytics (personal) or organization share statistics (Page); OpenID alone cannot fill these.'
        );
      }
      out.insightsHint = hintParts.length > 0 ? hintParts.join(' ') : undefined;

      return NextResponse.json(out);
    }

    if (account.platform === 'TWITTER') {
      const sinceDay = effectiveSinceParam.slice(0, 10);
      const untilDay = effectiveUntilParam.slice(0, 10);
      let tw: Awaited<ReturnType<typeof fetchTwitterTimelineInsights>>;

      // Refresh OAuth 2.0 access token if it has expired or is close to expiry (within 5 min).
      // Twitter access tokens expire after 2 hours; without this, the API silently returns 0 data.
      let liveAccessToken = account.accessToken;
      if (account.refreshToken) {
        const expiresAt = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
        const fiveMinMs = 5 * 60 * 1000;
        if (!expiresAt || Date.now() + fiveMinMs >= expiresAt) {
          try {
            const refreshed = await refreshTwitterToken(account.refreshToken);
            liveAccessToken = refreshed.accessToken;
            // Persist refreshed tokens back to DB so the next call doesn't need to refresh again.
            await prisma.socialAccount.update({
              where: { id: account.id },
              data: {
                accessToken: refreshed.accessToken,
                ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
                expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Twitter tokens last 2h
              },
            });
          } catch {
            // Refresh failed — try with the existing token; user may need to reconnect.
          }
        }
      }

      // Cap pages tightly so the 60s Vercel limit is never hit.
      // Each page is 100 tweets × ~200ms avg = ~20s for 10 pages; leave headroom for user/cron calls.
      const rangeDays = Math.max(1, (new Date(untilDay).getTime() - new Date(sinceDay).getTime()) / 86_400_000);
      const maxPages = rangeDays <= 14 ? 5 : rangeDays <= 31 ? 8 : 12;
      tw = await fetchTwitterTimelineInsights({
        accessToken: liveAccessToken,
        platformUserId: account.platformUserId,
        socialAccountId: account.id,
        sinceDay,
        untilDay,
        budgetExpired,
        maxPages,
      });
      if (tw.twitterUser) {
        out.followers = tw.twitterUser.followers_count;
        out.followingCount = tw.twitterUser.following_count;
      }
      out.impressionsTotal = tw.totals.impressions;
      out.impressionsTimeSeries = tw.impressionsTimeSeries;
      out.twitterUser = tw.twitterUser;
      out.twitterTotals = tw.totals;
      out.twitterEngagementTimeSeries = tw.engagementTimeSeries;
      out.recentTweets = tw.recentTweets;
      const tweetCount = tw.twitterUser?.tweet_count ?? 0;
      const hintParts: string[] = [];
      if (tw.hint) hintParts.push(tw.hint);
      if (tweetCount === 0 && out.followers === 0) {
        hintParts.push('Reconnect your X account with tweet.read and users.read to load profile and timeline analytics.');
      } else if (tw.tweetsInRange === 0 && tw.pagesFetched === 0) {
        hintParts.push('No timeline data returned. Confirm OAuth scopes include tweet.read and try Sync on Posts.');
      } else if (tw.tweetsInRange === 0) {
        hintParts.push('No posts in the selected date range in the fetched timeline. Try a wider range or Sync posts.');
      } else {
        hintParts.push(
          `Loaded ${tw.tweetsInRange} post(s) in range from ${tw.pagesFetched} timeline page(s). Impressions require tweet.read; counts are public_metrics from X.`
        );
      }
      out.insightsHint = hintParts.join(' ');
      return NextResponse.json({
        ...out,
        tweetCount,
        twitterPagesFetched: tw.pagesFetched,
        twitterTimelineTruncated: tw.truncated,
      });
    }

    if (account.platform === 'TIKTOK') {
      const parseTk = (v: unknown): number | undefined => {
        if (v == null) return undefined;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const n = parseInt(v, 10);
          return Number.isNaN(n) ? undefined : n;
        }
        return undefined;
      };
      /** TikTok wraps errors in { error: { code, message } }; success may use code "ok", 0, or omit error. */
      const tikTokPayloadIndicatesSuccess = (err: { code?: unknown; message?: string } | undefined): boolean => {
        if (!err || err.code == null || err.code === '') return true;
        const c = err.code;
        if (c === 'ok' || c === 'OK') return true;
        if (typeof c === 'number' && c === 0) return true;
        return String(c).toLowerCase() === 'ok';
      };
      /** True if TikTok returned at least one numeric stats field from user.info (proves user.info.stats worked). */
      let tiktokUserInfoReturnedAnyStat = false;
      let tiktokUserInfoHttpStatus = 0;
      try {
        const userRes = await axios.get<{
          data?: {
            user?: {
              follower_count?: number | string;
              following_count?: number | string;
              video_count?: number | string;
              likes_count?: number | string;
              display_name?: string;
              bio_description?: string;
              is_verified?: boolean;
            };
          };
          error?: { code?: unknown; message?: string };
        }>('https://open.tiktokapis.com/v2/user/info/', {
          params: {
            fields:
              'open_id,union_id,avatar_url,avatar_large_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count',
          },
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          // Don't throw on 401/403 — sandbox tokens may lack user.info.basic scope
          validateStatus: () => true,
          timeout: 15_000,
        });
        tiktokUserInfoHttpStatus = userRes.status;
        const user = userRes.data?.data?.user;
        const err = userRes.data?.error;
        if (userRes.status === 401 || userRes.status === 403) {
          // Expected for some sandbox tokens or tokens issued without user.info.basic; not an app failure.
          console.log(
            '[Insights] TikTok user/info skipped (HTTP %s): profile/avatar fields unavailable. Reconnect TikTok in the app for user.info.basic if you need them.',
            String(userRes.status),
          );
        } else if (err && !tikTokPayloadIndicatesSuccess(err)) {
          console.warn('[Insights] TikTok user/info error:', err.code, err.message ?? '');
        }
        if (user && tikTokPayloadIndicatesSuccess(err) && userRes.status < 400) {
          const fc = parseTk(user.follower_count);
          if (fc != null) out.followers = fc;
          const following = parseTk(user.following_count);
          const videos = parseTk(user.video_count);
          const likes = parseTk(user.likes_count);
          tiktokUserInfoReturnedAnyStat =
            fc != null || following != null || videos != null || likes != null;
          (out as Record<string, unknown>).tiktokUser = {
            followerCount: fc ?? 0,
            followingCount: following,
            videoCount: videos,
            likesCount: likes,
            displayName: user.display_name ?? undefined,
            bioDescription: user.bio_description ?? undefined,
            isVerified: user.is_verified === true,
          };
        }
      } catch (e) {
        console.warn('[Insights] TikTok user/info:', (e as Error)?.message ?? e);
      }
      try {
        const creatorRes = await axios.post<{
          data?: {
            creator_nickname?: string;
            creator_username?: string;
            creator_avatar_url?: string;
            max_video_post_duration_sec?: number;
            privacy_level_options?: string[];
            duet_disabled?: boolean;
            stitch_disabled?: boolean;
            comment_disabled?: boolean;
          };
          error?: { code?: string; message?: string };
        }>('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {}, {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
          validateStatus: () => true,
        });
        const err = creatorRes.data?.error;
        const raw = creatorRes.data?.data as
          | ({
              creator_nickname?: string;
              creator_username?: string;
              creator_avatar_url?: string;
              max_video_post_duration_sec?: number;
              privacy_level_options?: string[];
              duet_disabled?: boolean;
              stitch_disabled?: boolean;
              comment_disabled?: boolean;
            } & { data?: Record<string, unknown> })
          | undefined;
        const d = raw?.creator_nickname != null || raw?.creator_username != null ? raw : (raw?.data as typeof raw | undefined);
        if (creatorRes.status === 200 && err?.code === 'ok' && d) {
          (out as Record<string, unknown>).tiktokCreatorInfo = {
            creatorNickname: d.creator_nickname,
            creatorUsername: d.creator_username,
            creatorAvatarUrl: d.creator_avatar_url,
            maxVideoPostDurationSec: d.max_video_post_duration_sec,
            privacyLevelOptions: d.privacy_level_options,
            duetDisabled: d.duet_disabled,
            stitchDisabled: d.stitch_disabled,
            commentDisabled: d.comment_disabled,
          };
        }
      } catch (_) {
        // creator_info is optional for dashboard totals
      }
      // TikTok: daily views in the selected range (by publish date) + lifetime total for hints.
      let hasSyncedTikTokPosts = false;
      try {
        const sinceDay = sinceParam.slice(0, 10);
        const untilDay = untilParam.slice(0, 10);
        const allPosts = await prisma.importedPost.findMany({
          where: { socialAccountId: account.id, platform: 'TIKTOK' },
          select: { impressions: true, publishedAt: true },
        });
        hasSyncedTikTokPosts = allPosts.length > 0;
        const lifetimeViews = allPosts.reduce((s, p) => s + (p.impressions ?? 0), 0);
        const inRange = allPosts.filter((p) => {
          const d = p.publishedAt.toISOString().slice(0, 10);
          return d >= sinceDay && d <= untilDay;
        });
        const rangeViews = inRange.reduce((s, p) => s + (p.impressions ?? 0), 0);
        if (rangeViews > 0) out.impressionsTotal = rangeViews;
        else if (lifetimeViews > 0) out.impressionsTotal = lifetimeViews;
        const viewsByDate: Record<string, number> = {};
        for (const p of inRange) {
          const d = p.publishedAt.toISOString().slice(0, 10);
          viewsByDate[d] = (viewsByDate[d] ?? 0) + (p.impressions ?? 0);
        }
        out.impressionsTimeSeries = Object.entries(viewsByDate)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (lifetimeViews > rangeViews && rangeViews > 0) {
          (out as Record<string, unknown>).tiktokLifetimeViewCount = lifetimeViews;
        } else if (lifetimeViews > 0 && rangeViews === 0) {
          (out as Record<string, unknown>).tiktokLifetimeViewCount = lifetimeViews;
          if (!out.insightsHint) {
            out.insightsHint =
              'No TikTok videos were published in this date range; headline views are lifetime from your synced catalog. Widen the range or sync posts.';
          }
        }
      } catch (_) {}
      // Follower count from last scheduled sync when live user.info omits it (same API; snapshot may still have a value).
      if (out.followers === 0) {
        try {
          const snap = await prisma.accountMetricSnapshot.findFirst({
            where: {
              socialAccountId: account.id,
              platform: 'TIKTOK',
              followersCount: { not: null, gt: 0 },
            },
            orderBy: { metricDate: 'desc' },
            select: { followersCount: true },
          });
          if (snap?.followersCount != null) {
            out.followers = snap.followersCount;
            const existing = (out as Record<string, unknown>).tiktokUser as Record<string, unknown> | undefined;
            if (existing) {
              existing.followerCount = snap.followersCount;
            } else {
              (out as Record<string, unknown>).tiktokUser = { followerCount: snap.followersCount };
            }
          }
        } catch (_) {
          // optional
        }
      }
      const tiktokUserUnauthorized = tiktokUserInfoHttpStatus === 401 || tiktokUserInfoHttpStatus === 403;
      // Dashboard "Profile likes" / "Public videos" can come from synced posts even when user.info returns no stats fields,
      // so do not show the user.info.stats reconnect banner in that case (it is a false positive).
      if (tiktokUserUnauthorized) {
        out.insightsHint = out.impressionsTotal === 0
          ? 'TikTok could not load profile stats (session or permissions). Reconnect from the sidebar. Views will update after syncing videos.'
          : 'TikTok could not load profile stats (session or permissions). Reconnect from the sidebar.';
      } else if (out.followers === 0 && !tiktokUserInfoReturnedAnyStat && !hasSyncedTikTokPosts) {
        out.insightsHint = out.impressionsTotal === 0
          ? 'Reconnect TikTok and approve "user.info.stats" to see follower count. Views will update after syncing videos.'
          : 'Reconnect TikTok and approve "user.info.stats" to see follower count.';
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'YOUTUBE') {
      const token = await getValidYoutubeToken(account);
      // Fetch channel-level totals (subscribers + total views)
      try {
        const chRes = await axios.get<{
          items?: Array<{
            id: string;
            statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
          }>;
        }>('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'statistics', mine: 'true' },
          headers: { Authorization: `Bearer ${token}` },
        });
        const channel = chRes.data?.items?.[0];
        if (channel?.statistics) {
          const sub = channel.statistics.subscriberCount;
          const views = channel.statistics.viewCount;
          if (sub != null && sub !== '') out.followers = parseInt(sub, 10) || 0;
          if (views != null && views !== '') out.impressionsTotal = parseInt(views, 10) || 0;
        }
      } catch (e) {
        console.warn('[Insights] YouTube channels:', (e as Error)?.message ?? e);
        if (out.followers === 0 && out.impressionsTotal === 0) out.insightsHint = 'Could not load YouTube channel stats. Reconnect from the sidebar if needed.';
      }

      // Fetch daily views time-series from YouTube Analytics API
      try {
        const analyticsRes = await axios.get<{
          rows?: Array<[string, number]>;
          columnHeaders?: Array<{ name: string }>;
          error?: { message?: string; status?: string };
        }>('https://youtubeanalytics.googleapis.com/v2/reports', {
          params: {
            ids: 'channel==MINE',
            startDate: sinceParam,
            endDate: untilParam,
            metrics: 'views',
            dimensions: 'day',
            sort: 'day',
          },
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        });
        if (analyticsRes.data?.error) {
          const apiErr = analyticsRes.data.error;
          console.warn('[Insights] YouTube Analytics API error:', apiErr);
          out.insightsHint = `YouTube Analytics: ${apiErr.message ?? apiErr.status ?? 'API error'}. Enable "YouTube Analytics API" in Google Cloud Console (APIs & Services) and reconnect.`;
        } else {
          const rows = analyticsRes.data?.rows ?? [];
          if (rows.length > 0) {
            out.impressionsTimeSeries = rows.map(([date, value]) => ({ date, value: value ?? 0 }));
          }
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        console.warn('[Insights] YouTube Analytics:', msg);
        out.insightsHint = `YouTube Analytics unavailable: ${msg.slice(0, 120)}. Enable "YouTube Analytics API" in Google Cloud Console.`;
      }

      const extended = request.nextUrl.searchParams.get('extended') === '1';
      if (extended) {
        try {
          const token = await getValidYoutubeToken(account);
          const { demographics, trafficSources, growthTimeSeries, extra: ytExtra, raw: ytRaw } = await fetchYouTubeExtended(
            token,
            sinceParam,
            untilParam
          );
          out.demographics = demographics;
          out.trafficSources = trafficSources;
          out.growthTimeSeries = growthTimeSeries;
          out.extra = ytExtra;
          if (ytRaw && typeof ytRaw === 'object') out.raw = { ...(out.raw ?? {}), youtube: ytRaw };
        } catch (e) {
          console.warn('[Insights] YouTube extended analytics:', (e as Error)?.message ?? e);
        }
      }

      return NextResponse.json(out);
    }

    if (account.platform === 'PINTEREST') {
      const token = await getValidPinterestToken(account);
      const headers = { Authorization: `Bearer ${token}` };
      type PinUserAccount = {
        follower_count?: number;
        monthly_views?: number;
        pin_count?: number;
        username?: string;
        business_name?: string;
        profile_image?: string;
        website_url?: string;
      };
      let uaBody: PinUserAccount | undefined;
      try {
        const ua = await axios.get<PinUserAccount>('https://api.pinterest.com/v5/user_account', { headers });
        uaBody = ua.data;
        if (typeof ua.data?.follower_count === 'number') out.followers = ua.data.follower_count;
        out.extra = {
          ...(out.extra ?? {}),
          pinterestUsername: ua.data?.username,
          pinterestPinCount: ua.data?.pin_count,
          pinterestMonthlyViews: ua.data?.monthly_views,
        };
        (out as Record<string, unknown>).facebookPageProfile = {
          username: ua.data?.username ?? account.username ?? undefined,
          name: (ua.data?.business_name ?? ua.data?.username ?? account.username ?? 'Pinterest') as string,
          followers_count: ua.data?.follower_count,
          website: ua.data?.website_url,
        };
        if (typeof ua.data?.monthly_views === 'number') {
          out.profileViewsTotal = ua.data.monthly_views;
        }
      } catch (e) {
        console.warn('[Insights] Pinterest user_account:', (e as Error)?.message ?? e);
        out.insightsHint = 'Could not load Pinterest profile. Reconnect from the sidebar.';
      }

      let analyticsBody: unknown;
      let analyticsStatus = 0;
      try {
        const analyticsRes = await axios.get<{
          all?: {
            summary_metrics?: Record<string, number | string>;
            daily_metrics?: Array<{ date?: string; metrics?: Record<string, number> }>;
          };
        }>('https://api.pinterest.com/v5/user_account/analytics', {
          headers,
          params: { start_date: sinceParam, end_date: untilParam },
          validateStatus: () => true,
        });
        analyticsStatus = analyticsRes.status;
        analyticsBody = analyticsRes.data;
        if (analyticsRes.status === 200 && analyticsRes.data?.all) {
          const daily = analyticsRes.data.all.daily_metrics ?? [];
          const byDate: Record<string, number> = {};
          for (const row of daily) {
            const m = row.metrics ?? {};
            const imp =
              (typeof m.IMPRESSION === 'number' ? m.IMPRESSION : undefined) ??
              (typeof m.impression === 'number' ? m.impression : undefined) ??
              0;
            const d = (row.date ?? '').slice(0, 10);
            if (d) byDate[d] = (byDate[d] ?? 0) + imp;
          }
          out.impressionsTimeSeries = Object.entries(byDate)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));
          const sm = analyticsRes.data.all.summary_metrics ?? {};
          const totalImp =
            (typeof sm.IMPRESSION === 'number' ? sm.IMPRESSION : undefined) ??
            (typeof sm.impression === 'number' ? sm.impression : undefined);
          if (typeof totalImp === 'number') out.impressionsTotal = totalImp;
          else out.impressionsTotal = out.impressionsTimeSeries.reduce((s, p) => s + p.value, 0);
        } else if (analyticsRes.status === 403 || analyticsRes.status === 401) {
          out.insightsHint =
            'Pinterest analytics for this date range may require Standard API access and analytics scopes. Reconnect Pinterest from Accounts. Follower and profile data may still load.';
        }
      } catch (e) {
        console.warn('[Insights] Pinterest analytics:', (e as Error)?.message ?? e);
        analyticsBody = { error: (e as Error)?.message ?? String(e) };
      }

      let topPinsBody: unknown;
      try {
        const topRes = await axios.get('https://api.pinterest.com/v5/user_account/analytics/top_pins', {
          headers,
          params: {
            start_date: sinceParam,
            end_date: untilParam,
            sort_by: 'IMPRESSION',
            num_of_pins: 10,
          },
          validateStatus: () => true,
        });
        topPinsBody = topRes.status === 200 ? topRes.data : { status: topRes.status, data: topRes.data };
        if (topRes.status === 200 && topRes.data && typeof topRes.data === 'object') {
          out.extra = { ...(out.extra ?? {}), pinterestTopPins: topRes.data };
        }
      } catch (e) {
        topPinsBody = { error: (e as Error)?.message ?? String(e) };
      }

      out.raw = {
        ...(out.raw ?? {}),
        pinterest: {
          user_account: uaBody ?? null,
          analytics: analyticsStatus ? { httpStatus: analyticsStatus, body: analyticsBody } : { body: analyticsBody },
          top_pins: topPinsBody,
        },
      };

      const dailyForBundle =
        analyticsStatus === 200 &&
        analyticsBody &&
        typeof analyticsBody === 'object' &&
        (analyticsBody as { all?: { daily_metrics?: Array<{ date?: string; metrics?: Record<string, number> }> } }).all
          ?.daily_metrics
          ? (analyticsBody as { all: { daily_metrics: Array<{ date?: string; metrics?: Record<string, number> }> } }).all
              .daily_metrics
          : [];
      (out as Record<string, unknown>).facebookAnalytics = buildPinterestFrontendAnalyticsBundle({
        followerCount: out.followers,
        daily: dailyForBundle,
      });

      return NextResponse.json(out);
    }

  } catch (e) {
    console.error('[Insights] error:', e);
    return NextResponse.json(emptyOut('UNKNOWN'), { status: 200 });
  }
  return NextResponse.json(out);
}
