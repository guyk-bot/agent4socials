import { after, NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  enrichInstagramDmSendersInBackground,
  loadInstagramDmInboxForUser,
} from '@/lib/inbox/instagram-dm-conversations';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/inbox/instagram-dms
 * Fast thread list; sender names/avatars enrich in after() so the client does not time out.
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
  const deferHeavyEnrichment = fresh && !cacheOnly;

  const payload = await loadInstagramDmInboxForUser(userId, {
    fresh,
    cacheOnly,
    deferHeavyEnrichment,
  });

  if (deferHeavyEnrichment && (payload.conversations?.length ?? 0) > 0) {
    after(() => {
      enrichInstagramDmSendersInBackground(userId).catch((e) => {
        console.warn('[InstagramDM] background sender enrich failed:', (e as Error)?.message ?? e);
      });
    });
  }

  return NextResponse.json({
    conversations: payload.conversations,
    instagramAccountId: payload.instagramAccountId,
    ...(payload.error && (payload.conversations?.length ?? 0) === 0 ? { error: payload.error } : {}),
    ...(payload.emptyHint ? { emptyHint: payload.emptyHint } : {}),
    ...(payload.fromCache ? { fromCache: true } : {}),
    ...(payload.stale ? { stale: true } : {}),
    ...(payload.debug ? { debug: payload.debug } : {}),
  });
}
