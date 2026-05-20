/**
 * Meta Graph API throttle guard — global across all Vercel Lambda instances.
 *
 * This is Agent4Socials' own backoff layer. It is NOT the same as the "Rate Limit"
 * percentages in Meta Developer Dashboard (those can show 10% while we still pause).
 *
 * STRATEGY:
 *   L1 (in-process): checked first, avoids a DB round-trip on every request.
 *   L2 (Postgres via raw SQL): shared globally across all Lambda instances.
 */

import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';

const META_THROTTLE_DB_KEY = 'meta:throttle-until';
/** Meta returned 429 / explicit rate-limit error. */
const META_THROTTLE_HARD_MINUTES = 15;
/** x-app-usage header high, or short burst of calls on one server instance. */
const META_THROTTLE_SOFT_MINUTES = 5;
/** Soft backoff when Meta x-app-usage crosses this (target: stay under ~50% on dashboard). */
const META_USAGE_HIGH_PCT = 55;
/** Skip live avatar/name enrichment only when usage is clearly elevated (not at ~50%). */
const META_USAGE_SKIP_ENRICH_PCT = 72;
/** Reduce per-request fan-out (fewer participant/profile calls) above this. */
const META_USAGE_REDUCE_FANOUT_PCT = 58;
const L1_TTL_MS = 15_000;

let l1ThrottleUntil = 0;
let l1ReadAt = 0;
let l1LastUsagePct = 0;
let _tableEnsured = false;

/** Shown in Inbox when our backoff blocks a fetch (not when Meta dashboard is at 10%). */
export const META_APP_BACKOFF_INBOX_MESSAGE =
  'Agent4Socials paused extra Meta calls for a few minutes after heavy inbox traffic. Your Meta app dashboard can still show plenty of headroom. Tap Retry in a minute or two.';

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
  } catch {
    return null;
  }
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
  } catch {
    _tableEnsured = true;
  }
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
  } catch {
    return 0;
  }
}

async function deleteThrottleFromDb(): Promise<void> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    await prisma.$executeRaw`
      DELETE FROM app_kv WHERE key = ${META_THROTTLE_DB_KEY}
    `;
  } catch {
    /* ignore */
  }
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
  } catch {
    /* L1 still applies on this instance */
  }
}

function activateThrottle(untilMs: number): void {
  const next = Math.max(l1ThrottleUntil, untilMs);
  l1ThrottleUntil = next;
  l1ReadAt = Date.now();
  void writeThrottleToDb(next);
}

/** Clear app-level backoff (e.g. after a successful inbox fetch or admin resume). */
export function clearMetaThrottle(): void {
  l1ThrottleUntil = 0;
  l1ReadAt = Date.now();
  void deleteThrottleFromDb();
}

export function getMetaThrottleUntilMs(): number {
  return l1ThrottleUntil;
}

/** Minutes until our backoff ends (0 if not active). */
export function getMetaThrottleRemainingMinutes(): number {
  const remaining = l1ThrottleUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
}

/** Last x-app-usage % seen from Meta (call_count / total_time / total_cputime max). */
export function getMetaAppUsagePct(): number {
  return l1LastUsagePct;
}

/** Skip per-user IG profile lookups and similar fan-out when usage is elevated. */
export function shouldSkipMetaProfileEnrichment(): boolean {
  if (isMetaNonCriticalThrottled()) return true;
  return l1LastUsagePct >= META_USAGE_SKIP_ENRICH_PCT;
}

/** Use smaller enrichment caps (still runs cache merge and list participants). */
export function shouldReduceMetaProfileFanOut(): boolean {
  if (isMetaNonCriticalThrottled()) return true;
  return l1LastUsagePct >= META_USAGE_REDUCE_FANOUT_PCT;
}

/** True when non-critical Meta calls should be skipped. Synchronous; DB refresh is async. */
export function isMetaNonCriticalThrottled(): boolean {
  const now = Date.now();
  if (now - l1ReadAt < L1_TTL_MS) return now < l1ThrottleUntil;
  l1ReadAt = now;
  void readThrottleFromDb().then((until) => {
    l1ThrottleUntil = until;
  });
  return now < l1ThrottleUntil;
}

/** Call when Meta returns an explicit rate-limit error (429). */
export function noteMetaRateLimitError(): void {
  activateThrottle(Date.now() + META_THROTTLE_HARD_MINUTES * 60_000);
}

/** Short backoff after burst traffic or elevated x-app-usage on one response. */
export function noteMetaSoftBackoff(): void {
  activateThrottle(Date.now() + META_THROTTLE_SOFT_MINUTES * 60_000);
}

/**
 * Capture x-app-usage header from any Meta Graph response.
 * Enters soft backoff when dashboard app usage crosses META_USAGE_HIGH_PCT (~50%).
 */
export function noteMetaUsageFromHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders | Record<string, unknown> | undefined
): void {
  if (!headers) return;
  const pct =
    parseAppUsageHeader((headers['x-app-usage'] as string | undefined) ?? null) ??
    parseAppUsageHeader((headers['X-App-Usage'] as string | undefined) ?? null);
  if (pct === null) return;
  l1LastUsagePct = Math.max(l1LastUsagePct, pct);
  if (pct >= META_USAGE_HIGH_PCT) {
    noteMetaSoftBackoff();
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
