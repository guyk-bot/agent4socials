import { PrismaClient } from '@prisma/client';

// Connection poolers (Supabase, Neon, etc.) often use transaction mode; Prisma's prepared statements then cause
// "Invalid findFirst() invocation" or "prepared statement already exists". Adding pgbouncer=true disables prepared statements.
// Apply to any postgres URL so serverless works without manual pooler config in Vercel.
const url = process.env.DATABASE_URL;
if (url && /^postgres(ql)?:\/\//i.test(url) && !url.includes('pgbouncer=true')) {
  process.env.DATABASE_URL = url.includes('?') ? url.replace('?', '?pgbouncer=true&') : `${url}?pgbouncer=true`;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof url === 'string' &&
  (url.includes(':5432/') || (url.includes('supabase') && !url.includes('6543') && !/pooler\.|pooler\.supabase/i.test(url)));

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
