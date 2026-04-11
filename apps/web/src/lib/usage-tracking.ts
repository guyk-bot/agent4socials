/**
 * Lightweight per-user usage tracking.
 *
 * Tracks daily API call counts, sync invocations, AI generations, media processing,
 * and publish operations per user. Uses raw SQL (like sync_jobs) so no Prisma migration
 * is required — the table is created on first use.
 *
 * Usage: call `trackUsage(userId, category)` from any API route. It's fire-and-forget
 * (non-blocking, swallows errors) so it never slows down the actual request.
 */

import { prisma } from '@/lib/db';

export type UsageCategory =
  | 'api_call'
  | 'sync'
  | 'publish'
  | 'ai_generation'
  | 'media_upload'
  | 'media_serve'
  | 'comment_automation'
  | 'oauth_connect';

let _tableEnsured = false;

async function ensureUsageTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "usage_daily" (
        "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
        "userId"    TEXT         NOT NULL,
        "date"      DATE         NOT NULL DEFAULT CURRENT_DATE,
        "category"  TEXT         NOT NULL,
        "count"     INTEGER      NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "usage_daily_user_date_cat" UNIQUE ("userId", "date", "category")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "usage_daily_userId_date_idx" ON "usage_daily"("userId", "date")`
    );
    _tableEnsured = true;
  } catch (e) {
    console.warn('[usage-tracking] table creation skipped (may already exist):', (e as Error).message);
    _tableEnsured = true;
  }
}

/**
 * Increment the daily usage counter for a user + category.
 * Non-blocking: errors are swallowed so the calling route is never affected.
 */
export function trackUsage(userId: string, category: UsageCategory, increment = 1): void {
  if (!userId) return;
  (async () => {
    try {
      await ensureUsageTable();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "usage_daily" ("id", "userId", "date", "category", "count")
         VALUES (gen_random_uuid()::text, $1, CURRENT_DATE, $2, $3)
         ON CONFLICT ("userId", "date", "category")
         DO UPDATE SET "count" = "usage_daily"."count" + $3, "updatedAt" = CURRENT_TIMESTAMP`,
        userId,
        category,
        increment
      );
    } catch {
      // non-fatal
    }
  })();
}

export interface DailyUsageSummary {
  date: string;
  category: string;
  count: number;
}

/** Fetch usage summary for a user (last N days, default 30). */
export async function getUserUsageSummary(userId: string, days = 30): Promise<DailyUsageSummary[]> {
  await ensureUsageTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ date: Date; category: string; count: number }>>(
    `SELECT "date", "category", "count" FROM "usage_daily"
     WHERE "userId" = $1 AND "date" >= CURRENT_DATE - $2::int
     ORDER BY "date" DESC, "category"`,
    userId,
    days
  );
  return rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    category: r.category,
    count: Number(r.count),
  }));
}

/** Fetch aggregated usage totals per user (for admin/Supabase view). */
export async function getAllUsersUsageTotals(days = 30): Promise<Array<{ userId: string; category: string; total: number }>> {
  await ensureUsageTable();
  return prisma.$queryRawUnsafe<Array<{ userId: string; category: string; total: number }>>(
    `SELECT "userId", "category", SUM("count")::int AS "total"
     FROM "usage_daily"
     WHERE "date" >= CURRENT_DATE - $1::int
     GROUP BY "userId", "category"
     ORDER BY "total" DESC`,
    days
  );
}
