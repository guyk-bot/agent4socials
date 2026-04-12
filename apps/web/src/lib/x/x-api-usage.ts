import { prisma } from '@/lib/db';

/** Thrown when a social account has exceeded its monthly X API call budget (`xApiSyncLimit`). */
export class XRateLimitExceeded extends Error {
  readonly code = 'X_RATE_LIMIT_EXCEEDED' as const;
  constructor(message = 'Monthly X API limit reached. Upgrade to Pro or try again next month.') {
    super(message);
    this.name = 'XRateLimitExceeded';
  }
}

function currentUtcMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Atomically increments this account's monthly X API usage by 1 before an outbound call to
 * `api.twitter.com` / `api.x.com`. Resets the counter when the UTC month changes.
 * @throws {XRateLimitExceeded} when the account is at or over `xApiSyncLimit` for the current month.
 */
export async function checkAndIncrementXApiUsage(socialAccountId: string): Promise<void> {
  const monthKey = currentUtcMonthKey();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "SocialAccount"
    SET
      "xApiUsageMonthKey" = ${monthKey},
      "xApiCallCount" = CASE
        WHEN COALESCE("xApiUsageMonthKey", '') IS DISTINCT FROM ${monthKey} THEN 1
        ELSE "xApiCallCount" + 1
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${socialAccountId}
      AND (
        COALESCE("xApiUsageMonthKey", '') IS DISTINCT FROM ${monthKey}
        OR "xApiCallCount" < COALESCE("xApiSyncLimit", 100)
      )
    RETURNING "id";
  `;
  if (!rows.length) {
    const exists = await prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { id: true },
    });
    if (!exists) throw new Error(`SocialAccount not found: ${socialAccountId}`);
    throw new XRateLimitExceeded();
  }
}
