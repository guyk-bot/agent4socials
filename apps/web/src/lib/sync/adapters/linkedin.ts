/**
 * LinkedIn: pull UGC posts into ImportedPost so analytics and history stay up to date.
 * (OAuth overview metrics are not duplicated here; insights route fetches profile/network live.)
 */

import { refreshLinkedInImportedPostMetrics } from '@/lib/linkedin/sync-post-metrics';
import { syncLinkedInUgcPosts } from '@/lib/linkedin/sync-ugc-posts';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
  credentialsJson?: unknown;
};

async function syncAccountOverview(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncRecentContent(account: AccountRow) {
  const { itemsProcessed, syncError } = await syncLinkedInUgcPosts({
    socialAccountId: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
    credentialsJson: account.credentialsJson,
  });
  if (syncError) {
    console.warn('[LinkedIn adapter] syncRecentContent:', syncError.slice(0, 200));
  }
  return { itemsProcessed, partial: Boolean(syncError) };
}

async function syncContentMetrics(account: AccountRow) {
  const { updated } = await refreshLinkedInImportedPostMetrics({
    id: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
  });
  return { itemsProcessed: updated };
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
