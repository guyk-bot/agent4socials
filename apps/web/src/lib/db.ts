import { PrismaClient } from '@prisma/client';

// Supabase/Neon pooler (port 6543 or host containing "pooler") reuses connections; Prisma's prepared statements then cause
// "Invalid findFirst() invocation" or "prepared statement already exists". Adding pgbouncer=true disables prepared statements.
const url = process.env.DATABASE_URL;
const isPooler = url && (/[:.]6543[/?]|:6543$/.test(url) || /\.pooler\.|pooler\.supabase\.com/i.test(url));
if (isPooler && !url.includes('pgbouncer=true')) {
  process.env.DATABASE_URL = url.includes('?') ? url.replace('?', '?pgbouncer=true&') : `${url}?pgbouncer=true`;
}

/** True if DATABASE_URL looks like direct Postgres (port 5432) or Supabase without pooler – will hit "max connections" on serverless. */
export const databaseUrlLooksDirect =
  typeof url === 'string' &&
  (url.includes(':5432/') || (url.includes('supabase') && !url.includes('6543') && !/pooler\.|pooler\.supabase/i.test(url)));

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
