/**
 * Instagram sync adapter.
 * Delegates to the existing metric-snapshot and insights infrastructure already in place.
 * This keeps the new sync engine thin — it orchestrates, the existing helpers do the heavy lifting.
 */

import { prisma } from '@/lib/db';
import {
  fetchCurrentInstagramMetrics,
  upsertDailyMetricSnapshot,
} from '@/lib/analytics/metric-snapshots';
import axios from 'axios';
import { facebookGraphBaseUrl, META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';

const igBaseUrl = `https://graph.instagram.com/${META_GRAPH_FACEBOOK_API_VERSION}`;
const fbBaseUrl = facebookGraphBaseUrl;

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
};

/** Fetch and store current follower count snapshot. */
async function syncAccountOverview(account: AccountRow) {
  const { followersCount, followingCount } = await fetchCurrentInstagramMetrics(
    account.platformUserId,
    account.accessToken
  );
  const today = new Date().toISOString().slice(0, 10);
  await upsertDailyMetricSnapshot({
    userId: account.userId,
    socialAccountId: account.id,
    platform: 'INSTAGRAM',
    externalAccountId: account.platformUserId,
    metricDate: today,
    followersCount,
    followingCount,
    fansCount: null,
    source: 'scheduled_sync',
  });
  return { itemsProcessed: 1 };
}

/** Fetch recent Instagram media and upsert into ImportedPost. */
async function syncRecentContent(account: AccountRow) {
  const fields = 'id,media_type,media_product_type,media_url,permalink,caption,timestamp,thumbnail_url,like_count,comments_count';
  let items = 0;
  let partial = false;

  for (const base of [fbBaseUrl, igBaseUrl]) {
    try {
      const res = await axios.get<{
        data?: Array<{
          id: string;
          media_type?: string;
          media_product_type?: string;
          caption?: string;
          permalink?: string;
          timestamp?: string;
          thumbnail_url?: string;
          media_url?: string;
          like_count?: number;
          comments_count?: number;
        }>;
        error?: { message?: string };
      }>(`${base}/${account.platformUserId}/media`, {
        params: { fields, limit: 50, access_token: account.accessToken },
        timeout: 12_000,
      });

      if (res.data?.error) continue;
      const posts = res.data?.data ?? [];

      for (const p of posts) {
        if (!p.id || !p.timestamp) continue;
        try {
          await prisma.importedPost.upsert({
            where: {
              socialAccountId_platformPostId: {
                socialAccountId: account.id,
                platformPostId: p.id,
              },
            },
            update: {
              content:      p.caption ?? undefined,
              thumbnailUrl: p.thumbnail_url ?? p.media_url ?? undefined,
              permalinkUrl: p.permalink ?? undefined,
              // Do not clear impressions or bump syncedAt here: post_metrics updates those.
              // Resetting impressions on every media list forced up to 100 /insights calls per sync.
              likeCount:    p.like_count ?? 0,
              commentsCount: p.comments_count ?? 0,
              mediaType:    p.media_product_type ?? p.media_type ?? undefined,
            },
            create: {
              socialAccountId: account.id,
              platformPostId:  p.id,
              platform:        'INSTAGRAM',
              content:         p.caption ?? null,
              thumbnailUrl:    p.thumbnail_url ?? p.media_url ?? null,
              permalinkUrl:    p.permalink ?? null,
              publishedAt:     new Date(p.timestamp),
              mediaType:       p.media_product_type ?? p.media_type ?? null,
              likeCount:       p.like_count ?? 0,
              commentsCount:   p.comments_count ?? 0,
            },
          });
          items++;
        } catch { /* skip duplicate/constraint issues */ }
      }
      break; // success — no need to try the other base
    } catch (e) {
      console.warn(`[IG adapter] syncRecentContent via ${base} failed:`, (e as Error)?.message?.slice(0, 120));
      partial = true;
    }
  }

  return { itemsProcessed: items, partial };
}

