import { prisma } from '@/lib/db';
import type { FacebookSyncSummary } from './types';
import { isFacebookMetricDiscoveryTableAvailable } from './discovery-db';

export async function startFacebookSyncRun(
  socialAccountId: string,
  runKind: string
): Promise<{ id: string } | null> {
  if (!(await isFacebookMetricDiscoveryTableAvailable())) return null;
  try {
    return await prisma.facebookSyncRun.create({
      data: { socialAccountId, runKind },
    });
  } catch {
    return null;
  }
}

export async function finishFacebookSyncRun(
  id: string | null | undefined,
  success: boolean,
  summary?: FacebookSyncSummary,
  errorMessage?: string | null
) {
  if (!id) return;
  try {
    await prisma.facebookSyncRun.update({
      where: { id },
      data: {
        completedAt: new Date(),
        success,
        summary: summary ? (summary as object) : undefined,
        errorMessage: errorMessage ?? undefined,
      },
    });
  } catch {
    /* table missing or row gone; observability is best-effort */
  }
}
