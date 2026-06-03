import { prisma } from '@/lib/db';
import { revokeLinkedInAccessToken } from '@/lib/linkedin/revoke-access-token';

type PendingPayload = {
  accessToken?: string;
};

/**
 * Revoke stored LinkedIn tokens and clear pending sessions so the next OAuth
 * shows linkedin.com instead of silently reusing an existing grant.
 */
export async function prepareLinkedInOAuthConnect(userId: string): Promise<void> {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId, platform: 'LINKEDIN', accessToken: { not: '' } },
    select: { accessToken: true },
  });
  for (const account of accounts) {
    if (account.accessToken?.trim()) {
      await revokeLinkedInAccessToken(account.accessToken).catch(() => {});
    }
  }

  const pendings = await prisma.pendingConnection.findMany({
    where: { userId, platform: 'LINKEDIN' },
    select: { id: true, payload: true },
  });
  for (const pending of pendings) {
    const payload = (pending.payload ?? {}) as PendingPayload;
    if (payload.accessToken?.trim()) {
      await revokeLinkedInAccessToken(payload.accessToken).catch(() => {});
    }
  }

  if (pendings.length > 0) {
    await prisma.pendingConnection.deleteMany({
      where: { id: { in: pendings.map((p) => p.id) } },
    });
  }
}
