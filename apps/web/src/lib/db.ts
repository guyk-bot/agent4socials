import { PrismaClient } from '@prisma/client';

// ─── Connection URL hardening ───────────────────────────────────────────────
// pgbouncer=true  – disable prepared statements (required for transaction-mode poolers)
// connection_limit=1 – one connection per serverless invocation (Vercel best practice)
// pool_timeout=5  – FAIL FAST: don't wait 30s for a pool slot and hang the whole route
// connect_timeout=15 – don't wait forever for TCP handshake
const rawUrl = process.env.DATABASE_URL;
if (rawUrl && /^postgres(ql)?:\/\//i.test(rawUrl)) {
  let fixedUrl = rawUrl;
  const addParam = (u: string, param: string) =>
    u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
  if (!fixedUrl.includes('pgbouncer=true')) fixedUrl = addParam(fixedUrl, 'pgbouncer=true');
  if (!fixedUrl.includes('connection_limit=')) fixedUrl = addParam(fixedUrl, 'connection_limit=1');
  // Replace any previous pool_timeout value with the fast-fail value
  fixedUrl = fixedUrl.replace(/pool_timeout=\d+/, 'pool_timeout=5');
  if (!fixedUrl.includes('pool_timeout=')) fixedUrl = addParam(fixedUrl, 'pool_timeout=5');
  fixedUrl = fixedUrl.replace(/connect_timeout=\d+/, 'connect_timeout=15');
  if (!fixedUrl.includes('connect_timeout=')) fixedUrl = addParam(fixedUrl, 'connect_timeout=15');
  process.env.DATABASE_URL = fixedUrl;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof rawUrl === 'string' &&
  (rawUrl.includes(':5432/') || (rawUrl.includes('supabase') && !rawUrl.includes('6543') && !/pooler\.|pooler\.supabase/i.test(rawUrl)));

// ─── Connection-error retry via $extends (Prisma 5 supported) ───────────────
// $use is deprecated; $extends is the correct approach in Prisma 5.
// We intercept P1017 ("Server has closed the connection"), P1001 ("Can't reach
// database server"), and P2024 ("Timed out fetching a new connection") and retry
// once after a short pause.  This handles the common serverless case where Supabase
// drops idle connections between warm invocations.
function createClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (e: unknown) {
            const code = (e as { code?: string })?.code;
            if (code === 'P1017' || code === 'P1001' || code === 'P2024') {
              // Dead or exhausted connection — disconnect so the next attempt reconnects fresh.
              try { await base.$disconnect(); } catch { /* ignore */ }
              await new Promise((r) => setTimeout(r, 300));
              return await query(args);
            }
            throw e;
          }
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
