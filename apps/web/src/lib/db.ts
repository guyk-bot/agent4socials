import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// pgbouncer=true  – disable prepared statements (required for transaction-mode poolers)
// connection_limit=1 – one connection per serverless invocation (Vercel best practice)
// pool_timeout=15  – how long Prisma waits for a free slot in its internal pool.
// connect_timeout=10 – don't wait too long for TCP handshake
const rawUrl = process.env.DATABASE_URL;
if (rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl)) {
  let fixedUrl = rawUrl;
  const addParam = (u: string, param: string) =>
    u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
  if (!fixedUrl.includes('pgbouncer=true')) fixedUrl = addParam(fixedUrl, 'pgbouncer=true');
  if (!fixedUrl.includes('connection_limit=')) fixedUrl = addParam(fixedUrl, 'connection_limit=1');
  fixedUrl = fixedUrl.replace(/pool_timeout=\d+/, 'pool_timeout=15');
  if (!fixedUrl.includes('pool_timeout=')) fixedUrl = addParam(fixedUrl, 'pool_timeout=15');
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

function isPoolError(e: unknown): boolean {
  const msg = ((e as { message?: string })?.message ?? '').toLowerCase();
  return POOL_ERROR_PATTERNS.some((p) => msg.includes(p));
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
              if (!isPoolError(e) || attempt === 2) break;
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
