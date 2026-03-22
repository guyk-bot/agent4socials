import { prisma } from '@/lib/db';
import type { FacebookSyncSummary } from './types';

export async function startFacebookSyncRun(socialAccountId: string, runKind: string) {
  return prisma.facebookSyncRun.create({
    data: { socialAccountId, runKind },
  });
}

export async function finishFacebookSyncRun(
  id: string,
  success: boolean,
  summary?: FacebookSyncSummary,
  errorMessage?: string | null
) {
  await prisma.facebookSyncRun.update({
    where: { id },
    data: {
      completedAt: new Date(),
      success,
      summary: summary ? (summary as object) : undefined,
      errorMessage: errorMessage ?? undefined,
    },
  });
}
