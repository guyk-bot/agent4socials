import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// pgbouncer=true  – disable prepared statements (required for transaction-mode poolers)
// connection_limit – how many connections Prisma keeps per Lambda instance.
//   Default: 3 (allows some concurrency on warm Lambdas without over-saturating Supabase).
//   Override with DATABASE_CONNECTION_LIMIT env var.
// pool_timeout=15  – how long Prisma waits for a free slot in its internal pool.
// connect_timeout=10 – don't wait too long for TCP handshake
const rawUrl = process.env.DATABASE_URL;
if (rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl)) {
  let fixedUrl = rawUrl;
  const addParam = (u: string, param: string) =>
    u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
  if (!fixedUrl.includes('pgbouncer=true')) fixedUrl = addParam(fixedUrl, 'pgbouncer=true');
  if (!fixedUrl.includes('connection_limit=')) {
    const connLimitEnv = Number.parseInt(process.env.DATABASE_CONNECTION_LIMIT ?? '3', 10);
    const connLimit = Number.isFinite(connLimitEnv) && connLimitEnv >= 1 ? connLimitEnv : 3;
    fixedUrl = addParam(fixedUrl, `connection_limit=${connLimit}`);
  }
  const poolTimeoutSec = Number.parseInt(process.env.DATABASE_POOL_TIMEOUT_SEC ?? '15', 10);
  const poolTimeout = Number.isFinite(poolTimeoutSec) && poolTimeoutSec > 0 ? poolTimeoutSec : 15;
  fixedUrl = fixedUrl.replace(/pool_timeout=\d+/, `pool_timeout=${poolTimeout}`);
  if (!fixedUrl.includes('pool_timeout=')) fixedUrl = addParam(fixedUrl, `pool_timeout=${poolTimeout}`);
  fixedUrl = fixedUrl.replace(/connect_timeout=\d+/, 'connect_timeout=10');
  if (!fixedUrl.includes('connect_timeout=')) fixedUrl = addParam(fixedUrl, 'connect_timeout=10');
  process.env.DATABASE_URL = fixedUrl;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler. */
export const databaseUrlLooksDirect =
  typeof rawUrl === 'string' &&
  (rawUrl.includes(':5432/') || (rawUrl.includes('supabase') && !rawUrl.includes('6543') && !/pooler\.|pooler\.supabase/i.test(rawUrl)));

// ─── Lightweight connection-error retry ─────────────────────────────────────
// On transient pool pressure, wait briefly and retry (up to 2 retries).
// Unlike the old version, we do NOT call $disconnect/$connect — those cycles
// create more connection churn and make pool exhaustion worse.
const POOL_ERROR_PATTERNS = [
  'timed out fetching a new connection',
  'connection pool timed out',
  'server has closed the connection',
  'connection terminated unexpectedly',
  'econnreset',
];

export function isPrismaPoolError(e: unknown): boolean {
  const msg = ((e as { message?: string })?.message ?? '').toLowerCase();
  return POOL_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/** Retry a DB-heavy cron step when Supabase pool is busy (e.g. several crons at :00). */
export async function withPrismaPoolRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      if (!isPrismaPoolError(e) || attempt === maxAttempts - 1) break;
      const delayMs = 1000 * 2 ** attempt;
      console.warn(`[db] ${label}: pool busy, retry in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function createClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          let lastErr: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              return await query(args);
            } catch (e: unknown) {
              lastErr = e;
              if (!isPrismaPoolError(e) || attempt === 2) break;
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          }
          throw lastErr;
        },
      },
    },
  });
}

type ExtPrismaClient = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma: ExtPrismaClient };

export const prisma = (
  globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient())
) as unknown as PrismaClient;
