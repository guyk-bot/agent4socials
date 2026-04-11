/**
 * YouTube sync adapter.
 * Uses YouTube Data API v3 for channel and video data.
 */

import { prisma } from '@/lib/db';
import { upsertDailyMetricSnapshot } from '@/lib/analytics/metric-snapshots';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import axios from 'axios';

const YT_API = 'https://www.googleapis.com/youtube/v3';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
};

/** Returns true if the error is an auth failure (token expired / revoked). */
function isAuthError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = (e as Error)?.message ?? '';
  return msg.includes('401') || msg.includes('invalid_grant') || msg.includes('Token has been expired');
}

/** Mark account as needing reconnect so the cron skips it next time. */
async function markNeedsReconnect(accountId: string, reason: string): Promise<void> {
  try {
    await prisma.socialAccount.updateMany({
      where: { id: accountId },
      data: { lastSyncStatus: 'needs_reconnect', lastSyncError: reason.slice(0, 500) },
    });
  } catch { /* best-effort */ }
}

/** Get a fresh YouTube token, falling back to the stored one if refresh fails. */
async function getToken(account: AccountRow): Promise<string> {
  try {
    return await getValidYoutubeToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken ?? null,
      expiresAt: account.expiresAt ?? null,
    });
  } catch {
    return account.accessToken;
  }
}

async function syncAccountOverview(account: AccountRow) {
  const token = await getToken(account);
  try {
    const res = await axios.get<{
      items?: Array<{ statistics?: { subscriberCount?: string; videoCount?: string } }>;
      error?: { message?: string };
    }>(`${YT_API}/channels`, {
      params: { part: 'statistics', id: account.platformUserId, access_token: token },
      timeout: 10_000,
      validateStatus: () => true,
    });

    if (res.status === 401 || res.status === 403) {
      await markNeedsReconnect(account.id, `YouTube auth error (${res.status}). Reconnect YouTube.`);
      return { itemsProcessed: 0, partial: true };
    }

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
    if (isAuthError(e)) {
      await markNeedsReconnect(account.id, 'YouTube token expired. Reconnect YouTube from the sidebar.');
    }
    console.warn('[YouTube adapter] syncAccountOverview failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }
}

async function syncRecentContent(account: AccountRow) {
  const token = await getToken(account);
  try {
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
        access_token: token,
      },
      timeout: 12_000,
      validateStatus: () => true,
    });

    if (searchRes.status === 401 || searchRes.status === 403) {
      await markNeedsReconnect(account.id, `YouTube auth error (${searchRes.status}). Reconnect YouTube.`);
      return { itemsProcessed: 0, partial: true };
    }

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
        access_token: token,
      },
      timeout: 12_000,
      validateStatus: () => true,
    });

    if (vidRes.status === 401 || vidRes.status === 403) {
      await markNeedsReconnect(account.id, `YouTube auth error (${vidRes.status}). Reconnect YouTube.`);
      return { itemsProcessed: 0, partial: true };
    }

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
    if (isAuthError(e)) {
      await markNeedsReconnect(account.id, 'YouTube token expired. Reconnect YouTube from the sidebar.');
    }
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
