/**
 * X (Twitter) API v2 helpers for GET /insights — user metrics + paginated timeline for analytics.
 * @see https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
 */

import axios from 'axios';

export type TwitterRecentTweetRow = {
  id: string;
  text: string;
  created_at: string | null;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  bookmark_count: number;
  impression_count: number;
  thumbnailUrl: string | null;
};

export type TwitterUserPublicRow = {
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count: number;
  name?: string;
  username?: string;
  description?: string;
  profile_image_url?: string;
  verified?: boolean;
  url?: string;
};

export type TwitterTotals = {
  impressions: number;
  likes: number;
  replies: number;
  retweets: number;
  quotes: number;
  bookmarks: number;
};

export type TwitterTimelineInsightsResult = {
  twitterUser: TwitterUserPublicRow | null;
  recentTweets: TwitterRecentTweetRow[];
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  engagementTimeSeries: Array<{ date: string; value: number }>;
  totals: TwitterTotals;
  /** Tweets returned after date filter (for UI). */
  tweetsInRange: number;
  /** Raw pages pulled from X (max 100 tweets each). */
  pagesFetched: number;
  /** True if we stopped before exhausting the timeline (pagination or time budget). */
  truncated: boolean;
  hint?: string;
};

function dayInRange(day: string | undefined, sinceDay: string, untilDay: string): boolean {
  if (!day || day.length < 10) return false;
  const d = day.slice(0, 10);
  return d >= sinceDay && d <= untilDay;
}

