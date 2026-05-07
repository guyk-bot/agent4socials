import axios from 'axios';
import { prisma } from '@/lib/db';
import { parseTikTokVideoEngagement, parseTikTokVideoDurationSec } from '@/lib/tiktok/video-engagement';

/** Deploys before migration `20260408153000_imported_post_saves_count` have no column; Prisma P2022 would 500 the whole posts list. */
function isMissingImportedPostSavesCountColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { column?: string } };
  const msg = (e?.message ?? '').toLowerCase();
  const col = (e?.meta?.column ?? '').toLowerCase();
  return e?.code === 'P2022' && (msg.includes('savescount') || col.includes('savescount'));
}

/**
 * Pull TikTok `video.list` into `ImportedPost` for analytics (views, likes, etc.).
 * Shared by GET `/social/accounts/[id]/posts?sync=1` and OAuth callback so new connects have DB rows before the dashboard loads.
 */
export async function syncTikTokImportedVideos(params: {
  socialAccountId: string;
  accessToken: string;
}): Promise<string | undefined> {
  const { socialAccountId, accessToken } = params;
  try {
    type TikTokVideo = {
      id?: string;
      title?: string;
      cover_image_url?: string;
      create_time?: number;
      share_url?: string;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
      view_count?: number;
      [key: string]: unknown;
    };
    const fields =
      'cover_image_url,id,title,create_time,share_url,like_count,comment_count,share_count,view_count,duration';
    const allVideos: TikTokVideo[] = [];
    let cursor: number | string | undefined;
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < 10) {
      const body: { max_count: number; cursor?: number | string } = { max_count: 20 };
      if (cursor != null) body.cursor = cursor;
      const res = await axios.post<{
        data?: { videos?: TikTokVideo[]; cursor?: number | string; has_more?: boolean };
        error?: { code?: string; message?: string };
      }>(
        `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`,
        body,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        }
      );
      const list = res.data?.data?.videos ?? [];
      allVideos.push(...list);
      if (res.data?.error?.code && res.data.error.code !== 'ok') {
        const msg = res.data.error.message || res.data.error.code;
        if (msg.includes('scope') || msg.includes('video.list'))
          return 'Add video.list scope in TikTok Developer Portal and reconnect to sync videos.';
        return msg;
      }
      cursor = res.data?.data?.cursor;
      hasMore = res.data?.data?.has_more === true;
      pages++;
    }

    for (const v of allVideos) {
      const videoId = v.id;
      if (!videoId) continue;
      const publishedAt = v.create_time ? new Date(v.create_time * 1000) : new Date();
      const title = v.title ?? null;
      const thumbnailUrl = v.cover_image_url ?? null;
      const permalinkUrl = v.share_url ?? `https://www.tiktok.com/@user/video/${videoId}`;
      const impressions = v.view_count ?? 0;
      const likeCount = v.like_count ?? 0;
      const commentsCount = v.comment_count ?? 0;
      const raw = v as Record<string, unknown>;
      const { shareCount, saveCount } = parseTikTokVideoEngagement(raw);
      const durationSec = parseTikTokVideoDurationSec(raw);
      const sharesCount = shareCount;
      const savesVal = saveCount != null ? saveCount : undefined;
      const interactions = likeCount + commentsCount + sharesCount + (saveCount ?? 0);
      const tiktokMeta =
        durationSec != null ? ({ tiktokDurationSec: durationSec } as Record<string, unknown>) : undefined;
      const whereTt = { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } };
      try {
        await prisma.importedPost.upsert({
          where: whereTt,
          update: {
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions,
            likeCount,
            commentsCount,
            sharesCount,
            repostsCount: 0,
            ...(savesVal !== undefined ? { savesCount: savesVal } : {}),
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: videoId,
            platform: 'TIKTOK',
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions,
            likeCount,
            commentsCount,
            sharesCount,
            repostsCount: 0,
            savesCount: saveCount ?? 0,
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
          },
        });
      } catch (upErr) {
        if (!isMissingImportedPostSavesCountColumn(upErr)) throw upErr;
        const interactionsNoSaves = likeCount + commentsCount + sharesCount;
        await prisma.importedPost.upsert({
          where: whereTt,
          update: {
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions: interactionsNoSaves,
            likeCount,
            commentsCount,
            sharesCount,
            repostsCount: 0,
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: videoId,
            platform: 'TIKTOK',
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions: interactionsNoSaves,
            likeCount,
            commentsCount,
            sharesCount,
            repostsCount: 0,
            ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
          },
        });
      }
    }
    return undefined;
  } catch (e) {
    const ax = e as { response?: { data?: { error?: { message?: string; code?: string } } } };
    const msg = (e as Error)?.message ?? '';
    const apiMsg = ax?.response?.data?.error?.message;
    if (msg.includes('403') || apiMsg?.toLowerCase().includes('scope'))
      return 'Add video.list scope and reconnect to sync TikTok videos.';
    if (msg.includes('401')) return 'Reconnect your TikTok account to sync videos.';
    console.warn('[TikTok sync] unexpected error:', msg.slice(0, 200));
    return `TikTok sync error: ${msg.slice(0, 100)}`;
  }
}
