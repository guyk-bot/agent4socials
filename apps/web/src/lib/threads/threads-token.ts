import { prisma } from '@/lib/db';
import {
  exchangeThreadsLongLivedToken,
  probeThreadsAccessToken,
  refreshThreadsLongLivedToken,
} from '@/lib/threads/threads-api';

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
    m.includes('session expired') ||
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

async function threadsTokenProfileValid(token: string): Promise<boolean> {
  const probe = await probeThreadsAccessToken(token, 12_000);
  if (probe.valid) return true;
  if (probe.httpStatus && probe.httpStatus >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    return (await probeThreadsAccessToken(token, 12_000)).valid;
  }
  return false;
}

async function resolveThreadsToken(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  opts?: { forceRefresh?: boolean }
): Promise<string> {
  let token = account.accessToken.trim();
  if (!token) throw new ThreadsReconnectRequiredError();

  if (await threadsTokenProfileValid(token)) {
    return token;
  }

  const lastProbe = await probeThreadsAccessToken(token, 12_000);

  const upgradeToken = async (): Promise<string | null> => {
    const next = await tryRefreshThreadsToken(token);
    if (!next) return null;
    if (await threadsTokenProfileValid(next.accessToken)) {
      return persistThreadsToken(account.id, next.accessToken, next.expiresInSec);
    }
    token = next.accessToken;
    return null;
  };

  const upgraded = await upgradeToken();
  if (upgraded) return upgraded;

  if (await threadsTokenProfileValid(token)) {
    return token;
  }

  if (opts?.forceRefresh) {
    const forced = await upgradeToken();
    if (forced) return forced;
  }

  const lastChance = await tryRefreshThreadsToken(token);
  if (lastChance && (await threadsTokenProfileValid(lastChance.accessToken))) {
    return persistThreadsToken(account.id, lastChance.accessToken, lastChance.expiresInSec);
  }

  const reconnectMsg =
    lastProbe.apiError && isThreadsInvalidTokenMessage(lastProbe.apiError)
      ? `${lastProbe.apiError} Disconnect and reconnect Threads in Accounts, then try Allow again.`
      : lastProbe.apiError
        ? `Threads: ${lastProbe.apiError}`
        : 'Threads access token is invalid or expired. Disconnect and reconnect Threads in Accounts, then try again.';
  await markThreadsNeedsReconnect(account.id, reconnectMsg);
  throw new ThreadsReconnectRequiredError(reconnectMsg);
}

export async function getValidThreadsToken(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  opts?: { forceRefresh?: boolean }
): Promise<string> {
  return resolveThreadsToken(account, opts);
}
