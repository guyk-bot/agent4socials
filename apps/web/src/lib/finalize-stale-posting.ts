import { PostStatus } from '@prisma/client';
import { prisma, withPrismaPoolRetry } from '@/lib/db';
import { finalizePostPublishState } from '@/lib/publish-post-workflow';

/** Posts stuck in POSTING longer than this are finalized from cron or manual sync. */
const STALE_POSTING_MS = 8 * 60 * 1000;

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
      await finalizePostPublishState(row.id);
      finalized.push(row.id);
    } catch (e) {
      console.error('[finalize-stale-posting]', row.id, (e as Error)?.message ?? e);
    }
  }
  return { scanned: stale.length, finalized };
}
