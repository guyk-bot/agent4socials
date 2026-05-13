/**
 * GET/POST /api/cron/sync-platform-data
 *
 * Scheduled ingest for the **posts and analytics** pipeline only:
 *   `account_overview` → followers or basic counts
 *   `posts` → discover or update imported content
 *   `post_metrics` → refresh impressions or similar on recent posts
 *
 * Inbox **comments** and **DMs** are not written here. They load from platform APIs when users
 * open Inbox (see dashboard inbox and `/api/social/accounts/[id]/comments` and `.../conversations`).
 *
 * Call from an external scheduler (for example cron-job.org). Recommended cadence for Meta
 * app usage: **every 30 minutes**, not every 5 minutes. Pair with separate 5-minute crons for
 * `/api/cron/process-scheduled` and `/api/cron/comment-automation` (see `docs/CRON_SCHEDULES.md`).
 *
 * Work runs inline so the HTTP response includes `results` when the handler finishes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScheduledSyncForScope } from '@/lib/sync/engine';

export const maxDuration = 60;

/**
 * cron-job.org free tier caps HTTP wait at 30s — the whole handler (3 scopes) must
 * finish before that.  Set CRON_SYNC_HTTP_BUDGET_MS to tune (default 26_000).
 */
function cronSyncTotalBudgetMs(): number {
  const raw = process.env.CRON_SYNC_HTTP_BUDGET_MS;
  if (raw == null || raw === '') return 26_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 26_000;
  return Math.min(120_000, Math.max(5_000, n));
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
    console.warn('[Cron] sync-platform-data unauthorized — CRON_SECRET env:', !!process.env.CRON_SECRET, 'header provided:', !!cronSecret);
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

  console.log('[Cron] sync-platform-data done:', JSON.stringify({ ok: true, results }));

  return NextResponse.json({ ok: true, results });
}

export const GET = handle;
export const POST = handle;
