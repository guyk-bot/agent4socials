import { prisma } from '@/lib/db';

let _threadsEnumEnsured = false;

/** Best-effort: add THREADS to Postgres Platform enum before OAuth upsert. */
export async function ensureThreadsPlatformEnum(): Promise<void> {
  if (_threadsEnumEnsured || process.env.SKIP_TABLE_ENSURE === '1') return;
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'THREADS'`);
    _threadsEnumEnsured = true;
    return;
  } catch (first: unknown) {
    const msg = String((first as Error)?.message ?? first);
    if (!msg.includes('syntax error') && !msg.includes('42601')) {
      if (/already exists|duplicate/i.test(msg)) {
        _threadsEnumEnsured = true;
        return;
      }
      console.warn('[ensureThreadsPlatformEnum] IF NOT EXISTS:', msg.slice(0, 200));
    }
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Platform" ADD VALUE 'THREADS'`);
    _threadsEnumEnsured = true;
  } catch (second: unknown) {
    const msg = String((second as Error)?.message ?? second);
    if (/already exists|duplicate|42710/i.test(msg)) {
      _threadsEnumEnsured = true;
      return;
    }
    console.warn('[ensureThreadsPlatformEnum] ADD VALUE:', msg.slice(0, 200));
  }
}