export async function fetchTwitterTimelineInsights(params: {
  accessToken: string;
  platformUserId: string;
  sinceDay: string;
  untilDay: string;
  budgetExpired: () => boolean;
  maxPages?: number;
}): Promise<TwitterTimelineInsightsResult> {
  const { accessToken, platformUserId, sinceDay, untilDay, budgetExpired } = params;
  const maxPages = params.maxPages ?? 18;

  const emptyTotals = () => ({
    impressions: 0,
    likes: 0,
    replies: 0,
    retweets: 0,
    quotes: 0,
    bookmarks: 0,
  });

  let twitterUser: TwitterUserPublicRow | null = null;
  try {
    const userRes = await axios.get<{
      data?: {
        name?: string;
        username?: string;
        description?: string;
        profile_image_url?: string;
        verified?: boolean;
        url?: string;
        public_metrics?: {
          followers_count?: number;
          following_count?: number;
          tweet_count?: number;
          listed_count?: number;
        };
      };
    }>(`https://api.twitter.com/2/users/${platformUserId}`, {
      params: {
        'user.fields':
          'public_metrics,profile_image_url,description,created_at,location,url,verified,name,username',
      },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 12_000,
      validateStatus: () => true,
    });
    if (userRes.status >= 200 && userRes.status < 300 && userRes.data?.data) {
      const u = userRes.data.data;
      const pm = u.public_metrics;
      twitterUser = {
        followers_count: typeof pm?.followers_count === 'number' ? pm.followers_count : 0,
        following_count: typeof pm?.following_count === 'number' ? pm.following_count : 0,
        tweet_count: typeof pm?.tweet_count === 'number' ? pm.tweet_count : 0,
        listed_count: typeof pm?.listed_count === 'number' ? pm.listed_count : 0,
        name: u.name,
        username: u.username,
        description: u.description,
        profile_image_url: u.profile_image_url,
        verified: u.verified === true,
        url: u.url,
      };
    }
  } catch {
    /* user lookup best-effort */
  }

  type ApiTweet = {
    id: string;
    text?: string;
    created_at?: string;
    attachments?: { media_keys?: string[] };
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
      bookmark_count?: number;
      impression_count?: number;
    };
  };

  const collected: TwitterRecentTweetRow[] = [];
  let paginationToken: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  for (let page = 0; page < maxPages && !budgetExpired(); page++) {
    const qs: Record<string, string> = {
      max_results: '100',
      'tweet.fields': 'created_at,public_metrics,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'url,preview_image_url,alt_text',
      exclude: 'retweets,replies',
    };
    if (paginationToken) qs.pagination_token = paginationToken;

    let tweetsRes: {
      status: number;
      data?: { data?: ApiTweet[]; includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> }; meta?: { next_token?: string; result_count?: number } };
    };
    try {
      const r = await axios.get<{
        data?: ApiTweet[];
        includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> };
        meta?: { next_token?: string; result_count?: number };
      }>(`https://api.twitter.com/2/users/${platformUserId}/tweets`, {
        params: qs,
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20_000,
        validateStatus: () => true,
      });
      tweetsRes = { status: r.status, data: r.data };
    } catch {
      break;
    }

    if (tweetsRes.status < 200 || tweetsRes.status >= 300) break;

    pagesFetched += 1;
    const items = tweetsRes.data?.data ?? [];
    const mediaList = tweetsRes.data?.includes?.media ?? [];
    const mediaByKey = new Map(mediaList.map((m) => [m.media_key, m]));

    let oldestDayInPage: string | null = null;
    for (const t of items) {
      const day = t.created_at?.slice(0, 10) ?? null;
      if (day && (oldestDayInPage === null || day < oldestDayInPage)) oldestDayInPage = day;
      const pm = t.public_metrics;
      const firstMediaKey = t.attachments?.media_keys?.[0];
      const firstMedia = firstMediaKey ? mediaByKey.get(firstMediaKey) : undefined;
      const thumbnailUrl = firstMedia?.preview_image_url ?? firstMedia?.url ?? null;
      collected.push({
        id: t.id,
        text: (t.text ?? '').slice(0, 280),
        created_at: t.created_at ?? null,
        like_count: pm?.like_count ?? 0,
        reply_count: pm?.reply_count ?? 0,
        retweet_count: pm?.retweet_count ?? 0,
        quote_count: pm?.quote_count ?? 0,
        bookmark_count: pm?.bookmark_count ?? 0,
        impression_count: pm?.impression_count ?? 0,
        thumbnailUrl,
      });
    }

    paginationToken = tweetsRes.data?.meta?.next_token;
    if (!paginationToken || items.length === 0) break;
    if (oldestDayInPage && oldestDayInPage < sinceDay) break;
  }

  if (pagesFetched >= maxPages && paginationToken) truncated = true;

  const inRange = collected.filter((t) => dayInRange(t.created_at ?? undefined, sinceDay, untilDay));

  const impressionsByDate: Record<string, number> = {};
  const engagementByDate: Record<string, number> = {};
  const totals = emptyTotals();

  for (const t of inRange) {
    const imp = t.impression_count;
    const eng =
      t.like_count + t.reply_count + t.retweet_count + t.quote_count + (t.bookmark_count || 0);
    totals.impressions += imp;
    totals.likes += t.like_count;
    totals.replies += t.reply_count;
    totals.retweets += t.retweet_count;
    totals.quotes += t.quote_count;
    totals.bookmarks += t.bookmark_count;
    const day = t.created_at?.slice(0, 10);
    if (day) {
      impressionsByDate[day] = (impressionsByDate[day] ?? 0) + imp;
      engagementByDate[day] = (engagementByDate[day] ?? 0) + eng;
    }
  }

  const toSortedSeries = (m: Record<string, number>) =>
    Object.entries(m)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

  const hintParts: string[] = [];
  if (truncated) {
    hintParts.push(
      'Timeline is paginated: not all historical tweets were scanned. Narrow the date range or sync posts for fuller coverage.'
    );
  }
  if (inRange.length === 0 && collected.length > 0) {
    hintParts.push('No posts in the selected date range in the fetched timeline window.');
  }

  return {
    twitterUser,
    recentTweets: inRange.slice(0, 200),
    impressionsTimeSeries: toSortedSeries(impressionsByDate),
    engagementTimeSeries: toSortedSeries(engagementByDate),
    totals,
    tweetsInRange: inRange.length,
    pagesFetched,
    truncated,
    hint: hintParts.length ? hintParts.join(' ') : undefined,
  };
}
