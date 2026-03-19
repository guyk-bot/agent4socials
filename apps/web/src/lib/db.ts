import { PrismaClient } from '@prisma/client';

// Supabase (and similar poolers) often run in transaction mode; Prisma's prepared statements then cause
// "Invalid findFirst() invocation" or "prepared statement already exists". Adding pgbouncer=true disables prepared statements.
// Apply to any Supabase URL so it works whether the user set the direct (5432) or pooler (6543) URL in Vercel.
const url = process.env.DATABASE_URL;
const isSupabase = url && (/supabase\.com|supabase\.co/i.test(url));
if (isSupabase && !url.includes('pgbouncer=true')) {
  process.env.DATABASE_URL = url.includes('?') ? url.replace('?', '?pgbouncer=true&') : `${url}?pgbouncer=true`;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof url === 'string' &&
  (url.includes(':5432/') || (url.includes('supabase') && !url.includes('6543') && !/pooler\.|pooler\.supabase/i.test(url)));

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
