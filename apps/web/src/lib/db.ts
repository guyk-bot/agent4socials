import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// 1. pgbouncer=true: disable prepared statements (required for transaction-mode poolers)
// 2. connection_limit=1: Vercel serverless best practice — one connection per cold start
// 3. pool_timeout=30: don't wait forever for a pool slot
// 4. connect_timeout=30: don't wait forever to establish a connection
const rawUrl = process.env.DATABASE_URL;
if (rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl)) {
  let fixedUrl = rawUrl;
  const addParam = (u: string, param: string) =>
    u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
  if (!fixedUrl.includes('pgbouncer=true')) fixedUrl = addParam(fixedUrl, 'pgbouncer=true');
  if (!fixedUrl.includes('connection_limit=')) fixedUrl = addParam(fixedUrl, 'connection_limit=1');
  if (!fixedUrl.includes('pool_timeout=')) fixedUrl = addParam(fixedUrl, 'pool_timeout=30');
  if (!fixedUrl.includes('connect_timeout=')) fixedUrl = addParam(fixedUrl, 'connect_timeout=30');
  process.env.DATABASE_URL = fixedUrl;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof rawUrl === 'string' &&
  (rawUrl.includes(':5432/') || (rawUrl.includes('supabase') && !rawUrl.includes('6543') && !/pooler\.|pooler\.supabase/i.test(rawUrl)));

// ─── P1017 retry middleware ──────────────────────────────────────────────────
// Supabase / PostgreSQL drops idle connections; the global singleton can hold a
// dead socket between cold-start serverless invocations.  Intercept P1017
// ("Server has closed the connection") and P1001 ("Can't reach database server")
// with a single reconnect-and-retry so callers never see the error.
function createClient(): PrismaClient {
  const client = new PrismaClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$use(async (params: unknown, next: (p: unknown) => Promise<unknown>) => {
    try {
      return await next(params);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'P1017' || code === 'P1001') {
        // Dead socket — disconnect, wait briefly, then retry once.
        try { await client.$disconnect(); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 150));
        try { await client.$connect(); } catch { /* ignore — next() will surface real error */ }
        return await next(params);
      }
      throw e;
    }
  });

  return client;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
