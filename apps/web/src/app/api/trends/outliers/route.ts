import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';

function serializeRow(r: {
  id: string;
  nicheName: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: bigint;
  subscriberCount: bigint;
  performanceRatio: number;
  videoType: string;
  publishedAt: Date;
  lastUpdated: Date;
}) {
  const publishedMs = r.publishedAt.getTime();
  const hoursLive = Math.max(1 / 60, (Date.now() - publishedMs) / (60 * 60 * 1000));
  const vph = Number(r.viewCount) / hoursLive;
  const mult = r.performanceRatio;
  return {
    id: r.id,
    nicheName: r.nicheName,
    videoId: r.videoId,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    viewCount: r.viewCount.toString(),
    subscriberCount: r.subscriberCount.toString(),
    performanceRatio: r.performanceRatio,
    outlierLabel: `${mult.toFixed(1)}×`,
    isHighOutlier: mult >= 5,
    vph: Math.round(vph),
    videoType: r.videoType,
    publishedAt: r.publishedAt.toISOString(),
    lastUpdated: r.lastUpdated.toISOString(),
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(r.videoId)}`,
  };
}

/**
 * GET /api/trends/outliers?videoType=short|long&minRatio=2&limit=5000
 * Returns all niches (no niche filter). Optional limit capped at 10000.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized. Sign in again.' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const videoType = searchParams.get('videoType');
    const minRatioRaw = searchParams.get('minRatio');
    const minRatio = minRatioRaw != null && minRatioRaw !== '' ? parseFloat(minRatioRaw) : 2;
    const limitRaw = searchParams.get('limit');
    const limitParsed = limitRaw != null && limitRaw !== '' ? parseInt(limitRaw, 10) : 2000;
    const take = Number.isFinite(limitParsed) ? Math.min(10_000, Math.max(1, limitParsed)) : 2000;

    const where: Prisma.NicheTrendWhereInput = {
      performanceRatio: { gt: Number.isFinite(minRatio) ? minRatio : 2 },
    };
    if (videoType === 'short' || videoType === 'long') {
      where.videoType = videoType;
    }

    const rows = await prisma.nicheTrend.findMany({
      where,
      orderBy: [{ performanceRatio: 'desc' }, { lastUpdated: 'desc' }],
      take,
    });

    return NextResponse.json({
      items: rows.map(serializeRow),
      count: rows.length,
      limit: take,
    });
  } catch (e) {
    console.error('[trends/outliers]', e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      return NextResponse.json(
        {
          message:
            'The niche_trends table is missing. Fastest: Supabase SQL Editor → run apps/web/scripts/ensure-niche-trends.sql. Or fix DATABASE_DIRECT_URL and redeploy so prisma migrate deploy runs. Then POST /api/cron/niche-trends with X-Cron-Secret.',
        },
        { status: 503 }
      );
    }
    const hint = (e as Error)?.message?.includes('niche_trends')
      ? ' Check that prisma migrate deploy ran on this environment.'
      : '';
    return NextResponse.json(
      { message: `Could not load trends.${hint}`.trim() },
      { status: 500 }
    );
  }
}
