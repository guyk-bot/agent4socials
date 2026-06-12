import { prisma } from '@/lib/db';

let ensured = false;
let inFlight: Promise<void> | null = null;

async function tableExists(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'funnel_sessions'
      ) AS "exists"`
    );
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

async function runMigration(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "funnel_sessions" (
      "id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "guestUserId" TEXT NOT NULL,
      "messageCount" INTEGER NOT NULL DEFAULT 0,
      "connectedPlatform" "Platform",
      "connectedAccountId" TEXT,
      "chatPayload" JSONB,
      "brandContextDraft" JSONB,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "mergedToUserId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "funnel_sessions_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "funnel_sessions_token_key" ON "funnel_sessions"("token")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "funnel_sessions_guestUserId_key" ON "funnel_sessions"("guestUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "funnel_sessions_expiresAt_idx" ON "funnel_sessions"("expiresAt")
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "funnel_sessions" ADD COLUMN IF NOT EXISTS "guestPublishUsedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "funnel_sessions" ADD COLUMN IF NOT EXISTS "guestAnalyticsUsedAt" TIMESTAMP(3)
  `);
}

/** Best-effort: create funnel_sessions if migrations have not run yet. */
export async function ensureFunnelSessionsTable(): Promise<boolean> {
  if (ensured || process.env.SKIP_TABLE_ENSURE === '1') {
    ensured = true;
    return true;
  }
  if (inFlight) {
    await inFlight;
    return ensured;
  }
  inFlight = (async () => {
    try {
      if (await tableExists()) {
        ensured = true;
        return;
      }
      await runMigration();
      ensured = true;
      console.log('[FunnelSession] funnel_sessions table ensured.');
    } catch (e) {
      console.warn('[FunnelSession] ensure table failed:', (e as Error).message?.slice(0, 200));
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
  return ensured;
}
