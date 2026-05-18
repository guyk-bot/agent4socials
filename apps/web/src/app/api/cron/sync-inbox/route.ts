/**
 * GET/POST /api/cron/sync-inbox
 *
 * Pre-warms Instagram and Facebook DM threads into AppKv (4h TTL).
 * Returns 202 immediately; work runs in after() so cron-job.org test runs
 * do not time out (free tier often caps HTTP wait at 30s).
 *
 * Auth: X-Cron-Secret header, Bearer CRON_SECRET, or ?secret=CRON_SECRET
 * (opening the URL in a browser without a secret always returns 401).
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { runSyncInbox } from '@/lib/cron/sync-inbox-run';

export const maxDuration = 120;

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  return Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      {
        message:
          'Unauthorized. cron-job.org must send header X-Cron-Secret with your CRON_SECRET value. Opening this URL in a browser without ?secret= will always fail.',
      },
      { status: 401 }
    );
  }

  after(async () => {
    try {
      const summary = await runSyncInbox();
      console.log('[Cron] sync-inbox done:', JSON.stringify({ ok: true, ...summary }));
    } catch (e) {
      console.error('[Cron] sync-inbox error:', e);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      hint: 'Work runs in the background. A cron-job.org "timeout" on the test run is OK if you see HTTP 202 here; check Vercel logs for sync-inbox done.',
    },
    { status: 202 }
  );
}

export const GET = handle;
export const POST = handle;
