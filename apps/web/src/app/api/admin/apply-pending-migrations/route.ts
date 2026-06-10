/**
 * POST /api/admin/apply-pending-migrations
 *
 * One-time endpoint to apply schema migrations that failed during Vercel builds
 * (typically due to a misconfigured DATABASE_DIRECT_URL).
 *
 * Secured by CRON_SECRET. Call with:
 *   curl -X POST https://www.izop.io/api/admin/apply-pending-migrations \
 *     -H "X-Cron-Secret: <your CRON_SECRET>"
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim().replace(/^['"]|['"]$/g, '');
  if (!secret) return false;
  const provided =
    req.headers.get('X-Cron-Secret') ||
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.nextUrl.searchParams.get('secret') ||
    '';
  return provided.trim() === secret;
}

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '20260408153000_imported_post_saves_count',
    sql: `ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "savesCount" INTEGER DEFAULT 0`,
  },
  {
    name: '20260523210000_post_also_post_to_story',
    sql: `ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "alsoPostToStory" BOOLEAN NOT NULL DEFAULT false`,
  },
  {
    name: '20260606120000_aysop_chat_sessions',
    sql: `
CREATE TABLE IF NOT EXISTS "aysop_chat_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "messages" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aysop_chat_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "aysop_chat_sessions_userId_updatedAt_idx"
  ON "aysop_chat_sessions"("userId", "updatedAt" DESC);
`,
  },
];

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Array<{ name: string; status: 'applied' | 'error'; error?: string }> = [];

  for (const migration of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(migration.sql);
      results.push({ name: migration.name, status: 'applied' });
      console.log('[apply-pending-migrations] Applied:', migration.name);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      results.push({ name: migration.name, status: 'error', error: msg });
      console.error('[apply-pending-migrations] Failed:', migration.name, msg);
    }
  }

  const allOk = results.every((r) => r.status === 'applied');
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
