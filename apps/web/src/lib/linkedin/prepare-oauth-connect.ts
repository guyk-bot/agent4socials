import { prisma } from '@/lib/db';
import { revokeLinkedInAccessToken } from '@/lib/linkedin/revoke-access-token';

type PendingPayload = {
  accessToken?: string;
};

export type PrepareLinkedInOAuthConnectOptions = {
  /** When reconnecting one row from Accounts, revoke only that token. */
  reconnectAccountId?: string;
};

/**
 * Clear stale LinkedIn pending sessions before OAuth.
 * Never revokes every stored SocialAccount token: other brand workspaces keep working.
 */
export async function prepareLinkedInOAuthConnect(
  userId: string,
  options?: PrepareLinkedInOAuthConnectOptions
): Promise<void> {
  const reconnectAccountId = options?.reconnectAccountId?.trim();
  if (reconnectAccountId) {
    const account = await prisma.socialAccount.findFirst({
      where: { userId, id: reconnectAccountId, platform: 'LINKEDIN' },
      select: { accessToken: true },
    });
    if (account?.accessToken?.trim()) {
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