/**
 * Minimum gap between /insights fetches for posts that already have non-zero impressions.
 * Increased to 24h: IG post metrics change slowly after the first hour; 12h was generating
 * ~1200+ ShadowIGMedia/insights API calls per day (visible in the Meta rate-limit dashboard).
 */
const IG_INSIGHTS_MIN_REFRESH_MS = 24 * 60 * 60 * 1000;
/**
 * Even posts with 0 impressions must wait at least this long between fetches.
 * Previously there was no cooldown for zero-impression posts, causing them to be
 * re-fetched on every cron run (every 15 min), which was the primary cause of the spike.
 */
const IG_INSIGHTS_ZERO_IMP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Reduced batch: we only need recent posts; older posts change metrics infrequently. */
const IG_POST_METRICS_BATCH = 10;
/** Skip metrics for posts older than this; stories expire and old posts are rarely updated. */
const IG_POST_METRICS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Refresh performance metrics for recently synced posts. */
async function syncContentMetrics(account: AccountRow) {
  const recentPosts = await prisma.importedPost.findMany({
    where: {
      socialAccountId: account.id,
      publishedAt: { gte: new Date(Date.now() - IG_POST_METRICS_MAX_AGE_MS) },
    },
    select: { platformPostId: true, impressions: true, syncedAt: true },
    take: IG_POST_METRICS_BATCH,
    orderBy: { publishedAt: 'desc' },
  });

  let items = 0;
  const metricFields = 'impressions,reach,total_interactions,plays,video_views';
  const now = Date.now();

  for (const post of recentPosts) {
    const ageSinceSyncMs = now - post.syncedAt.getTime();
    // Posts with existing impressions: full 24h cooldown.
    // Posts with 0 impressions: shorter 6h cooldown to catch new posts, but NOT every cron run.
    const cooldownMs = post.impressions > 0 ? IG_INSIGHTS_MIN_REFRESH_MS : IG_INSIGHTS_ZERO_IMP_COOLDOWN_MS;
    if (ageSinceSyncMs < cooldownMs) {
      continue;
    }
    try {
      const res = await axios.get<{
        data?: Array<{ name: string; values?: Array<{ value: number }>; period?: string }>;
        error?: { message?: string };
      }>(`${fbBaseUrl}/${post.platformPostId}/insights`, {
        params: { metric: metricFields, access_token: account.accessToken },
        timeout: 8_000,
      });
      if (res.data?.error || !res.data?.data) continue;

      const metrics: Record<string, number> = {};
      for (const m of res.data.data) {
        const val = Array.isArray(m.values) ? (m.values[0]?.value ?? 0) : 0;
        metrics[m.name] = val;
      }

      await prisma.importedPost.updateMany({
        where: { socialAccountId: account.id, platformPostId: post.platformPostId },
        data: {
          impressions:   metrics.impressions ?? metrics.reach ?? 0,
          interactions:  metrics.total_interactions ?? 0,
          syncedAt:      new Date(),
        },
      });
      items++;
    } catch {
      /* skip individual post errors */
    } finally {
      // Always pause after a Graph attempt so errors and empty payloads do not burst.
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  return { itemsProcessed: items };
}

/** Fetch and cache recent comments (delegated to the existing comments API route logic). */
async function syncComments(_account: AccountRow) {
  // Comment syncing is handled by the existing /api/social/accounts/[id]/comments route
  // which is polled from the inbox. Here we just record that the sync ran.
  return { itemsProcessed: 0 };
}

/** Fetch and cache DM conversations (delegated to the existing conversations route). */
async function syncMessages(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

/** Fetch audience demographics — relies on existing insights infrastructure. */
async function syncAudienceDemographics(_account: AccountRow) {
  // Demographics are fetched on-demand via the insights route and stored in insightsJson.
  return { itemsProcessed: 0 };
}

export const instagramAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncMessages,
  syncAudienceDemographics,
};
