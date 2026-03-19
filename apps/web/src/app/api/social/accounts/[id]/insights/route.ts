import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import { fetchInstagramDemographics, fetchFacebookDemographics, fetchYouTubeExtended } from '@/lib/analytics/extended-fetchers';
import {
  getAccountHistorySeries,
  buildBootstrapFlatSeries,
  persistInsightsSeries,
  getInsightsTimeSeries,
} from '@/lib/analytics/metric-snapshots';

const fbBaseUrl = 'https://graph.facebook.com/v18.0';
const igBaseUrl = 'https://graph.instagram.com/v18.0';
const baseUrl = fbBaseUrl; // used by Facebook and other platforms

/** Facebook Insights end_time is end-of-day Pacific (next day midnight UTC). Return YYYY-MM-DD for the metric day to match Meta Business Suite. */
function facebookMetricDateFromEndTime(endTime: string): string {
  const d = new Date(endTime);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

/**
 * GET /api/social/accounts/[id]/insights?since=YYYY-MM-DD&until=YYYY-MM-DD&extended=1
 * Returns account-level analytics. If extended=1, also fetches demographics, traffic sources, and growth where available.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, expiresAt: true, credentialsJson: true, firstConnectedAt: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const since = request.nextUrl.searchParams.get('since') ?? '';
  const until = request.nextUrl.searchParams.get('until') ?? '';
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
    extra?: Record<string, number | number[] | Array<{ date: string; value: number }>>;
    raw?: Record<string, unknown>;
    /** When true, followersTimeSeries is from our DB (snapshots or bootstrap). */
    metricHistoryFromSnapshots?: boolean;
    /** True when we have fewer than 2 snapshots and are showing a flat bootstrap line; show "Tracking started on …" helper. */
    isBootstrap?: boolean;
    /** First time this account was connected (preserved across disconnect/reconnect). For bootstrap flat line start. */
    firstConnectedAt?: string | null;
    /** Per-day following count from our snapshots (Instagram); when present chart uses this instead of flat followingCount. */
    followingTimeSeries?: Array<{ date: string; value: number }>;
  } = {
    platform: account.platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [],
    ...(insightsRangeHint && account.platform !== 'INSTAGRAM' ? { insightsHint: insightsRangeHint } : {}),
  };

  try {
    if (account.platform === 'INSTAGRAM') {
      const token = account.accessToken;
      const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object' ? account.credentialsJson : {}) as { loginMethod?: string };
      const isInstagramBusinessLogin = credJson?.loginMethod === 'instagram_business';

      const tryProfile = async (base: string): Promise<boolean> => {
        try {
          const profileRes = await axios.get<{ followers_count?: number; media_count?: number; follows_count?: number }>(
            `${base}/${account.platformUserId}`,
            { params: { fields: 'followers_count,media_count,follows_count', access_token: token }, timeout: 8_000 }
          );
          if (typeof profileRes.data?.followers_count === 'number') {
            out.followers = profileRes.data.followers_count;
          }
          if (typeof profileRes.data?.follows_count === 'number') {
            out.followingCount = profileRes.data.follows_count;
          }
          return typeof profileRes.data?.followers_count === 'number';
        } catch (e) {
          console.warn('[Insights] Instagram profile:', base, (e as Error)?.message ?? e);
        }
        return false;
      };

      // Prefer graph.facebook.com for Page-linked; fall back to graph.instagram.com for Instagram-only (Business Login)
      let profileOk = await tryProfile(fbBaseUrl);
      if (!profileOk && (isInstagramBusinessLogin || out.followers === 0)) {
        profileOk = await tryProfile(igBaseUrl);
      }

      const igSeriesByMetric: Record<string, Array<{ date: string; value: number }>> = {};
      const tryInsights = async (base: string): Promise<boolean> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null) return false;
        const metricSets = [
          'impressions,reach,profile_views,accounts_engaged',
          'impressions,reach,profile_views',
          'reach,profile_views',
          'reach',
        ];
        for (const metricSet of metricSets) {
          try {
            const insightsRes = await axios.get<{
              data?: Array<{
                name: string;
                values?: Array<{ value: number; end_time?: string }>;
                total_value?: { value: number; breakdowns?: unknown[] };
              }>;
              error?: { message?: string; code?: number };
            }>(`${base}/${account.platformUserId}/insights`, {
              params: {
                metric: metricSet,
                period: 'day',
                since: effectiveSinceTs,
                until: effectiveUntilTs,
                access_token: token,
              },
              timeout: 10_000,
            });

            if (insightsRes.data?.error) {
              console.warn('[Insights] IG metric set failed:', base, metricSet, insightsRes.data.error.message);
              continue;
            }

            const data = insightsRes.data?.data ?? [];
            if (data.length === 0) continue;

            for (const d of data) {
              const total =
                typeof d.total_value?.value === 'number'
                  ? d.total_value.value
                  : (d.values ?? []).reduce((s, v) => s + (typeof v.value === 'number' ? v.value : 0), 0);
              const series: Array<{ date: string; value: number }> =
                (d.values ?? []).length > 0
                  ? (d.values ?? [])
                      .map((v) => ({
                        date: v.end_time ? v.end_time.slice(0, 10) : '',
                        value: typeof v.value === 'number' ? v.value : 0,
                      }))
                      .filter((x) => x.date)
                      .sort((a, b) => a.date.localeCompare(b.date))
                  : [];
              if (series.length > 0) igSeriesByMetric[d.name] = series;
              if (d.name === 'impressions') {
                out.impressionsTotal = total;
                out.impressionsTimeSeries = series.length ? series : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
              } else if (d.name === 'reach') {
                out.reachTotal = total;
                if (!out.impressionsTimeSeries?.length && series.length) {
                  out.impressionsTimeSeries = series;
                  if (!out.impressionsTotal) out.impressionsTotal = total;
                }
              } else if (d.name === 'profile_views') {
                out.profileViewsTotal = total;
              } else if (d.name === 'accounts_engaged') {
                (out as Record<string, unknown>).accountsEngaged = total;
              }
            }
            return true;
          } catch (e) {
            const status = (e as { response?: { status?: number } })?.response?.status;
            if (status === 400 || status === 403) continue;
            console.warn('[Insights] Instagram insights error:', base, (e as Error)?.message ?? e);
            return false;
          }
        }
        return false;
      };

      let insightsOk = await tryInsights(fbBaseUrl);
      if (!insightsOk && (isInstagramBusinessLogin || (out.followers > 0 && !out.impressionsTotal && !out.reachTotal))) {
        insightsOk = await tryInsights(igBaseUrl);
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
            running += p.value;
            return { date: p.date, value: running };
          });
          return true;
        } catch {
          return false;
        }
      };
      const tryFollowerCount = async (base: string): Promise<boolean> => {
        if (effectiveSinceTs == null || effectiveUntilTs == null || out.followers < 100) return false;
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

      if (!insightsOk && !out.impressionsTotal && !out.reachTotal && out.followers === 0) {
        out.insightsHint = 'Instagram insights temporarily unavailable. Try reconnecting your account from the sidebar.';
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
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'FACEBOOK') {
      const token = account.accessToken;
      try {
        const pageRes = await axios.get<{ fan_count?: number; followers_count?: number; name?: string }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'fan_count,followers_count,name', access_token: token }, timeout: 8_000 }
        );
        if (typeof pageRes.data?.fan_count === 'number') out.followers = pageRes.data.fan_count;
        else if (typeof pageRes.data?.followers_count === 'number') out.followers = pageRes.data.followers_count;
      } catch (e) {
        console.warn('[Insights] Facebook page profile:', (e as Error)?.message ?? e);
        if (!out.insightsHint) {
          out.insightsHint = 'Could not load follower count from Facebook. Reconnect from the sidebar (or use the button below) to refresh.';
        }
      }
      if (effectiveSinceTs != null && effectiveUntilTs != null) {
        let insightsError: string | undefined;
        try {
          // page_impressions = total views (not unique), page_views_total = page visits, page_engaged_users = engaged reach
          const metricSets = [
            'page_impressions,page_views_total,page_engaged_users,page_fan_adds,page_fan_removes',
            'page_impressions,page_views_total,page_engaged_users,page_fan_adds',
          ];
          let data: Array<{ name: string; values?: Array<{ value: number | string; end_time?: string }> }> = [];
          const untilForApi = (() => {
            const d = new Date(effectiveUntilParam + 'T12:00:00');
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            if (d >= today) {
              d.setUTCDate(d.getUTCDate() - 1);
            }
            return d.toISOString().slice(0, 10);
          })();
          const untilApi = (() => { const d = new Date(untilForApi + 'T12:00:00'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
          for (const metrics of metricSets) {
            try {
              const insightsRes = await axios.get<{
                data?: Array<{ name: string; values?: Array<{ value: number | string; end_time?: string }> }>;
                error?: { message?: string; code?: number; type?: string };
              }>(`${baseUrl}/${account.platformUserId}/insights`, {
                params: {
                  metric: metrics,
                  period: 'day',
                  since: effectiveSinceParam,
                  until: untilApi,
                  access_token: token,
                },
                timeout: 10_000,
              });
              if (insightsRes.data?.error) {
                insightsError = insightsRes.data.error.message ?? JSON.stringify(insightsRes.data.error);
              }
              data = insightsRes.data?.data ?? [];
              break;
            } catch (err) {
              const ax = err as { response?: { status?: number; data?: { error?: { message?: string; code?: number } } } };
              const status = ax?.response?.status;
              const msg = ax?.response?.data?.error?.message ?? (err as Error)?.message;
              if (status === 400 && metrics.includes('page_fan_removes')) continue;
              insightsError = msg ? `Meta API: ${msg}` : (status ? `HTTP ${status}` : 'Request failed');
              throw err;
            }
          }
          if (data.length === 0 && !out.impressionsTotal && !out.pageViewsTotal) {
            out.insightsHint = insightsError
              ? `Page insights: ${insightsError}. Ensure the app has read_insights (Meta → Use cases → Pages API) and reconnect Facebook, then choose your Page.`
              : 'Page insights returned no data for this range. Try a different date range or reconnect and ensure read_insights is granted.';
          }
          const addsByDate = new Map<string, number>();
          const removesByDate = new Map<string, number>();
          const fbSeriesByMetric: Record<string, Array<{ date: string; value: number }>> = {};
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
            if (sortedSeries.length > 0) fbSeriesByMetric[d.name] = sortedSeries;
            if (d.name === 'page_impressions') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = sortedSeries.length ? sortedSeries : (total ? [{ date: effectiveUntilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_views_total') {
              out.pageViewsTotal = total;
              out.pageViewsTimeSeries = sortedSeries.length ? sortedSeries : (total ? [{ date: effectiveUntilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_engaged_users') {
              out.reachTotal = total;
            } else if (d.name === 'page_fan_adds') {
              for (const { date, value } of sortedSeries) addsByDate.set(date, value);
            } else if (d.name === 'page_fan_removes') {
              for (const { date, value } of sortedSeries) removesByDate.set(date, value);
            }
          }
          if (Object.keys(fbSeriesByMetric).length > 0) {
            try {
              await persistInsightsSeries({
                userId,
                socialAccountId: account.id,
                platform: 'FACEBOOK',
                externalAccountId: account.platformUserId,
                seriesByMetric: fbSeriesByMetric,
              });
            } catch (e) {
              console.warn('[Insights] Persist FB insights:', (e as Error)?.message ?? e);
            }
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
          const [snapshotImpressions, snapshotPageViews] = await Promise.all([
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
          ]);
          out.impressionsTimeSeries = mergeSeriesWithSnapshots(
            out.impressionsTimeSeries,
            snapshotImpressions,
            sinceParam,
            untilParam
          );
          if (out.pageViewsTimeSeries) {
            out.pageViewsTimeSeries = mergeSeriesWithSnapshots(
              out.pageViewsTimeSeries,
              snapshotPageViews,
              sinceParam,
              untilParam
            );
          }
        } catch (e) {
          console.warn('[Insights] Merge FB insights from snapshots:', (e as Error)?.message ?? e);
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'LINKEDIN') {
      // Try to get basic profile info; followers not exposed via standard LinkedIn API without r_organization_social
      try {
        const profileRes = await axios.get<{
          followersCount?: number;
          firstDegreeSize?: number;
          localizedName?: string;
        }>(`https://api.linkedin.com/v2/networkSizes/urn:li:person:${account.platformUserId}?edgeType=CompanyFollowedByMember`, {
          headers: { Authorization: `Bearer ${account.accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' },
        });
        if (profileRes.data?.firstDegreeSize) out.followers = profileRes.data.firstDegreeSize;
      } catch {
        // LinkedIn connections/follower count not accessible without special permissions
      }
      out.insightsHint = "LinkedIn analytics (impressions, reach) require LinkedIn Marketing API approval. Connection count and post publishing are available.";
      return NextResponse.json(out);
    }

    if (account.platform === 'TWITTER') {
      const token = account.accessToken;
      let tweetCount = 0;
      try {
        const userRes = await axios.get<{
          data?: {
            public_metrics?: {
              followers_count?: number;
              following_count?: number;
              tweet_count?: number;
              listed_count?: number;
            };
          };
        }>(`https://api.twitter.com/2/users/${account.platformUserId}`, {
          params: { 'user.fields': 'public_metrics' },
          headers: { Authorization: `Bearer ${token}` },
        });
        const metrics = userRes.data?.data?.public_metrics;
        if (metrics) {
          if (typeof metrics.followers_count === 'number') out.followers = metrics.followers_count;
          if (typeof metrics.tweet_count === 'number') tweetCount = metrics.tweet_count;
        }
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status !== 401) {
          const msg = (e as Error)?.message ?? String(e);
          console.warn('[Insights] Twitter user/metrics:', msg);
        }
        if (out.followers === 0 && !tweetCount) out.insightsHint = 'Reconnect your X (Twitter) account to see follower and tweet counts.';
      }
      try {
        const tweetsRes = await axios.get<{
          data?: Array<{
            id: string;
            text?: string;
            created_at?: string;
            public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; impression_count?: number };
          }>;
        }>(`https://api.twitter.com/2/users/${account.platformUserId}/tweets`, {
          params: {
            max_results: 25,
            'tweet.fields': 'created_at,public_metrics',
            exclude: 'retweets,replies',
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        const tweets = tweetsRes.data?.data ?? [];
        const recentTweets = tweets.map((t) => ({
          id: t.id,
          text: t.text?.slice(0, 200) ?? '',
          created_at: t.created_at ?? null,
          like_count: t.public_metrics?.like_count ?? 0,
          reply_count: t.public_metrics?.reply_count ?? 0,
          retweet_count: t.public_metrics?.retweet_count ?? 0,
          impression_count: t.public_metrics?.impression_count ?? 0,
        }));
        // Build impressions time series and total from recent tweets (Twitter has no historical time-series API)
        const impressionsByDate: Record<string, number> = {};
        let totalImpressions = 0;
        for (const t of recentTweets) {
          const imp = t.impression_count ?? 0;
          totalImpressions += imp;
          if (t.created_at) {
            const date = t.created_at.slice(0, 10);
            impressionsByDate[date] = (impressionsByDate[date] ?? 0) + imp;
          }
        }
        out.impressionsTotal = totalImpressions;
        out.impressionsTimeSeries = Object.entries(impressionsByDate)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return NextResponse.json({ ...out, recentTweets, tweetCount });
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status !== 401) console.warn('[Insights] Twitter tweets:', (e as Error)?.message ?? e);
      }
      return NextResponse.json({ ...out, tweetCount });
    }

    if (account.platform === 'TIKTOK') {
      try {
        const userRes = await axios.get<{
          data?: { user?: { follower_count?: number | string; video_count?: number | string; likes_count?: number | string } };
          error?: { code?: string; message?: string };
        }>('https://open.tiktokapis.com/v2/user/info/', {
          params: { fields: 'open_id,follower_count,video_count,likes_count' },
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const user = userRes.data?.data?.user;
        const err = userRes.data?.error;
        if (err?.code && err.code !== 'ok') {
          console.warn('[Insights] TikTok user/info error:', err.code, err.message ?? '');
        }
        if (err?.code === 'ok' || !err?.code) {
          if (user?.follower_count != null) {
            const n = typeof user.follower_count === 'string' ? parseInt(user.follower_count, 10) : user.follower_count;
            if (!Number.isNaN(n)) out.followers = n;
          }
        }
      } catch (e) {
        console.warn('[Insights] TikTok user/info:', (e as Error)?.message ?? e);
      }
      // Account-level "Views" = sum of view counts from synced videos (not likes_count)
      try {
        const posts = await prisma.importedPost.findMany({
          where: { socialAccountId: account.id, platform: 'TIKTOK' },
          select: { impressions: true },
        });
        const totalViews = posts.reduce((s, p) => s + (p.impressions ?? 0), 0);
        if (totalViews > 0) out.impressionsTotal = totalViews;
      } catch (_) {}
      if (out.followers === 0) {
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
  } catch (e) {
    console.error('[Insights] error:', e);
    return NextResponse.json(emptyOut('UNKNOWN'), { status: 200 });
  }
  return NextResponse.json(out);
}
