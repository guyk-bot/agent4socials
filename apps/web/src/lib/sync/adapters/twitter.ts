/**
 * X (Twitter): scheduled post metrics via batched `GET /2/tweets?ids=` + DB upserts.
 */

import { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { fetchTweetsByIdsBatched, metricsFromTweetPayload } from '@/lib/x/twitter-tweets-batch';

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

async function syncRecentContent(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncContentMetrics(account: AccountRow) {
  const rows = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id, platform: Platform.TWITTER },
    select: { platformPostId: true },
    orderBy: { publishedAt: 'desc' },
    take: 400,
  });
  const ids = rows.map((r) => r.platformPostId).filter(Boolean);
  if (!ids.length) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { xAnalyticsLastSyncedAt: new Date() },
    });
    return { itemsProcessed: 0 };
  }

  const { byId } = await fetchTweetsByIdsBatched(account.id, account.accessToken, ids);
  let n = 0;
  for (const [tweetId, t] of byId) {
    const m = metricsFromTweetPayload(t);
    const interactions = m.like_count + m.reply_count + m.retweet_count + m.quote_count;
    const firstMediaKey = t.attachments?.media_keys?.[0];
    // Thumbnail not always in lookup includes without extra work; keep existing DB thumb.
    await prisma.importedPost.updateMany({
      where: { socialAccountId: account.id, platformPostId: tweetId },
      data: {
        impressions: m.impression_count,
        interactions,
        likeCount: m.like_count,
        commentsCount: m.reply_count,
        repostsCount: m.retweet_count,
        sharesCount: m.quote_count,
        syncedAt: new Date(),
      },
    });
    await prisma.postPerformance.upsert({
      where: {
        socialAccountId_platformPostId: { socialAccountId: account.id, platformPostId: tweetId },
      },
      create: {
        userId: account.userId,
        socialAccountId: account.id,
        platform: 'TWITTER',
        platformPostId: tweetId,
        impressions: m.impression_count,
        clicks: 0,
        comments: m.reply_count,
        shares: m.retweet_count + m.quote_count,
        metricsRaw: {
          likes: m.like_count,
          quotes: m.quote_count,
          bookmarks: m.bookmark_count,
          public_metrics: t.public_metrics ?? null,
          organic_metrics: t.organic_metrics ?? null,
        } as object,
      },
      update: {
        impressions: m.impression_count,
        comments: m.reply_count,
        shares: m.retweet_count + m.quote_count,
        metricsRaw: {
          likes: m.like_count,
          quotes: m.quote_count,
          bookmarks: m.bookmark_count,
          public_metrics: t.public_metrics ?? null,
          organic_metrics: t.organic_metrics ?? null,
        } as object,
      },
    });
    n++;
  }

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { xAnalyticsLastSyncedAt: new Date() },
  });
  return { itemsProcessed: n };
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncMessages(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const twitterAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncMessages,
};
