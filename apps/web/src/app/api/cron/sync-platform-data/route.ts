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
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScheduledSyncForScope } from '@/lib/sync/engine';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const provided =
    request.headers.get('X-Cron-Secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.nextUrl.searchParams.get('secret');
  return provided === cronSecret;
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const scopes = ['account_overview', 'posts', 'post_metrics'] as const;
  const results: Record<string, { processed: number; errors: string[] }> = {};

  for (const scope of scopes) {
    try {
      results[scope] = await runScheduledSyncForScope(scope);
    } catch (e) {
      results[scope] = { processed: 0, errors: [(e as Error).message] };
    }
  }

  return NextResponse.json({ ok: true, results });
}

export const GET  = handle;
export const POST = handle;
