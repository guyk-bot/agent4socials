/**
 * Schedule server-side inbox message cache warm for a user (Instagram + Facebook DMs).
 * Used after connect, on login prefetch, and from POST /api/inbox/warm.
 */
import { after } from 'next/server';
import { runSyncInboxForUser } from '@/lib/cron/sync-inbox-run';

export function scheduleInboxWarmForUser(userId: string): void {
  if (!userId) return;
  after(() => {
    void runSyncInboxForUser(userId).catch((err) => {
      console.error('[inbox-warm]', err);
    });
  });
}
