/**
 * Facebook sync adapter.
 * Leverages existing Facebook sync infrastructure from src/lib/facebook/.
 */

import { prisma } from '@/lib/db';
import {
  fetchCurrentFacebookMetrics,
  upsertDailyMetricSnapshot,
} from '@/lib/analytics/metric-snapshots';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

const fbBaseUrl = facebookGraphBaseUrl;

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
};

async function syncAccountOverview(account: AccountRow) {
  const { followersCount, fansCount } = await fetchCurrentFacebookMetrics(
    account.platformUserId,
    account.accessToken
  );
  const today = new Date().toISOString().slice(0, 10);
  await upsertDailyMetricSnapshot({
    userId: account.userId,
    socialAccountId: account.id,
    platform: 'FACEBOOK',
    externalAccountId: account.platformUserId,
    metricDate: today,
    followersCount,
    followingCount: null,
    fansCount,
    source: 'scheduled_sync',
  });
  return { itemsProcessed: 1 };
}

async function syncRecentContent(account: AccountRow) {
  let items = 0;
  try {
    const res = await axios.get<{
      data?: Array<{
        id: string;
        message?: string;
        story?: string;
        created_time?: string;
        full_picture?: string;
        permalink_url?: string;
        status_type?: string;
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
        likes?: { summary?: { total_count?: number } };
        reactions?: { summary?: { total_count?: number } };
      }>;
      error?: { message?: string };
    }>(`${fbBaseUrl}/${account.platformUserId}/posts`, {
      params: {
        fields: 'id,message,story,created_time,full_picture,permalink_url,status_type,comments.summary(true),shares,likes.summary(true),reactions.summary(true)',
        limit: 50,
        access_token: account.accessToken,
      },
      timeout: 12_000,
    });

    if (res.data?.error) return { itemsProcessed: 0, partial: true };
    const posts = res.data?.data ?? [];

    for (const p of posts) {
      if (!p.id || !p.created_time) continue;
      try {
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: {
              socialAccountId: account.id,
              platformPostId: p.id,
            },
          },
          update: {
            content:       p.message ?? p.story ?? undefined,
            thumbnailUrl:  p.full_picture ?? undefined,
            permalinkUrl:  p.permalink_url ?? undefined,
            commentsCount: p.comments?.summary?.total_count ?? undefined,
            sharesCount:   p.shares?.count ?? undefined,
            likeCount:     p.reactions?.summary?.total_count ?? p.likes?.summary?.total_count ?? undefined,
            syncedAt:      new Date(),
          },
          create: {
            socialAccountId: account.id,
            platformPostId:  p.id,
            platform:        'FACEBOOK',
            content:         p.message ?? p.story ?? null,
            thumbnailUrl:    p.full_picture ?? null,
            permalinkUrl:    p.permalink_url ?? null,
            publishedAt:     new Date(p.created_time),
            mediaType:       p.status_type ?? null,
            commentsCount:   p.comments?.summary?.total_count ?? 0,
            sharesCount:     p.shares?.count ?? 0,
            likeCount:       p.reactions?.summary?.total_count ?? p.likes?.summary?.total_count ?? 0,
          },
        });
        items++;
      } catch { /* skip */ }
    }
  } catch (e) {
    console.warn('[FB adapter] syncRecentContent failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }

  return { itemsProcessed: items };
}

async function syncContentMetrics(account: AccountRow) {
  const recentPosts = await prisma.importedPost.findMany({
    where: {
      socialAccountId: account.id,
      publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { platformPostId: true },
    take: 100,
    orderBy: { publishedAt: 'desc' },
  });

  let items = 0;
  for (const post of recentPosts) {
    try {
      const res = await axios.get<{
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
        error?: { message?: string };
      }>(`${fbBaseUrl}/${post.platformPostId}/insights`, {
        params: {
          metric:
            'post_media_view,post_total_media_view_unique,post_impressions,post_clicks,post_reactions_by_type_total,post_engaged_users,post_shares',
          access_token: account.accessToken,
        },
        timeout: 8_000,
      });
      if (res.data?.error || !res.data?.data) continue;

      const metrics: Record<string, number> = {};
      for (const m of res.data.data) {
        metrics[m.name] = m.values?.[0]?.value ?? 0;
      }

      const row = await prisma.importedPost.findFirst({
        where: { socialAccountId: account.id, platformPostId: post.platformPostId },
        select: { sharesCount: true },
      });
      const insightShares = metrics.post_shares ?? 0;
      const mergedShares = Math.max(row?.sharesCount ?? 0, insightShares);

      const viewCount =
        typeof metrics.post_media_view === 'number'
          ? metrics.post_media_view
          : typeof metrics.post_impressions === 'number'
            ? metrics.post_impressions
            : 0;

      await prisma.importedPost.updateMany({
        where: { socialAccountId: account.id, platformPostId: post.platformPostId },
        data: {
          impressions: viewCount,
          interactions: metrics.post_clicks ?? 0,
          sharesCount: mergedShares,
          syncedAt:     new Date(),
        },
      });
      items++;
    } catch { /* skip */ }
  }

  return { itemsProcessed: items };
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncMessages(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncAudienceDemographics(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const facebookAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncMessages,
  syncAudienceDemographics,
};
