/**
 * LinkedIn: pull UGC posts into ImportedPost so analytics and history stay up to date.
 * (OAuth overview metrics are not duplicated here; insights route fetches profile/network live.)
 */

import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import {
  fetchMemberUgcPostLifetimeMetrics,
  fetchOrganizationUgcPostStatsBatch,
  isLinkedInOrganizationAccount,
  normalizeLinkedInPostUrn,
} from '@/lib/linkedin/sync-post-metrics';
import { syncLinkedInUgcPosts } from '@/lib/linkedin/sync-ugc-posts';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
};

async function syncAccountOverview(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncRecentContent(account: AccountRow) {
  const { itemsProcessed, syncError } = await syncLinkedInUgcPosts({
    socialAccountId: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
  });
  if (syncError) {
    console.warn('[LinkedIn adapter] syncRecentContent:', syncError.slice(0, 200));
  }
  return { itemsProcessed, partial: Boolean(syncError) };
}

async function syncContentMetrics(account: AccountRow) {
  const rows = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id, platform: Platform.LINKEDIN },
    orderBy: { publishedAt: 'desc' },
    take: 40,
    select: { id: true, platformPostId: true },
  });
  if (rows.length === 0) return { itemsProcessed: 0 };

  const isOrg = isLinkedInOrganizationAccount(account.platformUserId);
  let itemsProcessed = 0;

  if (isOrg) {
    const chunkSize = 10;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const statsMap = await fetchOrganizationUgcPostStatsBatch(
        account.accessToken,
        account.platformUserId.trim(),
        chunk.map((r) => r.platformPostId)
      );
      for (const row of chunk) {
        const key = normalizeLinkedInPostUrn(row.platformPostId);
        const s = statsMap.get(key);
        if (!s) continue;
        const interactions = s.likes + s.comments + s.shares;
        await prisma.importedPost.update({
          where: { id: row.id },
          data: {
            impressions: s.impressions,
            likeCount: s.likes,
            commentsCount: s.comments,
            sharesCount: s.shares,
            repostsCount: s.shares,
            interactions,
            syncedAt: new Date(),
          },
        });
        itemsProcessed += 1;
      }
    }
  } else {
    const concurrency = 4;
    for (let i = 0; i < rows.length; i += concurrency) {
      const slice = rows.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (row) => {
          const s = await fetchMemberUgcPostLifetimeMetrics(account.accessToken, row.platformPostId);
          const interactions = s.likes + s.comments + s.shares;
          await prisma.importedPost.update({
            where: { id: row.id },
            data: {
              impressions: s.impressions,
              likeCount: s.likes,
              commentsCount: s.comments,
              sharesCount: s.shares,
              repostsCount: s.shares,
              interactions,
              syncedAt: new Date(),
            },
          });
          itemsProcessed += 1;
        })
      );
    }
  }

  return { itemsProcessed };
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncMessages(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const linkedinAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncMessages,
};
