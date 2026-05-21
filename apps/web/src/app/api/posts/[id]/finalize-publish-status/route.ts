import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { isPrismaPoolError, prisma, withPrismaPoolRetry } from '@/lib/db';
import { finalizePostPublishState, reconcileMisreportedPublishTargets } from '@/lib/publish-post-workflow';
import {
  postScalarsSelectWithMediaType,
  postScalarsSelectWithoutMediaType,
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
        select: { id: true, status: true },
      })
    );
    if (!owned) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }
    const reconciled = await reconcileMisreportedPublishTargets(id);
    await finalizePostPublishState(id);
    const post = await withPrismaPoolRetry('finalize-publish-read', () =>
      prismaPostReadWithMediaTypeFallback((withMediaTypeCol) =>
        prisma.post.findFirst({
          where: { id, userId },
          select: {
            ...(withMediaTypeCol ? postScalarsSelectWithMediaType() : postScalarsSelectWithoutMediaType()),
            targets: {
              include: { socialAccount: { select: { username: true, platform: true } } },
            },
          },
        })
      )
    );
    return NextResponse.json({ ok: true, post, reconciled });
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
