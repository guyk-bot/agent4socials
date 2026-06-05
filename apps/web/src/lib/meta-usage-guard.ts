/**
 * Meta Graph API throttle guard — global across all Vercel Lambda instances.
 *
 * This is Izop' own backoff layer. It is NOT the same as the "Rate Limit"
 * percentages in Meta Developer Dashboard (those can show 10% while we still pause).
 *
 * Target: keep Meta app dashboard usage under ~50%. We react to x-app-usage headers
 * and pause non-essential work well before the dashboard hits red.
 *
 * STRATEGY:
 *   L1 (in-process): checked first, avoids a DB round-trip on every request.
 *   L2 (Postgres via raw SQL): shared globally across all Lambda instances.
 */

import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';

const META_THROTTLE_DB_KEY = 'meta:throttle-until';
const META_USAGE_PCT_DB_KEY = 'meta:app-usage-pct';
/** Meta returned 429 / explicit rate-limit error. */
const META_THROTTLE_HARD_MINUTES = 20;
/** x-app-usage header high, or short burst of calls on one server instance. */
const META_THROTTLE_SOFT_MINUTES = 10;
/** Soft backoff when Meta x-app-usage crosses this (stay under ~50% on dashboard). */
const META_USAGE_HIGH_PCT = 32;
/** Skip live avatar/name enrichment above this. */
const META_USAGE_SKIP_ENRICH_PCT = 34;
/** Reduce per-request fan-out (fewer participant/profile calls) above this. */
const META_USAGE_REDUCE_FANOUT_PCT = 28;
/** Block comments fan-out, message-count probes, and latest-message enrichment. */
const META_USAGE_BLOCK_NON_ESSENTIAL_PCT = 36;
/** One lightweight conversation-list call per account (participants include names; no IGBusinessScopedID fan-out). */
const META_USAGE_ALLOW_LIST_SYNC_PCT = 55;
/** Up to 2 live profile lookups per inbox sync when usage is elevated but below list-sync cap. */
const META_USAGE_MINIMAL_PROFILE_PCT = 58;
/** Hard pause non-critical Meta work when dashboard usage is near the limit. */
const META_USAGE_EMERGENCY_PCT = 42;
const L1_TTL_MS = 10_000;
const USAGE_PCT_TTL_MS = 5 * 60_000;

let l1ThrottleUntil = 0;
let l1ReadAt = 0;
let l1LastUsagePct = 0;
let l1UsageHydrateAt = 0;
let _tableEnsured = false;

/** Shown in Inbox when our backoff blocks a fetch (not when Meta dashboard is at 10%). */
export const META_APP_BACKOFF_INBOX_MESSAGE =
  'Izop paused extra Meta calls for a few minutes after heavy inbox traffic. Your Meta app dashboard can still show plenty of headroom. Tap Retry in a minute or two.';

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

async function readUsagePctFromDb(): Promise<number> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const rows = await prisma.$queryRaw<Array<{ value: string; expiresAt: Date | null }>>`
      SELECT value, "expiresAt" FROM app_kv WHERE key = ${META_USAGE_PCT_DB_KEY} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return 0;
    if (row.expiresAt && row.expiresAt < new Date()) return 0;
    const pct = Number(row.value);
    return Number.isFinite(pct) ? pct : 0;
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

async function writeUsagePctToDb(pct: number): Promise<void> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const expiresAt = new Date(Date.now() + USAGE_PCT_TTL_MS);
    await prisma.$executeRaw`
      INSERT INTO app_kv (key, value, "expiresAt", "updatedAt")
      VALUES (${META_USAGE_PCT_DB_KEY}, ${String(pct)}, ${expiresAt}, now())
      ON CONFLICT (key) DO UPDATE
        SET value = ${String(pct)}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    `;
  } catch {
    /* ignore */
  }
}

function activateThrottle(untilMs: number): void {
  const next = Math.max(l1ThrottleUntil, untilMs);
  l1ThrottleUntil = next;
  l1ReadAt = Date.now();
  void writeThrottleToDb(next);
}

/** Refresh shared usage % from DB (all lambdas). */
function hydrateUsagePctAsync(): void {
  const now = Date.now();
  if (now - l1UsageHydrateAt < L1_TTL_MS) return;
  l1UsageHydrateAt = now;
  void readUsagePctFromDb().then((pct) => {
    if (pct > 0) l1LastUsagePct = Math.max(l1LastUsagePct, pct);
  });
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
  hydrateUsagePctAsync();
  return l1LastUsagePct;
}

/** True when non-critical Meta calls should be skipped. Synchronous; DB refresh is async. */
export function isMetaNonCriticalThrottled(): boolean {
  hydrateUsagePctAsync();
  const now = Date.now();
  if (now - l1ReadAt < L1_TTL_MS) return now < l1ThrottleUntil;
  l1ReadAt = now;
  void readThrottleFromDb().then((until) => {
    l1ThrottleUntil = until;
  });
  return now < l1ThrottleUntil;
}

/** Skip per-user IG profile lookups and similar fan-out when usage is elevated. */
export function shouldSkipMetaProfileEnrichment(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return true;
  return l1LastUsagePct >= META_USAGE_SKIP_ENRICH_PCT;
}

/** Use smaller enrichment caps (still runs cache merge and list participants). */
export function shouldReduceMetaProfileFanOut(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return true;
  return l1LastUsagePct >= META_USAGE_REDUCE_FANOUT_PCT;
}

/**
 * Block expensive inbox extras: comment post fan-out, message-count probes,
 * latest-message sender lookups, and live profile enrichment.
 */
export function shouldBlockMetaNonEssentialCalls(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return true;
  return l1LastUsagePct >= META_USAGE_BLOCK_NON_ESSENTIAL_PCT;
}

/** Live inbox avatar/name enrichment (IGBusinessScopedID, participant edges). */
export function shouldAllowMetaInboxProfileEnrichment(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return false;
  if (shouldBlockMetaNonEssentialCalls()) return false;
  return l1LastUsagePct < META_USAGE_REDUCE_FANOUT_PCT;
}

/** Lightweight DM list refresh (one Graph call per account; fills participant names from list payload). */
export function shouldAllowInboxListSync(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return false;
  return l1LastUsagePct < META_USAGE_ALLOW_LIST_SYNC_PCT;
}

/** Small budget of live profile API calls during 2 min sync (2 lookups max per route). */
export function shouldAllowMinimalProfileEnrichment(): boolean {
  hydrateUsagePctAsync();
  if (isMetaNonCriticalThrottled()) return false;
  return l1LastUsagePct < META_USAGE_MINIMAL_PROFILE_PCT;
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
 * Enters soft backoff when dashboard app usage crosses META_USAGE_HIGH_PCT (~38%).
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
  void writeUsagePctToDb(l1LastUsagePct);
  if (pct >= META_USAGE_EMERGENCY_PCT) {
    activateThrottle(Date.now() + META_THROTTLE_HARD_MINUTES * 60_000);
  } else if (pct >= META_USAGE_HIGH_PCT) {
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
  if (shouldBlockMetaNonEssentialCalls() && !forceRequested) return false;
  if (isMetaNonCriticalThrottled() && !forceRequested) return false;
  return forceRequested;
}
