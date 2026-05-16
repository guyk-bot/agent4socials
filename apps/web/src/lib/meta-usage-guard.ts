/**
 * Meta Graph API throttle guard.
 *
 * WHY THIS EXISTS: Vercel runs dozens of independent serverless instances.
 * In-process memory is NOT shared between them, so an in-memory throttle only
 * protects one Lambda while the other 20 keep hammering Meta's API.
 *
 * This module uses a TWO-LAYER strategy:
 *   L1 (local): in-process cache, TTL 20s — avoids a DB round-trip on every call
 *   L2 (global): app_kv table in Postgres — shared across ALL Lambda instances
 *
 * Write path: when any instance detects high x-app-usage or a rate-limit error,
 *   it writes the throttle-until timestamp to both L1 and the DB.
 * Read path: each instance checks L1 first; if stale, queries the DB once.
 *   The L1 hit covers all subsequent calls within the 20s window.
 */

import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';

const META_THROTTLE_KEY = 'meta:throttle-until';
/** How long to skip optional Meta fan-out after high usage or a rate-limit error. */
const META_THROTTLE_MINUTES = 45;
/** Trigger back-off when x-app-usage hits this %. Lower = safer margin. */
const META_USAGE_HIGH_PCT = 30;
/** L1 (in-process) TTL — balance between DB reads and freshness across instances. */
const L1_TTL_MS = 20_000;

let l1ThrottleUntil = 0;
let l1ReadAt = 0;

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseAppUsageHeader(raw: string | null | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Math.max(
      toNumber(parsed.call_count),
      toNumber(parsed.total_time),
      toNumber(parsed.total_cputime)
    );
  } catch {
    return null;
  }
}

async function readThrottleFromDb(): Promise<number> {
  try {
    const { prisma } = await import('@/lib/db');
    const row = await (prisma as unknown as {
      appKv?: { findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null> }
    }).appKv?.findUnique({ where: { key: META_THROTTLE_KEY } });
    if (!row) return 0;
    const ts = Number(row.value);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

async function writeThrottleToDb(until: number): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    const expiresAt = new Date(until);
    await (prisma as unknown as {
      appKv?: {
        upsert: (args: {
          where: { key: string };
          create: { key: string; value: string; expiresAt: Date };
          update: { value: string; expiresAt: Date };
        }) => Promise<unknown>
      }
    }).appKv?.upsert({
      where: { key: META_THROTTLE_KEY },
      create: { key: META_THROTTLE_KEY, value: String(until), expiresAt },
      update: { value: String(until), expiresAt },
    });
  } catch {
    // DB write failure — L1 still prevents calls from this instance
  }
}

function setThrottle(untilMs: number): void {
  l1ThrottleUntil = untilMs;
  l1ReadAt = Date.now();
  void writeThrottleToDb(untilMs);
}

/** True when app should skip optional, high-fanout Meta calls. */
export function isMetaNonCriticalThrottled(): boolean {
  const now = Date.now();
  // L1 hit
  if (now - l1ReadAt < L1_TTL_MS) return now < l1ThrottleUntil;
  // L1 stale → refresh async; optimistically return current value while DB query runs
  l1ReadAt = now; // prevent multiple concurrent reads
  void readThrottleFromDb().then((until) => {
    l1ThrottleUntil = until;
  });
  return now < l1ThrottleUntil;
}

/** Force-trigger throttle. Call when a rate-limit error or explicit pause is needed. */
export function noteMetaRateLimitError(): void {
  setThrottle(Date.now() + META_THROTTLE_MINUTES * 60_000);
}

/** Capture x-app-usage from Meta Graph responses; enter throttle mode if usage is high. */
export function noteMetaUsageFromHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders | undefined
): void {
  if (!headers) return;
  const pct =
    parseAppUsageHeader((headers['x-app-usage'] as string | undefined) ?? null) ??
    parseAppUsageHeader((headers['X-App-Usage'] as string | undefined) ?? null);
  if (pct === null) return;
  if (pct >= META_USAGE_HIGH_PCT) {
    setThrottle(Date.now() + META_THROTTLE_MINUTES * 60_000);
  }
}

export function isMetaPlatform(platform: string): boolean {
  return platform === 'INSTAGRAM' || platform === 'FACEBOOK';
}

/**
 * Instagram/Facebook bulk post import via GET /posts?sync=1 is disabled unless
 * the user explicitly forces refresh (force=1). Scheduled cron uses the sync engine adapter.
 */
export function shouldRunMetaPostsHttpSync(
  platform: string,
  syncRequested: boolean,
  forceRequested: boolean
): boolean {
  if (!syncRequested) return false;
  if (!isMetaPlatform(platform)) return true;
  if (isMetaNonCriticalThrottled() && !forceRequested) return false;
  return forceRequested;
}
