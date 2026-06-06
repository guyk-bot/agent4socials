import { prisma } from '@/lib/db';

let ensured = false;
let inFlight: Promise<void> | null = null;

async function tableExists(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'aysop_chat_sessions'
      ) AS "exists"`
    );
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

async function runMigration(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "aysop_chat_sessions" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'New chat',
      "messages" JSONB NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "aysop_chat_sessions_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "aysop_chat_sessions_userId_updatedAt_idx"
      ON "aysop_chat_sessions"("userId", "updatedAt" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'aysop_chat_sessions_userId_fkey'
      ) THEN
        ALTER TABLE "aysop_chat_sessions"
          ADD CONSTRAINT "aysop_chat_sessions_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$
  `);
}

/** Best-effort: create aysop_chat_sessions if migrations have not run yet. */
export async function ensureAysopChatTable(): Promise<boolean> {
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
      console.log('[AysopChat] aysop_chat_sessions table ensured.');
    } catch (e) {
      console.warn('[AysopChat] ensure table failed:', (e as Error).message?.slice(0, 200));
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
  return ensured;
}

export function resetAysopChatTableEnsure(): void {
  ensured = false;
}
