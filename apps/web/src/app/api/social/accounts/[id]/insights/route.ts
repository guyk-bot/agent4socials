import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';

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
      select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, expiresAt: true },
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
      // Fetch followers + media_count in one call
      try {
        const profileRes = await axios.get<{ followers_count?: number; media_count?: number }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'followers_count,media_count', access_token: token }, timeout: 8_000 }
        );
        if (typeof profileRes.data?.followers_count === 'number') {
          out.followers = profileRes.data.followers_count;
        }
      } catch (e) {
        console.warn('[Insights] Instagram profile:', (e as Error)?.message ?? e);
      }

      if (effectiveSinceTs != null && effectiveUntilTs != null) {
        // Try newer v19+ metrics first, fall back gracefully
        const metricSets = [
          'impressions,reach,profile_views,accounts_engaged',
          'impressions,reach,profile_views',
          'reach,profile_views',
          'reach',
        ];
        let insightsOk = false;
        for (const metricSet of metricSets) {
          if (insightsOk) break;
          try {
            const insightsRes = await axios.get<{
              data?: Array<{
                name: string;
                values?: Array<{ value: number; end_time?: string }>;
                total_value?: { value: number; breakdowns?: unknown[] };
              }>;
              error?: { message?: string; code?: number };
            }>(`${baseUrl}/${account.platformUserId}/insights`, {
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
              console.warn('[Insights] IG metric set failed:', metricSet, insightsRes.data.error.message);
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
              if (d.name === 'impressions') {
                out.impressionsTotal = total;
                out.impressionsTimeSeries = series.length ? series : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
              } else if (d.name === 'reach') {
                out.reachTotal = total;
                // Use reach as fallback time series when impressions are empty
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
            insightsOk = true;
          } catch (e) {
            const status = (e as { response?: { status?: number } })?.response?.status;
            if (status === 400 || status === 403) continue; // try next metric set
            console.warn('[Insights] Instagram insights error:', (e as Error)?.message ?? e);
            break;
          }
        }

        if (!insightsOk && !out.impressionsTotal && !out.reachTotal && out.followers === 0) {
          out.insightsHint = 'Instagram insights temporarily unavailable. Try reconnecting your account from the sidebar.';
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
      }
      if (effectiveSinceTs != null && effectiveUntilTs != null) {
        try {
          // page_impressions = total views (not unique), page_views_total = page visits, page_engaged_users = engaged reach
          const insightsRes = await axios.get<{
            data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }> }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'page_impressions,page_views_total,page_engaged_users,page_fan_adds',
              period: 'day',
              since: effectiveSinceTs,
              until: effectiveUntilTs,
              access_token: token,
            },
            timeout: 10_000,
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
            const sortedSeries = series.sort((a, b) => a.date.localeCompare(b.date));
            if (d.name === 'page_impressions') {
              out.impressionsTotal = total;
              out.impressionsTimeSeries = sortedSeries.length ? sortedSeries : (total ? [{ date: untilParam?.slice(0, 10) || new Date().toISOString().slice(0, 10), value: total }] : []);
            } else if (d.name === 'page_views_total') {
              out.pageViewsTotal = total;
            } else if (d.name === 'page_engaged_users') {
              out.reachTotal = total;
            }
            // page_fan_adds = net new fans (not stored separately currently)
          }
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status !== 400) console.warn('[Insights] Facebook insights:', (e as Error)?.message ?? e);
          if (!out.insightsHint && out.followers === 0 && !out.impressionsTotal) {
            out.insightsHint = 'Reconnect from the sidebar and choose your Page when asked to see Page analytics.';
          }
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
          data?: { user?: { follower_count?: number; video_count?: number; likes_count?: number } };
          error?: { code?: string };
        }>('https://open.tiktokapis.com/v2/user/info/', {
          params: { fields: 'open_id,follower_count,video_count,likes_count' },
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const user = userRes.data?.data?.user;
        if (userRes.data?.error?.code === 'ok' || !userRes.data?.error?.code) {
          if (user?.follower_count != null) out.followers = user.follower_count;
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
      if (out.followers === 0 && out.impressionsTotal === 0) {
        out.insightsHint = 'Add user.info.stats scope and reconnect to see followers. Views update automatically.';
      }
      // When followers > 0 and views === 0 we auto-sync on the dashboard; no hint needed.
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

      return NextResponse.json(out);
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
