/**
 * GET/POST /api/cron/sync-platform-data
 *
 * Master cron route that runs all scheduled platform sync scopes.
 * Call this from Vercel Cron or an external scheduler every 15–30 minutes.
 *
 * Scopes run in this order (fastest/cheapest first):
 *   1. account_overview  — followers, basic metrics
 *   2. posts             — discover new/updated content
 *   3. post_metrics      — refresh impressions/likes on recent posts
 *
 * Work runs inline (no after()) to keep the lambda alive only as long as needed.
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

function checkAuthorization(request: NextRequest): {
  ok: boolean;
  reason: 'ok' | 'missing_env' | 'missing_provided' | 'mismatch';
} {
  const rawEnvSecret = process.env.CRON_SECRET;
  if (!rawEnvSecret) return { ok: false, reason: 'missing_env' };

  const cronSecret = rawEnvSecret.trim().replace(/^['"]|['"]$/g, '');
  const provided =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret') ||
    '';

  if (!provided.trim()) return { ok: false, reason: 'missing_provided' };
  if (provided.trim() !== cronSecret) return { ok: false, reason: 'mismatch' };
  return { ok: true, reason: 'ok' };
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const auth = checkAuthorization(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        message: 'Unauthorized',
        reason: auth.reason,
      },
      { status: 401 }
    );
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
