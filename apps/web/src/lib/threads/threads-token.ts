import { prisma } from '@/lib/db';
import {
  exchangeThreadsLongLivedToken,
  fetchThreadsProfile,
  refreshThreadsLongLivedToken,
} from '@/lib/threads/threads-api';

const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;
/** Short-lived Threads tokens last about 1 hour. */
export const THREADS_SHORT_LIVED_TTL_MS = 55 * 60 * 1000;

export class ThreadsReconnectRequiredError extends Error {
  readonly needsReconnect = true;

  constructor(
    message = 'Threads session expired. Disconnect and reconnect Threads in Accounts, then try again.'
  ) {
    super(message);
    this.name = 'ThreadsReconnectRequiredError';
  }
}

export function isThreadsInvalidTokenMessage(msg: string | undefined | null): boolean {
  const m = (msg ?? '').toLowerCase();
  return (
    m.includes('invalid oauth') ||
    (m.includes('oauth') && m.includes('access token')) ||
    m.includes('session has expired') ||
    m.includes('error validating access token') ||
    m.includes('access token is invalid')
  );
}

async function persistThreadsToken(
  accountId: string,
  accessToken: string,
  expiresInSec: number
): Promise<string> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      lastSyncStatus: 'idle',
      lastSyncError: null,
    },
  });
  return accessToken;
}

export async function markThreadsNeedsReconnect(accountId: string, error: string): Promise<void> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      lastSyncStatus: 'needs_reconnect',
      lastSyncError: error.slice(0, 500),
    },
  });
}

async function tryRefreshThreadsToken(
  currentToken: string
): Promise<{ accessToken: string; expiresInSec: number } | null> {
  const refreshed = await refreshThreadsLongLivedToken(currentToken);
  if (refreshed?.accessToken) {
    return {
      accessToken: refreshed.accessToken,
      expiresInSec: refreshed.expiresInSec,
    };
  }

  // Short-lived tokens cannot be refreshed; exchange to long-lived if still valid.
  const exchanged = await exchangeThreadsLongLivedToken(currentToken);
  if (exchanged?.accessToken) {
    return {
      accessToken: exchanged.accessToken,
      expiresInSec: exchanged.expiresInSec,
    };
  }
  return null;
}

async function resolveThreadsToken(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  opts?: { forceRefresh?: boolean }
): Promise<string> {
  let token = account.accessToken.trim();
  if (!token) throw new ThreadsReconnectRequiredError();

  const expiresAt = account.expiresAt;
  const expired = !expiresAt || expiresAt.getTime() <= Date.now();
  const nearExpiry =
    Boolean(expiresAt) && expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (opts?.forceRefresh || expired || nearExpiry) {
    const next = await tryRefreshThreadsToken(token);
    if (next) {
      const profile = await fetchThreadsProfile(next.accessToken, 12_000);
      if (profile?.id) {
        return persistThreadsToken(account.id, next.accessToken, next.expiresInSec);
      }
      token = next.accessToken;
    }
  }

  const profile = await fetchThreadsProfile(token, 12_000);
  if (profile?.id) return token;

  const next = await tryRefreshThreadsToken(token);
  if (next) {
    const profile2 = await fetchThreadsProfile(next.accessToken, 12_000);
    if (profile2?.id) {
      return persistThreadsToken(account.id, next.accessToken, next.expiresInSec);
    }
  }

  const reconnectMsg =
    'Threads access token is invalid or expired. Disconnect and reconnect Threads in Accounts, then try again.';
  await markThreadsNeedsReconnect(account.id, reconnectMsg);
  throw new ThreadsReconnectRequiredError(reconnectMsg);
}

export async function getValidThreadsToken(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  opts?: { forceRefresh?: boolean }
): Promise<string> {
  return resolveThreadsToken(account, opts);
}
