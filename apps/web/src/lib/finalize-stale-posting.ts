import { PostStatus } from '@prisma/client';
import { prisma, withPrismaPoolRetry } from '@/lib/db';
import {
  failStuckPostingTargets,
  finalizePostPublishState,
  reconcileMisreportedPublishTargets,
} from '@/lib/publish-post-workflow';

/** Posts stuck in POSTING longer than this are reconciled or failed from cron or History sync. */
const STALE_POSTING_MS = 5 * 60 * 1000;

export async function finalizeStalePostingPosts(maxPosts = 20): Promise<{
  scanned: number;
  finalized: string[];
}> {
  const cutoff = new Date(Date.now() - STALE_POSTING_MS);
  const stale = await withPrismaPoolRetry('finalize-stale-list', () =>
    prisma.post.findMany({
      where: { status: PostStatus.POSTING, updatedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: maxPosts,
    })
  );
  const finalized: string[] = [];
  for (const row of stale) {
    try {
      await reconcileMisreportedPublishTargets(row.id);
      await finalizePostPublishState(row.id);
      const failed = await failStuckPostingTargets(row.id);
      if (failed > 0) {
        console.log('[finalize-stale-posting] marked stuck targets failed', { postId: row.id, failed });
      }
      finalized.push(row.id);
    } catch (e) {
      console.error('[finalize-stale-posting]', row.id, (e as Error)?.message ?? e);
    }
  }
  return { scanned: stale.length, finalized };
}
