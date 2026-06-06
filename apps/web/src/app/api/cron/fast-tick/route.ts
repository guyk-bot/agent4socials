import { NextRequest, NextResponse } from 'next/server';
import { executeProcessScheduled } from '@/lib/cron/process-scheduled-run';
import { finalizeStalePostingPosts } from '@/lib/finalize-stale-posting';

export const maxDuration = 60;

/**
 * GET/POST /api/cron/fast-tick
 *
 * Single entry point for a **5-minute** external cron: scheduled post processing
 * and stale publish finalization.
 *
 * Auth: `X-Cron-Secret`, `Authorization: Bearer <CRON_SECRET>`, or `?secret=`.
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scheduled = await executeProcessScheduled();
    const stalePosting = await finalizeStalePostingPosts(15);
    console.log(
      '[Cron] fast-tick done',
      JSON.stringify({
        scheduledProcessed: scheduled.processed,
        stalePostingFinalized: stalePosting.finalized.length,
      })
    );
    return NextResponse.json({ ok: true, scheduled, stalePosting });
  } catch (e) {
    console.error('[Cron] fast-tick error:', e);
    return NextResponse.json(
      { message: 'Cron failed', error: (e as Error).message ?? String(e) },
      { status: 500 }
    );
  }
}
