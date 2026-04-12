import { prisma } from '@/lib/db';

let _oauthSchemaEnsured = false;
let _oauthSchemaInFlight: Promise<void> | null = null;

async function oauthSchemaAlreadyApplied(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'SocialAccount' AND column_name = 'credentialsJson'
      ) AS "exists"`
    );
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

async function runOAuthSchemaMigrations(): Promise<void> {
  const alters = [
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "credentialsJson" JSONB`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'connected'`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "firstConnectedAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt" TIMESTAMP(3)`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "initialBackfillDone" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "permissionsSnapshot" JSONB`,
  ];
  for (const sql of alters) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.warn('[ensureSocialAccountOAuthSchema] alter skipped:', (e as Error)?.message?.slice(0, 160));
    }
  }
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_userId_platform_platformUserId_key"
      ON "SocialAccount"("userId", "platform", "platformUserId")
    `);
  } catch (e) {
    console.warn('[ensureSocialAccountOAuthSchema] composite unique index:', (e as Error)?.message?.slice(0, 160));
  }
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PendingConnection" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "platform" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "expiresAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PendingConnection_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "PendingConnection_userId_idx" ON "PendingConnection"("userId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "PendingConnection_userId_platform_idx" ON "PendingConnection"("userId", "platform")`
    );
  } catch (e) {
    console.warn('[ensureSocialAccountOAuthSchema] PendingConnection:', (e as Error)?.message?.slice(0, 160));
  }
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "SocialAccount" SET "firstConnectedAt" = "createdAt", "connectedAt" = COALESCE("connectedAt", "createdAt") WHERE "firstConnectedAt" IS NULL`
    );
  } catch {
    /* ignore */
  }
}

/**
 * Production DBs sometimes skip `prisma migrate deploy`. Apply missing pieces idempotently.
 * Single-flight + 2s deadline so pool contention never blocks the OAuth callback.
 */
export async function ensureSocialAccountOAuthSchema(): Promise<void> {
  if (_oauthSchemaEnsured || process.env.SKIP_TABLE_ENSURE === '1') { _oauthSchemaEnsured = true; return; }
  if (_oauthSchemaInFlight) { await _oauthSchemaInFlight; return; }
  const deadline = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 2000));
  const run = (async (): Promise<'done'> => {
    try {
      if (await oauthSchemaAlreadyApplied()) { _oauthSchemaEnsured = true; return 'done'; }
      await runOAuthSchemaMigrations();
      _oauthSchemaEnsured = true;
    } catch (e) {
      console.warn('[ensureSocialAccountOAuthSchema] failed (non-fatal):', (e as Error)?.message?.slice(0, 200));
      _oauthSchemaEnsured = true;
    }
    return 'done';
  })();
  _oauthSchemaInFlight = run.then(() => {});
  try { await Promise.race([run, deadline]); } finally { if (_oauthSchemaInFlight) _oauthSchemaInFlight = null; }
}
