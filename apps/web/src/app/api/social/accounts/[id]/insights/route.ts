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
  const emptyOut = (platform: string) => ({
    platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [] as Array<{ date: string; value: number }>,
    insightsHint: 'Could not load insights. Try reconnecting from the sidebar.',
  });
  try {
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
  if (account.platform === 'FACEBOOK' && sinceTs != null && untilTs != null) {
    const rangeDays = (untilTs - sinceTs) / (24 * 60 * 60);
    if (rangeDays > FACEBOOK_INSIGHTS_DAYS) {
      effectiveUntilTs = Math.floor(Date.now() / 1000);
      effectiveSinceTs = effectiveUntilTs - FACEBOOK_INSIGHTS_DAYS * 24 * 60 * 60;
      insightsRangeHint = `Showing last ${FACEBOOK_INSIGHTS_DAYS} days (Facebook allows up to ${FACEBOOK_INSIGHTS_DAYS} days per request).`;
    }
  }

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
    ...(insightsRangeHint ? { insightsHint: insightsRangeHint } : {}),
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
      if (effectiveSinceTs != null && effectiveUntilTs != null) {
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
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
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
            if (d.name === 'impressions' || d.name === 'views') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = series.length ? series : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'reach') {
              out.reachTotal = total;
            } else if (d.name === 'profile_views') {
              out.profileViewsTotal = total;
            }
          }
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          const apiMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
          console.warn('[Insights] Instagram insights:', msg, apiMsg ?? '');
          if (!out.insightsHint && out.followers === 0 && !out.impressionsTotal && !out.reachTotal) {
            out.insightsHint = apiMsg && apiMsg.length < 200
              ? apiMsg
              : 'Reconnect from the sidebar and choose your Page when asked to see followers, views, reach, and profile views.';
          }
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
      if (effectiveSinceTs != null && effectiveUntilTs != null) {
        try {
          const insightsRes = await axios.get<{
            data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }> }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'page_impressions,page_views_total,page_fan_reach',
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
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
              out.impressionsTimeSeries = series.length ? series.sort((a, b) => a.date.localeCompare(b.date)) : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_views_total') {
              out.pageViewsTotal = total;
            } else if (d.name === 'page_fan_reach') {
              out.reachTotal = total;
            }
          }
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status !== 400) {
            const msg = (e as Error)?.message ?? String(e);
            console.warn('[Insights] Facebook insights:', msg);
          }
          if (!out.insightsHint && out.followers === 0 && !out.impressionsTotal) out.insightsHint = 'Reconnect from the sidebar and choose your Page when asked to see Page analytics.';
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'LINKEDIN') {
      out.insightsHint = "LinkedIn doesn't provide follower or view metrics for personal profiles in our app. You can still schedule and publish posts to LinkedIn from the Composer.";
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
        return NextResponse.json({ ...out, recentTweets, tweetCount });
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status !== 401) console.warn('[Insights] Twitter tweets:', (e as Error)?.message ?? e);
      }
      return NextResponse.json({ ...out, tweetCount });
    }
  } catch (e) {
    console.error('[Insights] error:', e);
    return NextResponse.json(emptyOut('UNKNOWN'), { status: 200 });
  }
  return NextResponse.json(out);
} catch (e) {
  console.error('[Insights] error:', e);
  return NextResponse.json(emptyOut('UNKNOWN'), { status: 200 });
}
}
