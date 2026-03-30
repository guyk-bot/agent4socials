/**
 * TikTok sync adapter.
 * Uses the TikTok Open API v2 for user info and video list.
 */

import { prisma } from '@/lib/db';
import { upsertDailyMetricSnapshot } from '@/lib/analytics/metric-snapshots';
import axios from 'axios';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

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
      data?: { user?: { follower_count?: number; following_count?: number } };
      error?: { code?: string };
    }>(`${TIKTOK_API}/user/info/`, {
      params: { fields: 'follower_count,following_count,likes_count' },
      headers: { Authorization: `Bearer ${account.accessToken}` },
      timeout: 10_000,
    });

    const user = res.data?.data?.user;
    if (!user) return { itemsProcessed: 0, partial: true };

    const today = new Date().toISOString().slice(0, 10);
    await upsertDailyMetricSnapshot({
      userId: account.userId,
      socialAccountId: account.id,
      platform: 'TIKTOK',
      externalAccountId: account.platformUserId,
      metricDate: today,
      followersCount: user.follower_count ?? null,
      followingCount: user.following_count ?? null,
      fansCount: null,
      source: 'scheduled_sync',
    });
    return { itemsProcessed: 1 };
  } catch (e) {
    console.warn('[TikTok adapter] syncAccountOverview failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }
}

async function syncRecentContent(account: AccountRow) {
  try {
    const res = await axios.post<{
      data?: { videos?: Array<{
        id: string;
        title?: string;
        video_description?: string;
        cover_image_url?: string;
        share_url?: string;
        create_time?: number;
        like_count?: number;
        comment_count?: number;
        share_count?: number;
        view_count?: number;
        play_count?: number;
      }> };
      error?: { code?: string };
    }>(`${TIKTOK_API}/video/list/`, {
      max_count: 20,
      cursor: 0,
    }, {
      params: {
        fields: 'id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count,play_count',
      },
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 12_000,
    });

    const videos = res.data?.data?.videos ?? [];
    let items = 0;

    for (const v of videos) {
      if (!v.id) continue;
      try {
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: {
              socialAccountId: account.id,
              platformPostId: v.id,
            },
          },
          update: {
            content:      v.video_description ?? v.title ?? undefined,
            thumbnailUrl: v.cover_image_url ?? undefined,
            permalinkUrl: v.share_url ?? undefined,
            impressions:  v.view_count ?? v.play_count ?? 0,
            interactions: (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0),
            likeCount:    v.like_count ?? 0,
            commentsCount: v.comment_count ?? 0,
            sharesCount:  v.share_count ?? 0,
            syncedAt:     new Date(),
          },
          create: {
            socialAccountId: account.id,
            platformPostId:  v.id,
            platform:        'TIKTOK',
            content:         v.video_description ?? v.title ?? null,
            thumbnailUrl:    v.cover_image_url ?? null,
            permalinkUrl:    v.share_url ?? null,
            publishedAt:     v.create_time ? new Date(v.create_time * 1000) : new Date(),
            mediaType:       'VIDEO',
            impressions:     v.view_count ?? v.play_count ?? 0,
            interactions:    (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0),
            likeCount:       v.like_count ?? 0,
            commentsCount:   v.comment_count ?? 0,
            sharesCount:     v.share_count ?? 0,
          },
        });
        items++;
      } catch { /* skip */ }
    }

    return { itemsProcessed: items };
  } catch (e) {
    console.warn('[TikTok adapter] syncRecentContent failed:', (e as Error)?.message?.slice(0, 120));
    return { itemsProcessed: 0, partial: true };
  }
}

async function syncContentMetrics(account: AccountRow) {
  // TikTok metrics are fetched with content; no separate metrics endpoint needed.
  return await syncRecentContent(account);
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const tiktokAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
};
