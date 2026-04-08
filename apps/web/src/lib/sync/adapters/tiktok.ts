/**
 * TikTok sync adapter.
 * Uses the TikTok Open API v2 for user info and video list.
 */

import { prisma } from '@/lib/db';
import { upsertDailyMetricSnapshot } from '@/lib/analytics/metric-snapshots';
import { parseTikTokVideoEngagement, parseTikTokVideoDurationSec } from '@/lib/tiktok/video-engagement';
import axios from 'axios';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

function isMissingImportedPostSavesCountColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { column?: string } };
  const msg = (e?.message ?? '').toLowerCase();
  const col = (e?.meta?.column ?? '').toLowerCase();
  return e?.code === 'P2022' && (msg.includes('savescount') || col.includes('savescount'));
}

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
    type TikTokVideoRow = {
      id?: string;
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
      [key: string]: unknown;
    };
    const fields =
      'id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count,play_count,favorites_count,duration';
    const allVideos: TikTokVideoRow[] = [];
    let cursor: number | string | undefined;
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < 10) {
      const body: { max_count: number; cursor?: number | string } = { max_count: 20 };
      if (cursor != null) body.cursor = cursor;
      const res = await axios.post<{
        data?: { videos?: TikTokVideoRow[]; cursor?: number | string; has_more?: boolean };
        error?: { code?: string; message?: string };
      }>(
        `${TIKTOK_API}/video/list/?fields=${encodeURIComponent(fields)}`,
        body,
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
          validateStatus: () => true,
        }
      );
      if (res.data?.error?.code && res.data.error.code !== 'ok') {
        console.warn('[TikTok adapter] video/list:', res.data.error.code, res.data.error.message ?? '');
        break;
      }
      const list = res.data?.data?.videos ?? [];
      allVideos.push(...list);
      cursor = res.data?.data?.cursor;
      hasMore = res.data?.data?.has_more === true;
      pages++;
    }

    let items = 0;

    for (const v of allVideos) {
      if (!v.id) continue;
      const raw = v as Record<string, unknown>;
      const { shareCount, saveCount } = parseTikTokVideoEngagement(raw);
      const durationSec = parseTikTokVideoDurationSec(raw);
      const tiktokMeta =
        durationSec != null ? ({ tiktokDurationSec: durationSec } as Record<string, unknown>) : undefined;
      const likes = typeof v.like_count === 'number' ? v.like_count : 0;
      const comments = typeof v.comment_count === 'number' ? v.comment_count : 0;
      const savesVal = saveCount != null ? saveCount : undefined;
      const interactions = likes + comments + shareCount + (saveCount ?? 0);
      const where = {
        socialAccountId_platformPostId: {
          socialAccountId: account.id,
          platformPostId: v.id,
        },
      } as const;
      try {
        await prisma.importedPost.upsert({
          where,
          update: {
            content: v.video_description ?? v.title ?? undefined,
            thumbnailUrl: v.cover_image_url ?? undefined,
            permalinkUrl: v.share_url ?? undefined,
            impressions: v.view_count ?? v.play_count ?? 0,
            interactions,
            likeCount: likes,
            commentsCount: comments,
            sharesCount: shareCount,
            repostsCount: 0,
            ...(savesVal !== undefined ? { savesCount: savesVal } : {}),
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            syncedAt: new Date(),
          },
          create: {
            socialAccountId: account.id,
            platformPostId: v.id,
            platform: 'TIKTOK',
            content: v.video_description ?? v.title ?? null,
            thumbnailUrl: v.cover_image_url ?? null,
            permalinkUrl: v.share_url ?? null,
            publishedAt: v.create_time ? new Date(v.create_time * 1000) : new Date(),
            mediaType: 'VIDEO',
            impressions: v.view_count ?? v.play_count ?? 0,
            interactions,
            likeCount: likes,
            commentsCount: comments,
            sharesCount: shareCount,
            repostsCount: 0,
            savesCount: saveCount ?? 0,
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
          },
        });
        items++;
      } catch (e) {
        if (!isMissingImportedPostSavesCountColumn(e)) continue;
        const interactionsNoSaves = likes + comments + shareCount;
        try {
          await prisma.importedPost.upsert({
            where,
            update: {
              content: v.video_description ?? v.title ?? undefined,
              thumbnailUrl: v.cover_image_url ?? undefined,
              permalinkUrl: v.share_url ?? undefined,
              impressions: v.view_count ?? v.play_count ?? 0,
              interactions: interactionsNoSaves,
              likeCount: likes,
              commentsCount: comments,
              sharesCount: shareCount,
              repostsCount: 0,
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
              syncedAt: new Date(),
            },
            create: {
              socialAccountId: account.id,
              platformPostId: v.id,
              platform: 'TIKTOK',
              content: v.video_description ?? v.title ?? null,
              thumbnailUrl: v.cover_image_url ?? null,
              permalinkUrl: v.share_url ?? null,
              publishedAt: v.create_time ? new Date(v.create_time * 1000) : new Date(),
              mediaType: 'VIDEO',
              impressions: v.view_count ?? v.play_count ?? 0,
              interactions: interactionsNoSaves,
              likeCount: likes,
              commentsCount: comments,
              sharesCount: shareCount,
              repostsCount: 0,
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            },
          });
          items++;
        } catch {
          /* skip */
        }
      }
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
