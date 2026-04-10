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
 * Comments and messages are excluded here because they sync via their own
 * per-request polling from the inbox page (more frequent, user-context aware).
 *
 * Returns 202 immediately; work runs in `after()` so cron-job.org (30s HTTP limit) does not time out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { runScheduledSyncForScope } from '@/lib/sync/engine';

export const maxDuration = 300;

function checkAuthorization(request: NextRequest): {
  ok: boolean;
  reason: 'ok' | 'missing_env' | 'missing_provided' | 'mismatch';
} {
  const rawEnvSecret = process.env.CRON_SECRET;
  if (!rawEnvSecret) return { ok: false, reason: 'missing_env' };

  // Normalize to avoid production mismatches caused by accidental quotes/spaces in env vars.
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

async function executeSyncAllScopes() {
  const scopes = ['account_overview', 'posts', 'post_metrics'] as const;
  const results: Record<string, { processed: number; errors: string[] }> = {};

  for (const scope of scopes) {
    try {
      results[scope] = await runScheduledSyncForScope(scope);
    } catch (e) {
      results[scope] = { processed: 0, errors: [(e as Error).message] };
    }
  }

  console.log('[Cron] sync-platform-data done:', JSON.stringify({ ok: true, results }));
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

  after(async () => {
    try {
      await executeSyncAllScopes();
    } catch (e) {
      console.error('[Cron] sync-platform-data (after) error:', e);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        'Sync started in the background. External cron services often use a 30s HTTP timeout; this route returns immediately. Check Vercel logs for per-scope results.',
    },
    { status: 202 }
  );
}

export const GET = handle;
export const POST = handle;
