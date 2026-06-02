import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { loadInstagramDmInboxForUser } from '@/lib/inbox/instagram-dm-conversations';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/inbox/instagram-dms
 * Instagram DM thread list only (Inbox Messages tab). One server round-trip.
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fresh = searchParams.get('fresh') === '1' || searchParams.get('fresh') === 'true';
  const cacheOnly = searchParams.get('cacheOnly') === '1' || searchParams.get('cacheOnly') === 'true';

  const payload = await loadInstagramDmInboxForUser(userId, { fresh, cacheOnly });

  return NextResponse.json({
    conversations: payload.conversations,
    instagramAccountId: payload.instagramAccountId,
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.emptyHint ? { emptyHint: payload.emptyHint } : {}),
    ...(payload.fromCache ? { fromCache: true } : {}),
    ...(payload.stale ? { stale: true } : {}),
    ...(payload.debug ? { debug: payload.debug } : {}),
  });
}
