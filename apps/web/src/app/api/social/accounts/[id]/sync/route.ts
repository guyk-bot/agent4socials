/**
 * POST /api/social/accounts/[id]/sync
 *
 * Triggers a sync job for the specified account.
 * Body (optional JSON):
 *   { scope?: SyncScope | "full", syncType?: SyncType, force?: boolean }
 *
 * Runs asynchronously — returns immediately with job status.
 * Duplicate jobs within the same time-bucket return status "skipped_duplicate".
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { syncAccount } from '@/lib/sync/engine';
import type { SyncScope, SyncType } from '@/lib/sync/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }

  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, status: true },
  });

  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.status === 'disconnected') {
    return NextResponse.json({ status: 'needs_reconnect', message: 'Account is disconnected' });
  }

  let body: { scope?: string; syncType?: string; force?: boolean } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch { /* ignore bad JSON */ }

  const scope = (body.scope as SyncScope | 'full') ?? 'full';
  const syncType = (body.syncType as SyncType) ?? 'page_refresh';
  const force = body.force === true;

  // Run the sync job in the background — don't block the HTTP response
  const syncPromise = syncAccount({
    userId,
    socialAccountId: id,
    platform: account.platform,
    scope,
    syncType,
    triggeredBy: 'user',
    force,
  });

  // Give it a brief window to complete if fast; otherwise return immediately
  const result = await Promise.race([
    syncPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
  ]);

  if (result === null) {
    // Still running in background
    return NextResponse.json({ status: 'syncing', message: 'Sync started in background' });
  }

  return NextResponse.json(result);
}
