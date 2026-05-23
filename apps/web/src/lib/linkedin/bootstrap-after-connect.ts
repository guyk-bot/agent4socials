/**
 * Run immediately after LinkedIn OAuth so dashboard and Console have posts + metrics
 * before the client loads (same pattern as TikTok video.list on connect).
 */

import { syncLinkedInUgcPosts } from '@/lib/linkedin/sync-ugc-posts';
import { refreshLinkedInImportedPostMetrics } from '@/lib/linkedin/sync-post-metrics';

export async function bootstrapLinkedInAfterConnect(account: {
  id: string;
  platformUserId: string;
  accessToken: string;
  credentialsJson?: unknown;
}): Promise<void> {
  const { syncError } = await syncLinkedInUgcPosts({
    socialAccountId: account.id,
    platformUserId: account.platformUserId,
    accessToken: account.accessToken,
    credentialsJson: account.credentialsJson,
  });
  if (syncError) {
    console.warn('[LinkedIn OAuth] post sync:', syncError.slice(0, 200));
  }
  try {
    await refreshLinkedInImportedPostMetrics({
      id: account.id,
      platformUserId: account.platformUserId,
      accessToken: account.accessToken,
    });
  } catch (e) {
    console.warn('[LinkedIn OAuth] metrics refresh:', (e as Error)?.message ?? e);
  }
}
