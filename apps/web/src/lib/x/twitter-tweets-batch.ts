import axios from 'axios';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';

const TWEETS_LOOKUP_URL = 'https://api.twitter.com/2/tweets';

export type TweetMetricsBundle = {
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  impression_count: number;
  bookmark_count: number;
};

export type TweetWithMetrics = {
  id: string;
  text?: string;
  created_at?: string;
  attachments?: { media_keys?: string[] };
  public_metrics?: Partial<TweetMetricsBundle>;
  organic_metrics?: Partial<TweetMetricsBundle>;
  non_public_metrics?: Partial<TweetMetricsBundle>;
};

function num(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Prefer public_metrics; fill gaps from organic / non_public when present. */
export function metricsFromTweetPayload(t: TweetWithMetrics): TweetMetricsBundle {
  const pub = t.public_metrics ?? {};
  const org = t.organic_metrics ?? {};
  const np = t.non_public_metrics ?? {};
  return {
    like_count: num(pub.like_count) || num(org.like_count) || num(np.like_count),
    reply_count: num(pub.reply_count) || num(org.reply_count) || num(np.reply_count),
    retweet_count: num(pub.retweet_count) || num(org.retweet_count) || num(np.retweet_count),
    quote_count: num(pub.quote_count) || num(org.quote_count),
    impression_count: num(pub.impression_count) || num(org.impression_count) || num(np.impression_count),
    bookmark_count: num(pub.bookmark_count) || num(org.bookmark_count),
  };
}

async function fetchTweetChunk(
  socialAccountId: string,
  bearerToken: string,
  ids: string[],
  tweetFields: string
): Promise<{ data?: TweetWithMetrics[]; includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> } }> {
  await checkAndIncrementXApiUsage(socialAccountId);
  const res = await axios.get<{
    data?: TweetWithMetrics[];
    includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> };
    errors?: Array<{ message?: string }>;
  }>(TWEETS_LOOKUP_URL, {
    params: {
      ids: ids.join(','),
      'tweet.fields': tweetFields,
      expansions: 'attachments.media_keys',
      'media.fields': 'url,preview_image_url',
    },
    headers: { Authorization: `Bearer ${bearerToken}` },
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (res.status === 429) {
    throw new Error('X is rate-limiting tweet lookups (429). Try again shortly.');
  }
  if (res.status === 400 && /non_public|organic|Invalid|not supported|field/i.test(JSON.stringify(res.data))) {
    return { data: [], includes: {} };
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(res.data?.errors?.[0]?.message ?? `X tweets lookup failed (${res.status})`);
  }
  return res.data ?? {};
}

/**
 * Loads up to 100 tweet IDs per HTTP request via `GET /2/tweets?ids=…` (no per-id loop).
 * Tries rich metric fields first, then falls back if the product tier rejects them.
 */
export type TweetsBatchResult = {
  byId: Map<string, TweetWithMetrics>;
  mediaByKey: Map<string, { url?: string; preview_image_url?: string }>;
};

export async function fetchTweetsByIdsBatched(
  socialAccountId: string,
  bearerToken: string,
  tweetIds: string[]
): Promise<TweetsBatchResult> {
  const unique = Array.from(new Set(tweetIds.filter(Boolean)));
  const out = new Map<string, TweetWithMetrics>();
  const mediaByKey = new Map<string, { url?: string; preview_image_url?: string }>();
  if (!unique.length || !bearerToken.trim()) return { byId: out, mediaByKey };

  const richFields = 'attachments,created_at,text,public_metrics,organic_metrics,non_public_metrics';
  const mediumFields = 'attachments,created_at,text,public_metrics,organic_metrics';
  const basicFields = 'attachments,created_at,text,public_metrics';

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    let payload = await fetchTweetChunk(socialAccountId, bearerToken, chunk, richFields);
    if (!payload.data?.length && chunk.length > 0) {
      payload = await fetchTweetChunk(socialAccountId, bearerToken, chunk, mediumFields);
    }
    if (!payload.data?.length && chunk.length > 0) {
      payload = await fetchTweetChunk(socialAccountId, bearerToken, chunk, basicFields);
    }
    for (const m of payload.includes?.media ?? []) {
      if (m.media_key) mediaByKey.set(m.media_key, { url: m.url, preview_image_url: m.preview_image_url });
    }
    for (const t of payload.data ?? []) {
      if (t?.id) out.set(t.id, t);
    }
  }
  return { byId: out, mediaByKey };
}
