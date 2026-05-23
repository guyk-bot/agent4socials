import { PostStatus } from '@prisma/client';
import { prisma, withPrismaPoolRetry } from '@/lib/db';
import {
  failStuckPostingTargets,
  finalizePostPublishState,
  reconcileMisreportedPublishTargets,
} from '@/lib/publish-post-workflow';

/** Targets POSTING longer than this are treated as abandoned (republish resets target updatedAt). */
export const STUCK_POSTING_TARGET_MS = 90_000;

const LINKEDIN_STUCK_MSG =
  'LinkedIn publish did not finish in time. Nothing was confirmed posted. Open in Composer and try Post now again. For video, try a shorter clip or wait and retry.';

const GENERIC_STUCK_MSG =
  'Publish did not finish in time. Open in Composer and try Post now again.';

async function finalizeOneStalePost(postId: string): Promise<void> {
  const postingTargets = await prisma.postTarget.findMany({
    where: { postId, status: PostStatus.POSTING },
    select: { platform: true },
  });
  if (postingTargets.length === 0) {
    await finalizePostPublishState(postId);
    return;
  }
  await reconcileMisreportedPublishTargets(postId);
  await finalizePostPublishState(postId);
  const hasLinkedIn = postingTargets.some((t) => t.platform === 'LINKEDIN');
  await failStuckPostingTargets(postId, hasLinkedIn ? LINKEDIN_STUCK_MSG : GENERIC_STUCK_MSG);
}

async function stalePostingPostIdsForUser(userId: string, maxPosts: number): Promise<string[]> {
  const targetCutoff = new Date(Date.now() - STUCK_POSTING_TARGET_MS);
  const rows = await prisma.postTarget.findMany({
    where: {
      status: PostStatus.POSTING,
      updatedAt: { lt: targetCutoff },
      post: { userId },
    },
    select: { postId: true },
    distinct: ['postId'],
    take: maxPosts,
  });
  return rows.map((r) => r.postId);
}

/** Cron: finalize posts with targets stuck in POSTING (by target updatedAt, not post row). */
export async function finalizeStalePostingPosts(maxPosts = 20): Promise<{
  scanned: number;
  finalized: string[];
}> {
  const targetCutoff = new Date(Date.now() - STUCK_POSTING_TARGET_MS);
  const rows = await withPrismaPoolRetry('finalize-stale-list', () =>
    prisma.postTarget.findMany({
      where: {
        status: PostStatus.POSTING,
        updatedAt: { lt: targetCutoff },
      },
      select: { postId: true },
      distinct: ['postId'],
      take: maxPosts,
    })
  );
  const finalized: string[] = [];
  for (const row of rows) {
    try {
      await finalizeOneStalePost(row.postId);
      finalized.push(row.postId);
    } catch (e) {
      console.error('[finalize-stale-posting]', row.postId, (e as Error)?.message ?? e);
    }
  }
  return { scanned: rows.length, finalized };
}

/** History load: reconcile stuck publishes for this user before returning the list. */
export async function finalizeStalePostingPostsForUser(
  userId: string,
  maxPosts = 15
): Promise<{ finalized: string[] }> {
  const ids = await withPrismaPoolRetry('finalize-stale-user-list', () =>
    stalePostingPostIdsForUser(userId, maxPosts)
  );
  const finalized: string[] = [];
  for (const postId of ids) {
    try {
      await finalizeOneStalePost(postId);
      finalized.push(postId);
    } catch (e) {
      console.error('[finalize-stale-posting user]', postId, (e as Error)?.message ?? e);
    }
  }
  return { finalized };
}
