import { NextRequest, NextResponse } from 'next/server';
import { executeCommentAutomation } from '@/lib/comment-automation';
import { executeProcessScheduled } from '@/lib/cron/process-scheduled-run';

export const maxDuration = 60;

/**
 * GET/POST /api/cron/fast-tick
 *
 * Single entry point for a **5-minute** external cron: runs scheduled post processing,
 * then comment automation (same logic as `/api/cron/process-scheduled` and
 * `/api/cron/comment-automation` without an extra HTTP round trip).
 *
 * Auth: `X-Cron-Secret`, `Authorization: Bearer <CRON_SECRET>`, or `?secret=`.
 *
 * If you use this route, **disable** separate cron jobs for `process-scheduled` and
 * `comment-automation` to avoid double-running automation. Do **not** set
 * `PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION` when using fast-tick.
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
    const scheduled = await executeProcessScheduled({ chainCommentAutomation: false });
    const commentAutomation = await executeCommentAutomation();
    console.log(
      '[Cron] fast-tick done',
      JSON.stringify({
        scheduledProcessed: scheduled.processed,
        commentAutomationOk: commentAutomation.ok,
      })
    );
    return NextResponse.json({ ok: true, scheduled, commentAutomation });
  } catch (e) {
    console.error('[Cron] fast-tick error:', e);
    return NextResponse.json(
      { message: 'Cron failed', error: (e as Error).message ?? String(e) },
      { status: 500 }
    );
  }
}
