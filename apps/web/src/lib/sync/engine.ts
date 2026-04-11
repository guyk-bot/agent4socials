/**
 * Sync engine — creates, deduplicates, and executes sync jobs.
 *
 * Design principles:
 * - Every sync operation is recorded as a SyncJob row for observability.
 * - Idempotency key prevents duplicate jobs in the same time-bucket.
 * - Failed jobs update the account's lastSyncStatus; successful ones update lastSuccessfulSyncAt.
 * - Adapters are called per-platform; unsupported scopes are skipped gracefully.
 */

import { prisma } from '@/lib/db';
import { buildIdempotencyKey, getStaleThresholdMs, MIN_MANUAL_SYNC_INTERVAL_MS, PLATFORM_SCOPES, type SyncScope, type SyncType } from './config';
import { getAdapterForPlatform, type Adapter } from './adapters';

export interface SyncAccountOptions {
  userId: string;
  socialAccountId: string;
  platform: string;
  scope: SyncScope | 'full';
  syncType: SyncType;
  triggeredBy?: string;
  /** If true, skip deduplication check and force a new job. */
  force?: boolean;
}

export interface SyncResult {
  jobId: string;
  status: 'queued' | 'skipped_duplicate' | 'success' | 'partial_success' | 'failed';
  message?: string;
  itemsProcessed?: number;
}

/** Ensure sync infrastructure tables exist (idempotent — safe to call multiple times). */
let _syncTablesEnsured = false;
export async function ensureSyncTables(): Promise<void> {
  if (_syncTablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sync_jobs" (
        "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
        "userId"           TEXT         NOT NULL,
        "socialAccountId"  TEXT         NOT NULL,
        "platform"         TEXT         NOT NULL,
        "scope"            TEXT         NOT NULL,
        "syncType"         TEXT         NOT NULL DEFAULT 'scheduled',
        "status"           TEXT         NOT NULL DEFAULT 'queued',
        "idempotencyKey"   TEXT         NOT NULL,
        "startedAt"        TIMESTAMP(3),
        "finishedAt"       TIMESTAMP(3),
        "errorDetails"     TEXT,
        "itemsProcessed"   INTEGER,
        "cursorState"      JSONB,
        "triggeredBy"      TEXT,
        "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sync_jobs_idempotencyKey_key" ON "sync_jobs"("idempotencyKey")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sync_jobs_socialAccountId_scope_status_idx" ON "sync_jobs"("socialAccountId","scope","status")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sync_jobs_socialAccountId_createdAt_idx" ON "sync_jobs"("socialAccountId","createdAt")`
    );
    // Add sync columns to SocialAccount if the migration hasn't run yet
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3)`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt" TIMESTAMP(3)`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "initialBackfillDone" BOOLEAN NOT NULL DEFAULT false`
    );
    _syncTablesEnsured = true;
  } catch (e) {
    console.warn('[SyncEngine] ensureSyncTables failed (non-fatal):', (e as Error)?.message?.slice(0, 200));
  }
}

/**
 * Enqueue and immediately execute a sync job for an account.
 *
 * Returns 'skipped_duplicate' when an equivalent job was created in the same time-bucket
 * (idempotency key collision) or when the data is fresh enough and syncType is not 'manual'/'initial_backfill'.
 */
