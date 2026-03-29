import { NextRequest, NextResponse } from 'next/server';
import { runDailyMetricSnapshotSync } from '@/lib/analytics/metric-snapshots';

/**
 * GET/POST /api/cron/metric-snapshots
 * Daily job for Instagram and Facebook only: fetch current follower/following/fans and upsert one snapshot per account per day.
 * Call with X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * YouTube is excluded from this logic.
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
    const { processed, errors } = await runDailyMetricSnapshotSync();
    return NextResponse.json({
      ok: true,
      processed,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[Cron] metric-snapshots error:', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
