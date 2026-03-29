import { prisma } from '@/lib/db';

/**
 * Production DBs that never ran prisma migrate deploy may lack `PINTEREST` on the Postgres
 * `Platform` enum, causing 22P02 on socialAccount.upsert. Best-effort DDL before Pinterest OAuth save.
 */
export async function ensurePinterestPlatformEnum(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'PINTEREST'`
    );
    return;
  } catch (first: unknown) {
    const msg = String((first as Error)?.message ?? first);
    // PostgreSQL before 15 has no IF NOT EXISTS on ADD VALUE
    if (!msg.includes('syntax error') && !msg.includes('42601')) {
      if (/already exists|duplicate/i.test(msg)) return;
      console.warn('[ensurePinterestPlatformEnum] IF NOT EXISTS:', msg.slice(0, 200));
    }
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Platform" ADD VALUE 'PINTEREST'`);
  } catch (second: unknown) {
    const msg = String((second as Error)?.message ?? second);
    if (/already exists|duplicate|42710/i.test(msg)) return;
    console.warn('[ensurePinterestPlatformEnum] ADD VALUE:', msg.slice(0, 200));
  }
}