export async function syncAccount(opts: SyncAccountOptions): Promise<SyncResult> {
  await ensureSyncTables();

  const { userId, socialAccountId, platform, scope, syncType, triggeredBy, force } = opts;

  const scopes: SyncScope[] =
    scope === 'full'
      ? (PLATFORM_SCOPES[platform] ?? ['account_overview', 'posts'])
      : [scope];

  // For 'full', run all scopes and aggregate results
  if (scope === 'full' && scopes.length > 1) {
    let totalItems = 0;
    let anyFailed = false;
    let anySuccess = false;
    for (const s of scopes) {
      const result = await syncAccount({ ...opts, scope: s });
      if (result.status === 'success' || result.status === 'partial_success') anySuccess = true;
      if (result.status === 'failed') anyFailed = true;
      totalItems += result.itemsProcessed ?? 0;
    }
    return {
      jobId: 'full',
      status: anyFailed && !anySuccess ? 'failed' : anyFailed ? 'partial_success' : 'success',
      itemsProcessed: totalItems,
    };
  }

  const singleScope = scopes[0];

  // Check for existing job in this time-bucket (deduplication)
  const idempotencyKey = buildIdempotencyKey(userId, socialAccountId, singleScope, syncType);

  if (!force) {
    const existing = await (prisma as unknown as {
      syncJob?: { findUnique: (args: unknown) => Promise<{ id: string; status: string } | null> }
    }).syncJob?.findUnique?.({ where: { idempotencyKey } });

    if (existing) {
      return { jobId: existing.id, status: 'skipped_duplicate', message: 'Job already exists for this time bucket' };
    }

    // For page_refresh/scheduled: check if data is already fresh enough
    if (syncType === 'page_refresh' || syncType === 'scheduled') {
      const account = await prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { lastSuccessfulSyncAt: true },
      });
      if (account?.lastSuccessfulSyncAt) {
        const ageMs = Date.now() - account.lastSuccessfulSyncAt.getTime();
        const threshold = getStaleThresholdMs(platform, singleScope);
        if (ageMs < threshold) {
          return { jobId: '', status: 'skipped_duplicate', message: 'Data is still fresh' };
        }
      }
    }

    // For manual: enforce minimum interval to prevent refresh storms
    if (syncType === 'manual') {
      const account = await prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { lastSyncAttemptAt: true },
      });
      if (account?.lastSyncAttemptAt) {
        const ageMs = Date.now() - account.lastSyncAttemptAt.getTime();
        if (ageMs < MIN_MANUAL_SYNC_INTERVAL_MS) {
          return { jobId: '', status: 'skipped_duplicate', message: 'Manual refresh is rate-limited; try again shortly' };
        }
      }
    }
  }

  // Create the job record
  let jobId: string;
  try {
    const job = await (prisma as unknown as {
      syncJob?: {
        create: (args: unknown) => Promise<{ id: string }>;
        update: (args: unknown) => Promise<{ id: string }>;
      }
    }).syncJob?.create({
      data: {
        userId,
        socialAccountId,
        platform,
        scope: singleScope,
        syncType,
        status: 'running',
        idempotencyKey,
        startedAt: new Date(),
        triggeredBy: triggeredBy ?? syncType,
      },
    });
    jobId = job?.id ?? idempotencyKey;
  } catch (e) {
    // Unique constraint violation means a concurrent job was created — treat as duplicate
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('Unique constraint') || msg.includes('unique')) {
      return { jobId: '', status: 'skipped_duplicate', message: 'Concurrent job created' };
    }
    // syncJob table may not exist yet (race with migration) — fall through to best-effort sync
    jobId = `fallback-${Date.now()}`;
  }

  // Mark account as syncing
  await prisma.socialAccount.updateMany({
    where: { id: socialAccountId },
    data: { lastSyncAttemptAt: new Date(), lastSyncStatus: 'syncing', lastSyncError: null },
  });

  // Execute the sync via the platform adapter
  let itemsProcessed = 0;
  let finalStatus: JobStatus = 'success';
  let errorDetails: string | null = null;

  try {
    const adapter = getAdapterForPlatform(platform);
    if (!adapter) {
      errorDetails = `No adapter available for platform: ${platform}`;
      finalStatus = 'failed';
    } else {
      const account = await prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: {
          id: true, userId: true, platform: true, platformUserId: true,
          accessToken: true, refreshToken: true, expiresAt: true, credentialsJson: true, status: true,
        },
      });
      if (!account || account.status === 'disconnected') {
        errorDetails = 'Account disconnected';
        finalStatus = 'failed';
        await prisma.socialAccount.updateMany({
          where: { id: socialAccountId },
          data: { lastSyncStatus: 'needs_reconnect' },
        });
        return await finalizeJob(jobId, finalStatus, errorDetails, 0);
      }

      const result = await runAdapterScope(adapter, account, singleScope);
      itemsProcessed = result.itemsProcessed;
      if (result.partial) finalStatus = 'partial_success';
    }
  } catch (e) {
    errorDetails = (e as Error)?.message?.slice(0, 500) ?? 'Unknown error';
    finalStatus = 'failed';
    console.error(`[SyncEngine] ${platform} ${singleScope} sync failed for ${socialAccountId}:`, errorDetails);
  }

  return await finalizeJob(jobId, finalStatus, errorDetails, itemsProcessed, socialAccountId);
}

type JobStatus = 'success' | 'partial_success' | 'failed';

async function finalizeJob(
  jobId: string,
  status: JobStatus,
  errorDetails: string | null,
  itemsProcessed: number,
  socialAccountId?: string
): Promise<SyncResult> {
  const now = new Date();
  // Update job record
  try {
    await (prisma as unknown as {
      syncJob?: { update: (args: unknown) => Promise<unknown> }
    }).syncJob?.update({
      where: { id: jobId },
      data: { status, finishedAt: now, errorDetails, itemsProcessed, updatedAt: now },
    });
  } catch { /* ignore if table/row missing */ }

  // Update account sync status
  if (socialAccountId) {
    const accountStatus = status === 'failed' ? 'error' : status === 'partial_success' ? 'partial' : 'success';
    await prisma.socialAccount.updateMany({
      where: { id: socialAccountId },
      data: {
        lastSyncStatus: accountStatus,
        lastSyncError: errorDetails,
        ...(status !== 'failed' && { lastSuccessfulSyncAt: now }),
      },
    });
  }

  return {
    jobId,
    status,
    message: errorDetails ?? undefined,
    itemsProcessed,
  };
}

interface AccountRow {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  credentialsJson?: unknown;
  status: string;
}

