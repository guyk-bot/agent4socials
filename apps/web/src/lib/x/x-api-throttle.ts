/**
 * X (Twitter) API throttle guard — per connected account.
 * After a 429, serve cached inbox threads instead of hammering api.x.com.
 */

const X_THROTTLE_DB_KEY_PREFIX = 'x:throttle-until:';
const X_THROTTLE_HARD_MINUTES = 12;
const L1_TTL_MS = 15_000;

const l1ByAccount = new Map<string, { until: number; readAt: number }>();
let _tableEnsured = false;

export const X_APP_BACKOFF_INBOX_MESSAGE =
  'X is limiting requests for this account. Showing cached messages when available. Wait a few minutes, then open the thread again.';

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

function dbKey(socialAccountId: string): string {
  return `${X_THROTTLE_DB_KEY_PREFIX}${socialAccountId}`;
}

async function readThrottleFromDb(socialAccountId: string): Promise<number> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM app_kv WHERE key = ${dbKey(socialAccountId)} LIMIT 1
    `;
    const ts = Number(rows[0]?.value ?? '0');
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

async function writeThrottleToDb(socialAccountId: string, untilMs: number): Promise<void> {
  try {
    await ensureTable();
    const { prisma } = await import('@/lib/db');
    const expiresAt = new Date(untilMs);
    await prisma.$executeRaw`
      INSERT INTO app_kv (key, value, "expiresAt", "updatedAt")
      VALUES (${dbKey(socialAccountId)}, ${String(untilMs)}, ${expiresAt}, now())
      ON CONFLICT (key) DO UPDATE
        SET value = ${String(untilMs)}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    `;
  } catch {
    /* non-critical */
  }
}

function activateThrottle(socialAccountId: string, untilMs: number): void {
  l1ByAccount.set(socialAccountId, { until: untilMs, readAt: Date.now() });
  void writeThrottleToDb(socialAccountId, untilMs);
}

/** Call when X returns HTTP 429 on DM or user endpoints. */
export function noteXApiRateLimit(socialAccountId: string): void {
  activateThrottle(socialAccountId, Date.now() + X_THROTTLE_HARD_MINUTES * 60_000);
}

/** True when live X API calls for this account should be skipped. */
export function isXApiThrottled(socialAccountId: string): boolean {
  const now = Date.now();
  const l1 = l1ByAccount.get(socialAccountId);
  if (l1 && now - l1.readAt < L1_TTL_MS) return now < l1.until;
  const entry = l1 ?? { until: 0, readAt: now };
  entry.readAt = now;
  l1ByAccount.set(socialAccountId, entry);
  void readThrottleFromDb(socialAccountId).then((until) => {
    l1ByAccount.set(socialAccountId, { until, readAt: Date.now() });
  });
  return now < entry.until;
}

export function getXThrottleMinutesRemaining(socialAccountId: string): number {
  const l1 = l1ByAccount.get(socialAccountId);
  const until = l1?.until ?? 0;
  const remaining = until - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
}
