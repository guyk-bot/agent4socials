import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// pgbouncer=true  – disable prepared statements (required for transaction-mode poolers)
// connection_limit=1 – one connection per serverless invocation (Vercel best practice)
// pool_timeout – how long Prisma waits for a free slot (default 8s = fail fast under burst).
// Override with DATABASE_POOL_TIMEOUT_SEC (integer 5–120).
// connect_timeout=10 – don't wait too long for TCP handshake
const rawUrl = process.env.DATABASE_URL;
const poolTimeoutSec = (() => {
  const v = process.env.DATABASE_POOL_TIMEOUT_SEC;
  if (v == null || v === '') return 8;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 5 && n <= 120 ? n : 8;
})();
if (rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl)) {
  let fixedUrl = rawUrl;
  const addParam = (u: string, param: string) =>
    u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
  if (!fixedUrl.includes('pgbouncer=true')) fixedUrl = addParam(fixedUrl, 'pgbouncer=true');
  if (!fixedUrl.includes('connection_limit=')) fixedUrl = addParam(fixedUrl, 'connection_limit=1');
  fixedUrl = fixedUrl.replace(/pool_timeout=\d+/, `pool_timeout=${poolTimeoutSec}`);
  if (!fixedUrl.includes('pool_timeout=')) fixedUrl = addParam(fixedUrl, `pool_timeout=${poolTimeoutSec}`);
  fixedUrl = fixedUrl.replace(/connect_timeout=\d+/, 'connect_timeout=10');
  if (!fixedUrl.includes('connect_timeout=')) fixedUrl = addParam(fixedUrl, 'connect_timeout=10');
  process.env.DATABASE_URL = fixedUrl;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof rawUrl === 'string' &&
  (rawUrl.includes(':5432/') || (rawUrl.includes('supabase') && !rawUrl.includes('6543') && !/pooler\.|pooler\.supabase/i.test(rawUrl)));

// ─── Connection-error retry via $extends (Prisma 5 supported) ───────────────
// $use is deprecated; $extends is the correct approach in Prisma 5.
//
// Prisma 5 throws connection errors in two ways:
//   PrismaClientKnownRequestError  → has .code         (e.g. "P1017")
//   PrismaClientInitializationError → has .errorCode   (e.g. "P1017", "P1001")
// We check both, plus fall back to message-pattern matching so nothing slips through.
const CONNECTION_ERROR_CODES = new Set(['P1017', 'P1001', 'P2024']);
const CONNECTION_MSG_PATTERNS = [
  'server has closed the connection',
  "can't reach database server",
  'connection pool timed out',
  'connection refused',
  'timed out fetching a new connection',
  'econnrefused',
  'econnreset',
  'connection terminated unexpectedly',
  'unable to check out connection from the pool',
  'checkout from the pool',
];

function isConnectionError(e: unknown): boolean {
  const err = e as { code?: string; errorCode?: string; message?: string };
  if (err.code && CONNECTION_ERROR_CODES.has(err.code)) return true;
  if (err.errorCode && CONNECTION_ERROR_CODES.has(err.errorCode)) return true;
  const msg = (err.message ?? '').toLowerCase();
  return CONNECTION_MSG_PATTERNS.some((p) => msg.includes(p));
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
              if (!isConnectionError(e) || attempt === 2) break;
              try { await base.$disconnect(); } catch { /* ignore */ }
              await new Promise((r) => setTimeout(r, 250 + attempt * 350));
              try { await base.$connect(); } catch { /* ignore */ }
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
