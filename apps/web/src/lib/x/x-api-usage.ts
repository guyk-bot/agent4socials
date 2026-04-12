import { prisma } from '@/lib/db';

/** Kept for API compatibility but never thrown — budget is monitored, not enforced. */
export class XRateLimitExceeded extends Error {
  readonly code = 'X_RATE_LIMIT_EXCEEDED' as const;
  constructor(message = 'Monthly X API limit reached.') {
    super(message);
    this.name = 'XRateLimitExceeded';
  }
}

function currentUtcMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Best-effort counter: increments the monthly X API call count and auto-resets when the
 * UTC month rolls over. Never throws — if the DB update fails (e.g. column missing before
 * a migration runs) the calling code continues normally.
 */
export async function checkAndIncrementXApiUsage(socialAccountId: string): Promise<void> {
  const monthKey = currentUtcMonthKey();
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "SocialAccount"
      SET
        "xApiUsageMonthKey" = $1,
        "xApiCallCount" = CASE
          WHEN COALESCE("xApiUsageMonthKey", '') IS DISTINCT FROM $1 THEN 1
          ELSE LEAST("xApiCallCount" + 1, 2147483647)
        END,
        "updatedAt" = NOW()
      WHERE "id" = $2
    `, monthKey, socialAccountId);
  } catch {
    // Non-fatal: counting is best-effort; never block an API call over a counter failure.
  }
}

/**
 * Reset the monthly X API counter for an account so it can make calls again immediately.
 * Call this from an admin route or directly via Supabase SQL when needed.
 */
export async function resetXApiUsage(socialAccountId: string): Promise<void> {
  await prisma.socialAccount.updateMany({
    where: { id: socialAccountId },
    data: { xApiCallCount: 0, xApiUsageMonthKey: null, xApiSyncLimit: 10000 },
  });
}

/**
 * Reset ALL Twitter accounts' counters (e.g. after a misconfigured limit caused a lockout).
 */
export async function resetAllXApiUsage(): Promise<void> {
  await prisma.socialAccount.updateMany({
    where: { platform: 'TWITTER' },
    data: { xApiCallCount: 0, xApiUsageMonthKey: null, xApiSyncLimit: 10000 },
  });
}
