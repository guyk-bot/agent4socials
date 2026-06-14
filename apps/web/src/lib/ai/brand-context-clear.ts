import { prisma } from '@/lib/db';
import {
  EMPTY_BRAND_CONTEXT,
  mergeBrandContextOnSave,
  type BrandContextRecord,
} from '@/lib/brand-context-utils';

const BRAND_CONTEXT_KEYS = Object.keys(EMPTY_BRAND_CONTEXT) as (keyof BrandContextRecord)[];

/** Wipe all brand context fields in the database for a user. */
export async function clearBrandContextForUser(userId: string): Promise<BrandContextRecord> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { brandContext: true },
  });
  const cleared = mergeBrandContextOnSave(
    existing?.brandContext,
    EMPTY_BRAND_CONTEXT,
    BRAND_CONTEXT_KEYS
  );
  await prisma.user.update({
    where: { id: userId },
    data: { brandContext: cleared as object },
  });
  return cleared;
}
