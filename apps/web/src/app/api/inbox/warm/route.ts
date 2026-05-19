/**
 * POST /api/inbox/warm
 *
 * User-authenticated endpoint that pre-populates the server-side DB message
 * cache for all of the caller's Instagram and Facebook accounts.  Called by
 * the Inbox page on mount so that every conversation opens instantly from the
 * DB cache even after the 24-hour TTL has expired or on a fresh session.
 *
 * Work runs inside next/server `after()` so the response is returned in < 1s
 * and the heavy API lifting happens in the background.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { runSyncInboxForUser } from '@/lib/cron/sync-inbox-run';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  after(() => {
    void runSyncInboxForUser(userId).catch((err) => {
      console.error('[inbox/warm]', err);
    });
  });

  return NextResponse.json({ ok: true, message: 'Warming inbox cache in background.' });
}
