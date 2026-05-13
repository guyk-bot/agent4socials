import { NextRequest, NextResponse, after } from 'next/server';
import { runDmFirstWelcomeCronSweep } from '@/lib/dm-first-welcome-sweep';

export const maxDuration = 120;

/**
 * GET/POST /api/cron/dm-first-welcome
 * External cron (e.g. cron-job.org) every 1 to 2 minutes with header X-Cron-Secret: CRON_SECRET.
 * Loads recently active Instagram, Facebook, and X DM threads and runs first-incoming auto-DM
 * when the latest inbound message is within the configured freshness window.
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

  after(() => {
    void runDmFirstWelcomeCronSweep()
      .then((summary) => {
        console.log('[Cron] dm-first-welcome sweep done:', JSON.stringify(summary));
      })
      .catch((e) => {
        console.error('[Cron] dm-first-welcome sweep error:', e);
      });
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
