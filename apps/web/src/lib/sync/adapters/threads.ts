import { syncThreadsPosts } from '@/lib/threads/sync-imported-posts';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
  expiresAt?: Date | null;
};

async function syncAccountOverview(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncRecentContent(account: AccountRow) {
  const { itemsProcessed, syncError } = await syncThreadsPosts({
    id: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
    expiresAt: account.expiresAt ?? null,
  });
  if (syncError) {
    console.warn('[Threads adapter] syncRecentContent:', syncError.slice(0, 200));
  }
  return { itemsProcessed, partial: Boolean(syncError) };
}

async function syncContentMetrics(account: AccountRow) {
  const { itemsProcessed, syncError } = await syncThreadsPosts({
    id: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
    expiresAt: account.expiresAt ?? null,
  });
  if (syncError) {
    console.warn('[Threads adapter] syncContentMetrics:', syncError.slice(0, 200));
  }
  return { itemsProcessed, partial: Boolean(syncError) };
}

export const threadsAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments: async () => ({ itemsProcessed: 0 }),
  syncMessages: async () => ({ itemsProcessed: 0 }),
};
