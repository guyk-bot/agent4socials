import { NextRequest, NextResponse } from 'next/server';
import { executeProcessScheduled } from '@/lib/cron/process-scheduled-run';

/** Enough for publish + email paths; comment-automation is no longer chained by default. */
export const maxDuration = 60;

/**
 * GET/POST /api/cron/process-scheduled
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * Finds posts due now: scheduleDelivery=email_links -> send email with open link; scheduleDelivery=auto -> publish.
 * Optional: set PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION=1 to also call /api/cron/comment-automation (slow; prefer /api/cron/fast-tick or a second cron).
 * Work runs inline — no after() — to release the lambda as soon as processing finishes.
 */
async function handle(request: NextRequest) {
  try {
    return await processScheduledInline(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] process-scheduled error:', err);
    return NextResponse.json(
      { message: 'Cron failed', error: message, processed: 0, results: [] },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;

function authorizeCron(request: NextRequest): NextResponse | null {
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function processScheduledInline(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const denied = authorizeCron(request);
  if (denied) return denied;

  const chainComment =
    process.env.PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION === '1' ||
    process.env.PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION === 'true';

  const result = await executeProcessScheduled({ chainCommentAutomation: chainComment });
  return NextResponse.json({ ok: true, ...result });
}