async function runAdapterScope(
  adapter: Adapter,
  account: AccountRow,
  scope: SyncScope
): Promise<{ itemsProcessed: number; partial?: boolean }> {
  switch (scope) {
    case 'account_overview':
      return (await adapter.syncAccountOverview?.(account)) ?? { itemsProcessed: 0 };
    case 'posts':
      return (await adapter.syncRecentContent?.(account)) ?? { itemsProcessed: 0 };
    case 'post_metrics':
      return (await adapter.syncContentMetrics?.(account)) ?? { itemsProcessed: 0 };
    case 'comments':
      return (await adapter.syncComments?.(account)) ?? { itemsProcessed: 0 };
    case 'messages':
      return (await adapter.syncMessages?.(account)) ?? { itemsProcessed: 0 };
    case 'demographics':
      return (await adapter.syncAudienceDemographics?.(account)) ?? { itemsProcessed: 0 };
    default:
      return { itemsProcessed: 0 };
  }
}

/**
 * Run sync for all connected accounts that have stale data for a given scope.
 * Used by cron routes.
 *
 * - Skips accounts with repeated auth failures (lastSyncStatus=needs_reconnect|error)
 *   that have been failing for more than 30 minutes (avoid wasting cron budget on dead tokens).
 * - Processes up to CONCURRENCY accounts at a time.
 * - Stops processing new accounts once BUDGET_MS wall-clock time has elapsed.
 */
export async function runScheduledSyncForScope(
  scope: SyncScope,
  opts?: { budgetMs?: number }
): Promise<{ processed: number; errors: string[] }> {
  await ensureSyncTables();

  const CONCURRENCY = 3;
  const BUDGET_MS = opts?.budgetMs ?? 45_000; // leave headroom inside the 60s maxDuration
  const deadline = Date.now() + BUDGET_MS;

  const accounts = await prisma.socialAccount.findMany({
    where: { status: 'connected' },
    select: {
      id: true,
      userId: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      lastSuccessfulSyncAt: true,
      lastSyncAttemptAt: true,
      lastSyncStatus: true,
    },
  });

  const errors: string[] = [];
  let processed = 0;

  // Filter to only accounts that need syncing for this scope
  const candidates = accounts.filter((acc) => {
    const supportedScopes = PLATFORM_SCOPES[acc.platform] ?? [];
    if (!supportedScopes.includes(scope)) return false;

    // Skip accounts whose auth has been failing for > 30 min (don't waste budget)
    if (acc.lastSyncStatus === 'needs_reconnect') {
      const lastAttempt = acc.lastSyncAttemptAt?.getTime() ?? 0;
      if (Date.now() - lastAttempt < 30 * 60_000) return false;
    }

    const ageMs = acc.lastSuccessfulSyncAt
      ? Date.now() - acc.lastSuccessfulSyncAt.getTime()
      : Infinity;
    const threshold = getStaleThresholdMs(acc.platform, scope);
    return ageMs >= threshold;
  });

  // Process in parallel batches with wall-clock budget
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) {
      console.warn(`[SyncEngine] ${scope} cron budget exhausted after ${i} accounts`);
      break;
    }
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((acc) =>
        syncAccount({
          userId: acc.userId,
          socialAccountId: acc.id,
          platform: acc.platform,
          scope,
          syncType: 'scheduled',
          triggeredBy: 'cron',
        })
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.status !== 'skipped_duplicate') processed++;
      } else {
        errors.push(String(r.reason?.message ?? r.reason));
      }
    }
  }

  return { processed, errors };
}

/**
 * Returns the current sync status for an account in a format suitable for the UI.
 */
export async function getAccountSyncStatus(socialAccountId: string): Promise<{
  status: string;
  lastSuccessfulSyncAt: Date | null;
  lastSyncAttemptAt: Date | null;
  lastSyncError: string | null;
  staleSinceMs: number | null;
  activeJob: { id: string; scope: string; syncType: string; startedAt: Date | null } | null;
}> {
  await ensureSyncTables();

  const account = await prisma.socialAccount.findUnique({
    where: { id: socialAccountId },
    select: {
      platform: true,
      lastSuccessfulSyncAt: true,
      lastSyncAttemptAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
    },
  });

  if (!account) {
    return { status: 'idle', lastSuccessfulSyncAt: null, lastSyncAttemptAt: null, lastSyncError: null, staleSinceMs: null, activeJob: null };
  }

  // Check for active running job
  let activeJob: { id: string; scope: string; syncType: string; startedAt: Date | null } | null = null;
  try {
    const running = await (prisma as unknown as {
      syncJob?: {
        findFirst: (args: unknown) => Promise<{ id: string; scope: string; syncType: string; startedAt: Date | null } | null>
      }
    }).syncJob?.findFirst({
      where: {
        socialAccountId,
        status: { in: ['queued', 'running'] },
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, // only jobs from last 10 min
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, scope: true, syncType: true, startedAt: true },
    });
    activeJob = running ?? null;
  } catch { /* syncJob table may not exist yet */ }

  const staleSinceMs = account.lastSuccessfulSyncAt
    ? Date.now() - account.lastSuccessfulSyncAt.getTime()
    : null;

  const derivedStatus = activeJob
    ? 'syncing'
    : account.lastSyncStatus ?? 'idle';

  return {
    status: derivedStatus,
    lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
    lastSyncAttemptAt: account.lastSyncAttemptAt,
    lastSyncError: account.lastSyncError,
    staleSinceMs,
    activeJob,
  };
}
