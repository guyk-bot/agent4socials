/**
 * GET/POST /api/cron/sync-platform-data
 *
 * Scheduled ingest: account_overview, posts, post_metrics.
 * Returns 202 immediately; work runs in after() so cron-job.org does not time out.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { runScheduledSyncForScope } from '@/lib/sync/engine';

export const maxDuration = 120;

function cronSyncTotalBudgetMs(): number {
  const raw = process.env.CRON_SYNC_HTTP_BUDGET_MS;
  if (raw == null || raw === '') return 26_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 26_000;
  return Math.min(120_000, Math.max(5_000, n));
}

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  return Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);
}

async function runSyncPlatformData(): Promise<Record<string, { processed: number; errors: string[] }>> {
  const scopes = ['account_overview', 'posts', 'post_metrics'] as const;
  const results: Record<string, { processed: number; errors: string[] }> = {};
  const globalDeadline = Date.now() + cronSyncTotalBudgetMs();

  for (const scope of scopes) {
    const remaining = globalDeadline - Date.now();
    if (remaining < 1_500) {
      results[scope] = {
        processed: 0,
        errors: ['skipped: shared_cron_http_budget_exhausted'],
      };
      continue;
    }
    try {
      results[scope] = await runScheduledSyncForScope(scope, { budgetMs: remaining });
    } catch (e) {
      results[scope] = { processed: 0, errors: [(e as Error).message] };
    }
  }
  return results;
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
      const results = await runSyncPlatformData();
      console.log('[Cron] sync-platform-data done:', JSON.stringify({ ok: true, results }));
    } catch (e) {
      console.error('[Cron] sync-platform-data error:', e);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      hint: 'Work runs in the background. A cron-job.org "timeout" on the test run is OK if you see HTTP 202 here; check Vercel logs for sync-platform-data done.',
    },
    { status: 202 }
  );
}

export const GET = handle;
export const POST = handle;
