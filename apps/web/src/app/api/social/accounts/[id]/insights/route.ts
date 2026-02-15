import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/insights?since=YYYY-MM-DD&until=YYYY-MM-DD
 * Returns account-level analytics (followers, impressions over time) for Metricool-style Summary.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const since = request.nextUrl.searchParams.get('since') ?? '';
  const until = request.nextUrl.searchParams.get('until') ?? '';
  const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : null;
  const untilTs = until ? Math.floor(new Date(until).getTime() / 1000) : null;

  const out: {
    platform: string;
    followers: number;
    impressionsTotal: number;
    impressionsTimeSeries: Array<{ date: string; value: number }>;
    pageViewsTotal?: number;
    reachTotal?: number;
    profileViewsTotal?: number;
    followersTimeSeries?: Array<{ date: string; value: number }>;
    insightsHint?: string;
  } = {
    platform: account.platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [],
  };

  try {
    if (account.platform === 'INSTAGRAM') {
      const token = account.accessToken;
      try {
        const profileRes = await axios.get<{ followers_count?: number }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'followers_count', access_token: token } }
        );
        if (typeof profileRes.data?.followers_count === 'number') {
          out.followers = profileRes.data.followers_count;
        }
      } catch (e) {
        console.warn('[Insights] Instagram profile:', (e as Error)?.message ?? e);
      }
      if (sinceTs != null && untilTs != null) {
        try {
          const insightsRes = await axios.get<{
            data?: Array<{
              name: string;
              values?: Array<{ value: number; end_time?: string }>;
              total_value?: { value: number };
            }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'reach,profile_views,views',
              metric_type: 'total_value',
              period: 'day',
              since: sinceTs,
              until: untilTs,
              access_token: token,
            },
          });
          const data = insightsRes.data?.data ?? [];
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
            if (d.name === 'views' || d.name === 'impressions') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = series.length ? series : (total ? [{ date: new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'reach') {
              out.reachTotal = total;
            } else if (d.name === 'profile_views') {
              out.profileViewsTotal = total;
            }
          }
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          console.warn('[Insights] Instagram insights:', msg);
          if (out.followers === 0 && !out.impressionsTotal && !out.reachTotal) out.insightsHint = 'Reconnect from the sidebar and choose your Page when asked to see followers, views, reach, and profile views.';
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'FACEBOOK') {
      const token = account.accessToken;
      try {
        const pageRes = await axios.get<{ fan_count?: number }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'fan_count', access_token: token } }
        );
        if (typeof pageRes.data?.fan_count === 'number') {
          out.followers = pageRes.data.fan_count;
        }
      } catch (e) {
        console.warn('[Insights] Facebook page profile:', (e as Error)?.message ?? e);
      }
      if (sinceTs != null && untilTs != null) {
        try {
          const insightsRes = await axios.get<{
            data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }> }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'page_impressions,page_views_total,page_fan_reach',
              period: 'day',
              since: sinceTs,
              until: untilTs,
              access_token: token,
            },
          });
          const data = insightsRes.data?.data ?? [];
          for (const d of data) {
            const values = d.values ?? [];
            let total = 0;
            const series: Array<{ date: string; value: number }> = [];
            for (const v of values) {
              const val = typeof v.value === 'number' ? v.value : 0;
              total += val;
              const date = v.end_time ? v.end_time.slice(0, 10) : '';
              if (date) series.push({ date, value: val });
            }
            if (d.name === 'page_impressions') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = series.sort((a, b) => a.date.localeCompare(b.date));
            } else if (d.name === 'page_views_total') {
              out.pageViewsTotal = total;
            } else if (d.name === 'page_fan_reach') {
              out.reachTotal = total;
            }
          }
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          console.warn('[Insights] Facebook insights:', msg);
          if (out.followers === 0 && !out.impressionsTotal) out.insightsHint = 'Reconnect from the sidebar and choose your Page when asked to see Page analytics.';
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'LINKEDIN') {
      out.insightsHint = "LinkedIn doesn't provide follower or view metrics for personal profiles in our app. You can still schedule and publish posts to LinkedIn from the Composer.";
      return NextResponse.json(out);
    }
  } catch (e) {
    console.error('[Insights] error:', e);
  }
  return NextResponse.json(out);
}
