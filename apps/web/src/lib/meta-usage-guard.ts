/**
 * Meta Graph API throttle guard — global across all Vercel Lambda instances.
 *
 * WHY: Vercel runs many independent serverless functions with no shared memory.
 * In-process caches only protect one Lambda while others keep hammering the API.
 *
 * STRATEGY:
 *   L1 (in-process): checked first, avoids a DB round-trip on every request.
 *   L2 (Postgres via raw SQL): shared globally across all Lambda instances.
 *     The table is created on first write if it doesn't exist yet.
 *
 * Write: any instance that detects high x-app-usage or a rate-limit error
 *   writes the throttle-until timestamp to both L1 and the DB.
 * Read: L1 serves the request if fresh; when stale, a non-blocking DB read
 *   refreshes L1 for the next window.
 */

import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';

const META_THROTTLE_DB_KEY = 'meta:throttle-until';
const META_THROTTLE_MINUTES = 45;
const META_USAGE_HIGH_PCT = 25; // Back off at 25% — well before the per-user 200 call/hour limit
const L1_TTL_MS = 15_000;      // How long one instance trusts its local copy

let l1ThrottleUntil = 0;
let l1ReadAt = 0;
let _tableEnsured = false;      // Only run CREATE TABLE once per instance lifetime

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseAppUsageHeader(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Math.max(
      toNumber(parsed.call_count),
      toNumber(parsed.total_time),
      toNumber(parsed.total_cputime)
    );
  } catch { return null; }
}

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    _tableEnsured = true;
  } catch { _tableEnsured = true; /* tolerate permission errors; fall back to L1 */ }
}

async function readThrottleFromDb(): Promise<number> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM app_kv WHERE key = ${META_THROTTLE_DB_KEY} LIMIT 1
    `;
    const ts = Number(rows[0]?.value ?? '0');
    return Number.isFinite(ts) ? ts : 0;
  } catch { return 0; }
}

async function writeThrottleToDb(until: number): Promise<void> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const expiresAt = new Date(until);
    await prisma.$executeRaw`
      INSERT INTO app_kv (key, value, "expiresAt", "updatedAt")
      VALUES (${META_THROTTLE_DB_KEY}, ${String(until)}, ${expiresAt}, now())
      ON CONFLICT (key) DO UPDATE
        SET value = ${String(until)}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    `;
  } catch { /* L1 still applies on this instance */ }
}

function activateThrottle(untilMs: number): void {
  l1ThrottleUntil = untilMs;
  l1ReadAt = Date.now();
  void writeThrottleToDb(untilMs);
}

/** True when non-critical Meta calls should be skipped. Synchronous; DB refresh is async. */
export function isMetaNonCriticalThrottled(): boolean {
  const now = Date.now();
  if (now - l1ReadAt < L1_TTL_MS) return now < l1ThrottleUntil;
  // L1 stale — refresh from DB in background; return optimistic result this cycle
  l1ReadAt = now;
  void readThrottleFromDb().then((until) => { l1ThrottleUntil = until; });
  return now < l1ThrottleUntil;
}

/** Call when Meta returns an explicit rate-limit error. */
export function noteMetaRateLimitError(): void {
  activateThrottle(Date.now() + META_THROTTLE_MINUTES * 60_000);
}

/**
 * Capture x-app-usage header from any Meta Graph response.
 * Enter throttle mode when usage crosses META_USAGE_HIGH_PCT.
 */
export function noteMetaUsageFromHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders | Record<string, unknown> | undefined
): void {
  if (!headers) return;
  const pct =
    parseAppUsageHeader((headers['x-app-usage'] as string | undefined) ?? null) ??
    parseAppUsageHeader((headers['X-App-Usage'] as string | undefined) ?? null);
  if (pct === null) return;
  if (pct >= META_USAGE_HIGH_PCT) {
    activateThrottle(Date.now() + META_THROTTLE_MINUTES * 60_000);
  }
}

export function isMetaPlatform(platform: string): boolean {
  return platform === 'INSTAGRAM' || platform === 'FACEBOOK';
}

/**
 * Whether to run the expensive Instagram/Facebook post import via HTTP.
 * Only allowed when force=1 (manual Sync button). Cron uses the sync engine.
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
