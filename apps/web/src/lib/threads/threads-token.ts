import { prisma } from '@/lib/db';
import { refreshThreadsLongLivedToken } from '@/lib/threads/threads-api';

const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;

export async function getValidThreadsToken(account: {
  id: string;
  accessToken: string;
  expiresAt?: Date | null;
}): Promise<string> {
  const expiresAt = account.expiresAt;
  const needsRefresh =
    !expiresAt || expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
  if (!needsRefresh) return account.accessToken;

  const refreshed = await refreshThreadsLongLivedToken(account.accessToken);
  if (!refreshed) return account.accessToken;

  const expiresAtNew = new Date(Date.now() + refreshed.expiresInSec * 1000);
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { accessToken: refreshed.accessToken, expiresAt: expiresAtNew },
  });
  return refreshed.accessToken;
}
