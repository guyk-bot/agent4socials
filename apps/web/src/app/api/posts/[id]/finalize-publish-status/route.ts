import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { isPrismaPoolError, prisma, withPrismaPoolRetry } from '@/lib/db';
import {
  failStuckPostingTargets,
  finalizePostPublishState,
  reconcileMisreportedPublishTargets,
} from '@/lib/publish-post-workflow';
import {
  buildPostScalarsSelect,
  prismaPostReadWithMediaTypeFallback,
} from '@/lib/prisma-post-media-type-fallback';

/**
 * POST /api/posts/[id]/finalize-publish-status
 * Derives final post status from per-platform targets when publish was interrupted (pool timeout, Vercel kill).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const owned = await withPrismaPoolRetry('finalize-publish-owns', () =>
      prisma.post.findFirst({
        where: { id, userId },
        select: { id: true, status: true, updatedAt: true },
      })
    );
    if (!owned) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }
    const reconciled = await reconcileMisreportedPublishTargets(id);
    await finalizePostPublishState(id);
    const stuckMs = 5 * 60 * 1000;
    const postingAgeMs =
      owned.status === 'POSTING' ? Date.now() - owned.updatedAt.getTime() : 0;
    const failedStuck =
      postingAgeMs > stuckMs
        ? await failStuckPostingTargets(
            id,
            'Publish did not finish in time. If your video is on TikTok, refresh History. Otherwise open in Composer and try Post now again.'
          )
        : 0;
    const post = await withPrismaPoolRetry('finalize-publish-read', () =>
      prismaPostReadWithMediaTypeFallback((opts) =>
        prisma.post.findFirst({
          where: { id, userId },
          select: {
            ...buildPostScalarsSelect(opts),
            targets: {
              include: { socialAccount: { select: { username: true, platform: true } } },
            },
          },
        })
      )
    );
    return NextResponse.json({ ok: true, post, reconciled, failedStuck });
  } catch (e) {
    if (isPrismaPoolError(e)) {
      return NextResponse.json(
        { message: 'Database is busy. Wait a few seconds and try again.' },
        { status: 503 }
      );
    }
    console.error('[finalize-publish-status]', id, e);
    return NextResponse.json({ message: 'Failed to sync publish status' }, { status: 500 });
  }
}
