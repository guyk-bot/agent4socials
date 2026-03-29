import { prisma } from '@/lib/db';

/**
 * True after a successful probe; false is retried every {@link NEGATIVE_CACHE_MS} so a newly applied migration is picked up without redeploying every instance.
 */
let discoveryTableConfirmed = false;
let discoveryRetryAfterMs = 0;

const NEGATIVE_CACHE_MS = 60_000;

/**
 * Whether `FacebookMetricDiscovery` (and the same migration batch as `FacebookSyncRun`) exists and is readable.
 * Caches success for the process lifetime; caches failure for 60s then retries (Supabase manual SQL fix).
 */
export async function isFacebookMetricDiscoveryTableAvailable(): Promise<boolean> {
  if (discoveryTableConfirmed) return true;
  const now = Date.now();
  if (now < discoveryRetryAfterMs) return false;
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "FacebookMetricDiscovery" LIMIT 1`);
    discoveryTableConfirmed = true;
    return true;
  } catch {
    discoveryRetryAfterMs = now + NEGATIVE_CACHE_MS;
    return false;
  }
}

/** Tests only, or after manual DDL in a long-lived Node process. */
export function resetFacebookMetricDiscoveryAvailabilityCache(): void {
  discoveryTableConfirmed = false;
  discoveryRetryAfterMs = 0;
}

/** After a Prisma failure (e.g. table dropped), allow a quick retry instead of sticking to "available". */
export function markFacebookMetricDiscoveryTableUnavailable(): void {
  discoveryTableConfirmed = false;
  discoveryRetryAfterMs = Date.now() + NEGATIVE_CACHE_MS;
}
