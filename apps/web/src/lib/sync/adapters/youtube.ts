/**
 * YouTube sync adapter.
 * Uses YouTube Data API v3 for channel and video data.
 */

import { prisma } from '@/lib/db';
import { upsertDailyMetricSnapshot } from '@/lib/analytics/metric-snapshots';
import axios from 'axios';

const YT_API = 'https://www.googleapis.com/youtube/v3';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
};

async function syncAccountOverview(account: AccountRow) {
  try {
    const res = await axios.get<{
      items?: Array<{ statistics?: { subscriberCount?: string; videoCount?: string } }>;
      error?: { message?: string };
    }>(`${YT_API}/channels`, {
      params: { part: 'statistics', id: account.platformUserId, access_token: account.accessToken },
      timeout: 10_000,
    });

    const stats = res.data?.items?.[0]?.statistics;
    if (!stats) return { itemsProcessed: 0, partial: true };

    const today = new Date().toISOString().slice(0, 10);
    await upsertDailyMetricSnapshot({
      userId: account.userId,
      socialAccountId: account.id,
      platform: 'YOUTUBE',
      externalAccountId: account.platformUserId,
      metricDate: today,
      followersCount: stats.subscriberCount ? parseInt(stats.subscriberCount, 10) : null,
      followingCount: null,
      fansCount: null,
      source: 'scheduled_sync',
    });
    return { itemsProcessed: 1 };
  } catch (e) {
    console.warn('[YouTube adapter] syncAccountOverview failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }
}

async function syncRecentContent(account: AccountRow) {
  try {
    // Search for recent uploads
    const searchRes = await axios.get<{
      items?: Array<{ id?: { videoId?: string } }>;
      error?: { message?: string };
    }>(`${YT_API}/search`, {
      params: {
        part: 'id',
        channelId: account.platformUserId,
        type: 'video',
        order: 'date',
        maxResults: 25,
        access_token: account.accessToken,
      },
      timeout: 12_000,
    });

    const videoIds = (searchRes.data?.items ?? [])
      .map((i) => i.id?.videoId)
      .filter(Boolean) as string[];

    if (!videoIds.length) return { itemsProcessed: 0 };

    const vidRes = await axios.get<{
      items?: Array<{
        id?: string;
        snippet?: { title?: string; description?: string; thumbnails?: { high?: { url?: string } }; publishedAt?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    }>(`${YT_API}/videos`, {
      params: {
        part: 'snippet,statistics',
        id: videoIds.join(','),
        access_token: account.accessToken,
      },
      timeout: 12_000,
    });

    let items = 0;
    for (const v of vidRes.data?.items ?? []) {
      if (!v.id || !v.snippet?.publishedAt) continue;
      try {
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: {
              socialAccountId: account.id,
              platformPostId: v.id,
            },
          },
          update: {
            content:      v.snippet.title ?? undefined,
            thumbnailUrl: v.snippet.thumbnails?.high?.url ?? undefined,
            impressions:  parseInt(v.statistics?.viewCount ?? '0', 10),
            likeCount:    parseInt(v.statistics?.likeCount ?? '0', 10),
            commentsCount: parseInt(v.statistics?.commentCount ?? '0', 10),
            syncedAt:     new Date(),
          },
          create: {
            socialAccountId: account.id,
            platformPostId:  v.id,
            platform:        'YOUTUBE',
            content:         v.snippet.title ?? null,
            thumbnailUrl:    v.snippet.thumbnails?.high?.url ?? null,
            publishedAt:     new Date(v.snippet.publishedAt),
            mediaType:       'VIDEO',
            impressions:     parseInt(v.statistics?.viewCount ?? '0', 10),
            likeCount:       parseInt(v.statistics?.likeCount ?? '0', 10),
            commentsCount:   parseInt(v.statistics?.commentCount ?? '0', 10),
          },
        });
        items++;
      } catch { /* skip */ }
    }
    return { itemsProcessed: items };
  } catch (e) {
    console.warn('[YouTube adapter] syncRecentContent failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }
}

async function syncContentMetrics(account: AccountRow) {
  return syncRecentContent(account);
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncAudienceDemographics(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const youtubeAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncAudienceDemographics,
};
