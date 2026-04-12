/**
 * Lightweight per-user usage tracking.
 *
 * Tracks daily API call counts per user. The usage_daily table MUST already
 * exist in production (created by the first deploy or a migration).
 *
 * trackUsage() is fire-and-forget — it never blocks the request, never runs DDL,
 * and stops trying after repeated failures (circuit breaker) to avoid wasting
 * pool connections during pressure.
 */

import { prisma } from '@/lib/db';

export type UsageCategory =
  | 'api_request'
  /** @deprecated legacy rows only; new code uses api_request */
  | 'api_call'
  | 'sync'
  | 'publish'
  | 'ai_generation'
  | 'media_upload'
  | 'media_serve'
  | 'comment_automation'
  | 'oauth_connect';

let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

/**
 * Increment the daily usage counter for a user + category.
 * Fire-and-forget: never awaited, errors swallowed, circuit-breaker stops
 * retries after 3 consecutive failures for 60 seconds.
 */
export function trackUsage(userId: string, category: UsageCategory, increment = 1): void {
  if (!userId) return;
  if (Date.now() < _circuitOpenUntil) return;
  (async () => {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "usage_daily" ("id", "userId", "date", "category", "count")
         VALUES (gen_random_uuid()::text, $1, CURRENT_DATE, $2, $3)
         ON CONFLICT ("userId", "date", "category")
         DO UPDATE SET "count" = "usage_daily"."count" + $3, "updatedAt" = CURRENT_TIMESTAMP`,
        userId,
        category,
        increment
      );
      _consecutiveFailures = 0;
    } catch {
      _consecutiveFailures++;
      if (_consecutiveFailures >= 3) {
        _circuitOpenUntil = Date.now() + 60_000;
      }
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
  return prisma.$queryRawUnsafe<Array<{ userId: string; category: string; total: number }>>(
    `SELECT "userId", "category", SUM("count")::int AS "total"
     FROM "usage_daily"
     WHERE "date" >= CURRENT_DATE - $1::int
     GROUP BY "userId", "category"
     ORDER BY "total" DESC`,
    days
  );
}

export type UsageLeaderboardRow = {
  userId: string;
  email: string;
  name: string | null;
  totalAll: number;
  byCategory: Record<string, number>;
};

export async function getUsageLeaderboardByUser(days = 30): Promise<UsageLeaderboardRow[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ userId: string; email: string; name: string | null; category: string; total: number }>
  >(
    `SELECT d."userId" AS "userId", u.email AS email, u.name AS name, d."category" AS category, SUM(d."count")::int AS total
     FROM "usage_daily" d
     INNER JOIN "User" u ON u.id = d."userId"
     WHERE d."date" >= CURRENT_DATE - $1::int
     GROUP BY d."userId", u.email, u.name, d."category"
     ORDER BY u.email, d."category"`,
    days
  );

  const byUser = new Map<string, UsageLeaderboardRow>();
  for (const r of rows) {
    let row = byUser.get(r.userId);
    if (!row) {
      row = { userId: r.userId, email: r.email, name: r.name, totalAll: 0, byCategory: {} };
      byUser.set(r.userId, row);
    }
    const t = Number(r.total);
    row.byCategory[r.category] = t;
    row.totalAll += t;
  }
  return [...byUser.values()].sort((a, b) => b.totalAll - a.totalAll);
}
