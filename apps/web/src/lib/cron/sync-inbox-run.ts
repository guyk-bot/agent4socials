/**
 * Background inbox message pre-warm (used by /api/cron/sync-inbox).
 * Stores DM threads in AppKv so Inbox opens are instant from the DB.
 */
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  isInboxMessagesCached,
  setInboxMessagesInDb,
} from '@/lib/inbox/inbox-db-cache';
import {
  loadInstagramBusinessConversationMessages,
  loadFacebookGraphConversationMessages,
} from '@/lib/inbox/load-meta-conversation-messages';
import { noteMetaUsageFromHeaders, isMetaNonCriticalThrottled } from '@/lib/meta-usage-guard';

const SYNC_INBOX_BUDGET_MS = parseInt(process.env.SYNC_INBOX_BUDGET_MS ?? '50000', 10);
const MAX_CONVS_PER_ACCOUNT = parseInt(process.env.SYNC_INBOX_MAX_CONVS ?? '60', 10);
const SYNC_INBOX_PARALLEL = parseInt(process.env.SYNC_INBOX_PARALLEL ?? '4', 10);
const fbBase = facebookGraphBaseUrl;
const igBase = 'https://graph.instagram.com/v25.0';

type ConvItem = { id: string; updated_time?: string };

export type SyncInboxResult = {
  accountCount: number;
  results: Record<string, { synced: number; skipped: number; errors: number }>;
};

async function resolveLinkedPageId(
  userId: string,
  accessToken: string,
  credLinkedPageId?: string
): Promise<string | null> {
  if (credLinkedPageId) return credLinkedPageId;
  if (!accessToken) return null;
  try {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', accessToken },
      select: { platformUserId: true },
    });
    return fb?.platformUserId ?? null;
  } catch {
    return null;
  }
}

async function fetchConversationIds(
  account: {
    userId: string;
    platform: string;
    platformUserId: string;
    accessToken: string;
    credentialsJson: unknown;
  }
): Promise<ConvItem[]> {
  const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string };

  const isInstagram = account.platform === 'INSTAGRAM';
  const isInstagramBusinessLogin =
    isInstagram && cred.loginMethod === 'instagram_business';
  const linkedPageId = isInstagram && !isInstagramBusinessLogin
    ? await resolveLinkedPageId(account.userId, account.accessToken, cred.linkedPageId)
    : cred.linkedPageId ?? null;

  let url: string;
  let token: string;
  const params: Record<string, string> = { fields: 'id,updated_time', limit: '100' };

  if (isInstagramBusinessLogin) {
    url = `${igBase}/me/conversations`;
    token = account.accessToken;
  } else if (isInstagram && linkedPageId) {
    url = `${fbBase}/${linkedPageId}/conversations`;
    token = account.accessToken;
    params.platform = 'instagram';
  } else if (isInstagram) {
    url = `${igBase}/me/conversations`;
    token = account.accessToken;
  } else if (account.platform === 'FACEBOOK') {
    url = `${fbBase}/${account.platformUserId}/conversations`;
    token = account.accessToken;
  } else {
    return [];
  }

  params.access_token = token;
  try {
    const res = await axios.get<{ data?: ConvItem[]; error?: { message: string } }>(url, {
      params,
      timeout: 15_000,
    });
    noteMetaUsageFromHeaders(res.headers);
    if (res.data?.error) return [];
    return res.data?.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Warm the DB message cache for a single user's Instagram/Facebook accounts.
 * Called by POST /api/inbox/warm on page load to ensure all conversations are
 * served instantly regardless of when the external sync-inbox cron last ran.
 */
export async function runSyncInboxForUser(userId: string): Promise<SyncInboxResult> {
  const deadline = Date.now() + SYNC_INBOX_BUDGET_MS;
  const results: Record<string, { synced: number; skipped: number; errors: number }> = {};

  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId,
      platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
      accessToken: { not: '' },
    },
    select: {
      id: true,
      userId: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      credentialsJson: true,
    },
  });

  return _syncAccounts(accounts, deadline, results);
}

type AccountRow = {
  id: string; userId: string; platform: string;
  platformUserId: string; accessToken: string; credentialsJson: unknown;
};

async function _syncAccounts(
  accounts: AccountRow[],
  deadline: number,
  results: Record<string, { synced: number; skipped: number; errors: number }>
): Promise<SyncInboxResult> {
  for (const account of accounts) {
    if (Date.now() >= deadline) break;
    if (isMetaNonCriticalThrottled()) break;

    const key = `${account.platform}:${account.id}`;
    results[key] = { synced: 0, skipped: 0, errors: 0 };

    const convs = await fetchConversationIds(account);
    if (convs.length === 0) continue;

    const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
      ? account.credentialsJson : {}) as { loginMethod?: string; linkedPageId?: string };
    const isInstagramBusinessLogin =
      account.platform === 'INSTAGRAM' && cred.loginMethod === 'instagram_business';
    const token = account.accessToken;
    const linkedPageIdForMsgs =
      account.platform === 'INSTAGRAM' && !isInstagramBusinessLogin
        ? await resolveLinkedPageId(account.userId, account.accessToken, cred.linkedPageId)
        : cred.linkedPageId ?? null;
    const ourIds = new Set<string>(
      [account.platformUserId, linkedPageIdForMsgs].filter((x): x is string => !!x)
    );

    const convBatch = convs
      .slice(0, MAX_CONVS_PER_ACCOUNT)
      .sort((a, b) => (b.updated_time ?? '').localeCompare(a.updated_time ?? ''));

    const syncOneConv = async (conv: ConvItem): Promise<void> => {
      if (Date.now() >= deadline) return;
      if (isMetaNonCriticalThrottled()) return;

      const already = await isInboxMessagesCached(account.id, conv.id);
      if (already) {
        results[key].skipped++;
        return;
      }

      try {
        let msgs: Awaited<ReturnType<typeof loadFacebookGraphConversationMessages>>;
        if (isInstagramBusinessLogin) {
          msgs = await loadInstagramBusinessConversationMessages(conv.id, token, ourIds);
        } else {
          msgs = await loadFacebookGraphConversationMessages(
            conv.id,
            token,
            ourIds,
            account.platform === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK'
          );
        }

        if (!msgs.error) {
          await setInboxMessagesInDb(account.id, conv.id, msgs.messages);
          results[key].synced++;
        }
      } catch {
        results[key].errors++;
      }
    };

    for (let i = 0; i < convBatch.length; i += SYNC_INBOX_PARALLEL) {
      if (Date.now() >= deadline) break;
      if (isMetaNonCriticalThrottled()) break;
      const chunk = convBatch.slice(i, i + SYNC_INBOX_PARALLEL);
      await Promise.all(chunk.map((conv) => syncOneConv(conv)));
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { accountCount: accounts.length, results };
}

export async function runSyncInbox(): Promise<SyncInboxResult> {
  const deadline = Date.now() + SYNC_INBOX_BUDGET_MS;
  const results: Record<string, { synced: number; skipped: number; errors: number }> = {};

  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
      accessToken: { not: '' },
    },
    select: {
      id: true, userId: true, platform: true,
      platformUserId: true, accessToken: true, credentialsJson: true,
    },
  });

  return _syncAccounts(accounts, deadline, results);
}
