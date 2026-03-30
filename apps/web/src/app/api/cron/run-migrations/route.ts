import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET/POST /api/cron/run-migrations
 * Secured with CRON_SECRET. Applies the connection-history migration SQL so production
 * has firstConnectedAt, connectedAt, disconnectedAt on SocialAccount and AccountMetricSnapshot table.
 * Safe to call multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const results: string[] = [];
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "firstConnectedAt" TIMESTAMP(3)`);
    results.push('firstConnectedAt');
  } catch (e) {
    results.push(`firstConnectedAt: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3)`);
    results.push('connectedAt');
  } catch (e) {
    results.push(`connectedAt: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3)`);
    results.push('disconnectedAt');
  } catch (e) {
    results.push(`disconnectedAt: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "SocialAccount" SET "firstConnectedAt" = "createdAt", "connectedAt" = "createdAt" WHERE "firstConnectedAt" IS NULL`
    );
    results.push('backfill');
  } catch (e) {
    results.push(`backfill: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AccountMetricSnapshot" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "socialAccountId" TEXT NOT NULL,
        "platform" "Platform" NOT NULL,
        "externalAccountId" TEXT NOT NULL,
        "metricDate" TEXT NOT NULL,
        "metricTimestamp" TIMESTAMP(3) NOT NULL,
        "followersCount" INTEGER,
        "followingCount" INTEGER,
        "fansCount" INTEGER,
        "source" TEXT NOT NULL DEFAULT 'bootstrap',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AccountMetricSnapshot_pkey" PRIMARY KEY ("id")
      )
    `);
    results.push('AccountMetricSnapshot table');
  } catch (e) {
    results.push(`AccountMetricSnapshot: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "AccountMetricSnapshot_userId_platform_externalAccountId_metricDate_key" ON "AccountMetricSnapshot"("userId", "platform", "externalAccountId", "metricDate")`
    );
    results.push('snapshot unique index');
  } catch (e) {
    results.push(`snapshot unique index: ${(e as Error)?.message}`);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "insightsJson" JSONB`);
    results.push('insightsJson');
  } catch (e) {
    results.push(`insightsJson: ${(e as Error)?.message}`);
  }

  // Sync infrastructure columns on SocialAccount
  for (const col of [
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "initialBackfillDone" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "permissionsSnapshot" JSONB`,
  ]) {
    try {
      await prisma.$executeRawUnsafe(col);
      results.push(col.match(/"(\w+)" (TIMESTAMP|TEXT|BOOLEAN|JSONB)/)?.[1] ?? 'sync col');
    } catch (e) {
      results.push(`sync col: ${(e as Error)?.message?.slice(0, 80)}`);
    }
  }

  // sync_jobs table
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
    results.push('sync_jobs table');
  } catch (e) {
    results.push(`sync_jobs: ${(e as Error)?.message?.slice(0, 80)}`);
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sync_jobs_idempotencyKey_key" ON "sync_jobs"("idempotencyKey")`
    );
    results.push('sync_jobs unique idx');
  } catch (e) {
    results.push(`sync_jobs idx: ${(e as Error)?.message?.slice(0, 80)}`);
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "sync_jobs_socialAccountId_scope_status_idx" ON "sync_jobs"("socialAccountId","scope","status")`
    );
    results.push('sync_jobs scope idx');
  } catch (e) { /* non-fatal */ }

  return NextResponse.json({ ok: true, results });
}
