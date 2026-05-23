/**
 * Sync Threads posts into ImportedPost for dashboard and history.
 */

import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';

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
    const thumb =
      row.media_type === 'TEXT'
        ? null
        : (typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null) ||
          (typeof row.media_url === 'string' && row.media_type === 'IMAGE' ? row.media_url : null);
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
        mediaType: row.media_type ?? null,
        permalinkUrl: row.permalink ?? null,
        platform: Platform.THREADS,
      },
      create: {
        socialAccountId: account.id,
        platform: Platform.THREADS,
        platformPostId: id,
        content,
        thumbnailUrl: thumb,
        publishedAt,
        mediaType: row.media_type ?? null,
        permalinkUrl: row.permalink ?? null,
      },
    });
    processed += 1;
  }
  return { itemsProcessed: processed };
}
