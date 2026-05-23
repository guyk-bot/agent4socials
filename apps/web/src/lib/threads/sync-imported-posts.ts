/**
 * Sync Threads posts into ImportedPost for dashboard and history.
 */

import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';
import { normalizeThreadsMediaType } from '@/lib/threads/post-media-type';

type InsightMetric = {
  name?: string;
  total_value?: { value?: number };
  values?: Array<{ value?: number }>;
};

function insightMetricTotal(m: InsightMetric): number {
  if (m.total_value?.value != null && Number.isFinite(m.total_value.value)) {
    return m.total_value.value;
  }
  let sum = 0;
  for (const v of m.values ?? []) {
    if (typeof v.value === 'number' && Number.isFinite(v.value)) sum += v.value;
  }
  return sum;
}

async function fetchThreadsPostInsights(
  postId: string,
  token: string
): Promise<{
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
} | null> {
  const { status, data } = await threadsGet<{ data?: InsightMetric[]; error?: { message?: string } }>(
    `${postId}/insights`,
    token,
    { metric: 'views,likes,replies,reposts,quotes' }
  );
  if (status !== 200 || !Array.isArray(data?.data)) return null;
  const out = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 };
  for (const m of data.data) {
    const n = insightMetricTotal(m);
    const name = (m.name ?? '').toLowerCase();
    if (name === 'views') out.views += n;
    if (name === 'likes') out.likes += n;
    if (name === 'replies') out.replies += n;
    if (name === 'reposts') out.reposts += n;
    if (name === 'quotes') out.quotes += n;
  }
  return out;
}

type ThreadsPostRow = {
  id?: string;
  text?: string;
  timestamp?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
};

export type SyncThreadsPostsResult = {
  itemsProcessed: number;
  syncError?: string;
};

export async function syncThreadsPosts(account: {
  id: string;
  platformUserId: string;
  accessToken: string;
  expiresAt?: Date | null;
}): Promise<SyncThreadsPostsResult> {
  const token = await getValidThreadsToken(account);
  const { status, data } = await threadsGet<{ data?: ThreadsPostRow[]; error?: { message?: string } }>(
    'me/threads',
    token,
    {
      fields: 'id,text,timestamp,media_type,media_url,thumbnail_url,permalink',
      limit: 50,
    }
  );
  if (status !== 200) {
    const msg = data?.error?.message ?? `Threads posts list failed (HTTP ${status})`;
    return { itemsProcessed: 0, syncError: msg.slice(0, 300) };
  }
  const rows = data?.data ?? [];
  let processed = 0;
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) continue;
    const publishedAt = row.timestamp ? new Date(row.timestamp) : new Date();
    const content = typeof row.text === 'string' ? row.text : null;
    const mediaType = normalizeThreadsMediaType(row.media_type) || null;
    const thumb =
      mediaType === 'TEXT'
        ? null
        : (typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null) ||
          (typeof row.media_url === 'string' && mediaType === 'IMAGE' ? row.media_url : null);
    const metrics = await fetchThreadsPostInsights(id, token);
    const interactions = metrics
      ? metrics.likes + metrics.replies + metrics.reposts + metrics.quotes
      : undefined;
    await prisma.importedPost.upsert({
      where: {
        socialAccountId_platformPostId: {
          socialAccountId: account.id,
          platformPostId: id,
        },
      },
      update: {
        content,
        thumbnailUrl: thumb,
        publishedAt,
        mediaType,
        permalinkUrl: row.permalink ?? null,
        platform: Platform.THREADS,
        ...(metrics
          ? {
              impressions: metrics.views,
              likeCount: metrics.likes,
              commentsCount: metrics.replies,
              repostsCount: metrics.reposts + metrics.quotes,
              interactions,
            }
          : {}),
      },
      create: {
        socialAccountId: account.id,
        platform: Platform.THREADS,
        platformPostId: id,
        content,
        thumbnailUrl: thumb,
        publishedAt,
        mediaType,
        permalinkUrl: row.permalink ?? null,
        impressions: metrics?.views ?? 0,
        likeCount: metrics?.likes ?? 0,
        commentsCount: metrics?.replies ?? 0,
        repostsCount: metrics ? metrics.reposts + metrics.quotes : 0,
        interactions: interactions ?? 0,
      },
    });
    processed += 1;
  }
  return { itemsProcessed: processed };
}
