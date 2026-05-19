/**
 * POST /api/inbox/warm
 *
 * User-authenticated endpoint that pre-populates the server-side DB message
 * cache for all of the caller's Instagram and Facebook accounts.  Called by
 * login, after connecting Instagram/Facebook, and from the Inbox page.
 *
 * Work runs in the background via `after()` so the response returns immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { scheduleInboxWarmForUser } from '@/lib/inbox/schedule-inbox-warm';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  scheduleInboxWarmForUser(userId);

  return NextResponse.json({ ok: true, message: 'Warming inbox cache in background.' });
}
