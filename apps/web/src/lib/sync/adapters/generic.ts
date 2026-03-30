/**
 * Generic no-op adapter for platforms without a dedicated sync implementation yet
 * (Twitter/X, LinkedIn, Pinterest).
 * Records that a sync was attempted without crashing the engine.
 */

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

async function syncContentMetrics(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncComments(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

async function syncMessages(_account: AccountRow) {
  return { itemsProcessed: 0 };
}

export const genericAdapter = {
  syncAccountOverview,
  syncRecentContent,
  syncContentMetrics,
  syncComments,
  syncMessages,
};
