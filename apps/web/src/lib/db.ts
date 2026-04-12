import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// pgbouncer=true  – disable prepared statements (required for transaction-mode poolers)
// connection_limit=1 – one connection per serverless invocation (Vercel best practice)
// pool_timeout=15  – how long Prisma waits for a free slot in its internal pool.
//                    Set higher than the old 8s because the global API limiter (api.ts)
//                    now caps concurrent requests to 4, so pool pressure is much lower.
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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (globalForPrisma.prisma = new PrismaClient());
