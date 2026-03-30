/**
 * GET /api/social/accounts/[id]/sync-status
 *
 * Returns the current sync state for the specified account.
 * Used by the frontend SyncStatusBanner to poll for updates.
 *
 * Response shape:
 * {
 *   status: "idle" | "syncing" | "success" | "partial" | "error" | "needs_reconnect",
 *   lastSuccessfulSyncAt: ISO string | null,
 *   lastSyncAttemptAt: ISO string | null,
 *   lastSyncError: string | null,
 *   staleSinceMs: number | null,   // how long ago the last successful sync was
 *   isStale: boolean,              // true if data is beyond the full stale threshold
 *   activeJob: { id, scope, syncType, startedAt } | null,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { getAccountSyncStatus } from '@/lib/sync/engine';
import { getStaleThresholdMs } from '@/lib/sync/config';

export async function GET(
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
    return NextResponse.json({
      status: 'needs_reconnect',
      lastSuccessfulSyncAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: 'Account is disconnected',
      staleSinceMs: null,
      isStale: true,
      activeJob: null,
    });
  }

  const syncStatus = await getAccountSyncStatus(id);
  const staleThresholdMs = getStaleThresholdMs(account.platform, 'full');
  const isStale = syncStatus.staleSinceMs === null || syncStatus.staleSinceMs > staleThresholdMs;

  return NextResponse.json({
    ...syncStatus,
    isStale,
    lastSuccessfulSyncAt: syncStatus.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncAttemptAt: syncStatus.lastSyncAttemptAt?.toISOString() ?? null,
    activeJob: syncStatus.activeJob
      ? {
          ...syncStatus.activeJob,
          startedAt: syncStatus.activeJob.startedAt?.toISOString() ?? null,
        }
      : null,
  });
}
