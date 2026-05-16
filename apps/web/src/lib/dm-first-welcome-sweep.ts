import { Prisma } from '@prisma/client';
import axios from 'axios';
import { prisma, withPrismaPoolRetry } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { automationFirstIncomingReady, runFirstWelcomeMaybe } from '@/lib/dm-first-welcome';
import { loadConversationForFirstWelcome } from '@/lib/inbox/load-conversation-for-first-welcome';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';
import { refreshTwitterToken } from '@/lib/twitter-refresh';

const fbBaseUrl = facebookGraphBaseUrl;

/** Only scan threads touched recently so each cron run stays bounded. */
/** Threads to scan per cron run (must be ≥ freshness window in dm-first-welcome.ts). */
const RECENT_THREAD_ACTIVITY_MAX_AGE_MS = 20 * 60 * 1000;
const MAX_CONVERSATIONS_PER_ACCOUNT = 25;
const MAX_TOTAL_CONVERSATIONS_PER_RUN = 150;
const SWEEP_BUDGET_MS = Number.parseInt(process.env.DM_FIRST_WELCOME_SWEEP_BUDGET_MS ?? '55000', 10);

type ConvItem = { id: string; updated_time?: string };

async function listRecentMetaConversationIds(
  userId: string,
  account: { platform: string; platformUserId: string; accessToken: string; credentialsJson: unknown }
): Promise<string[]> {
  const isInstagram = account.platform === 'INSTAGRAM';
  const token = (account.accessToken || '').trim();
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string };

  const isInstagramBusinessLogin = isInstagram && credJson.loginMethod === 'instagram_business';
  let linkedPageId: string | false = false;
  if (isInstagram && !isInstagramBusinessLogin) {
    linkedPageId = credJson.linkedPageId || false;
    if (!linkedPageId && token) {
      const fb = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', accessToken: token },
        select: { platformUserId: true },
      });
      if (fb?.platformUserId) linkedPageId = fb.platformUserId;
    }
  }

  const conversationsPath = isInstagramBusinessLogin
    ? 'https://graph.instagram.com/v25.0/me/conversations'
    : isInstagram && linkedPageId
      ? `${fbBaseUrl}/${linkedPageId}/conversations`
      : isInstagram
        ? 'https://graph.instagram.com/v25.0/me/conversations'
        : `${fbBaseUrl}/${account.platformUserId}/conversations`;

  const activeToken = isInstagramBusinessLogin ? token : token;
  const queryParams: Record<string, string> = {
    fields: 'id,updated_time',
    access_token: activeToken,
    limit: '50',
  };
  if (isInstagram && !isInstagramBusinessLogin) queryParams.platform = 'instagram';

  const res = await axios.get<{ data?: ConvItem[]; error?: { message?: string } }>(conversationsPath, {
    params: queryParams,
    timeout: 45_000,
  });
  if (res.data?.error) return [];
  const raw = res.data?.data ?? [];
  const cutoff = Date.now() - RECENT_THREAD_ACTIVITY_MAX_AGE_MS;
  return raw
    .filter((c) => c.updated_time && new Date(c.updated_time).getTime() >= cutoff)
    .map((c) => c.id);
}

async function listRecentTwitterConversationIds(account: {
  id: string;
  platformUserId: string;
  accessToken: string;
  refreshToken: string | null;
  credentialsJson: unknown;
}): Promise<string[]> {
  const ourId = String(account.platformUserId ?? '');
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as Record<string, unknown>;
  const oauth1UserToken = credJson.twitterOAuth1AccessToken as string | undefined;
  const oauth1UserSecret = credJson.twitterOAuth1AccessTokenSecret as string | undefined;
  const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
  const dmEventsUrl = 'https://api.x.com/2/dm_events';
  let tokenForTwitter = account.accessToken;

  const latestOtherMessageAt = new Map<string, string>();
  await checkAndIncrementXApiUsage(account.id);
  const params: Record<string, string> = {
    'dm_event.fields': 'id,text,sender_id,dm_conversation_id,created_at,participant_ids',
    event_types: 'MessageCreate',
    expansions: 'sender_id',
    'user.fields': 'id,name,username',
    max_results: '100',
  };
  const requestConfig = useOAuth1ForDm
    ? {
        params,
        headers: signTwitterRequest('GET', dmEventsUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, params),
        timeout: 15_000,
        validateStatus: () => true,
      }
    : {
        params,
        headers: { Authorization: `Bearer ${tokenForTwitter}` },
        timeout: 15_000,
        validateStatus: () => true,
      };

  let res = await axios.get<{
    data?: Array<{
      event_type?: string;
      dm_conversation_id?: string;
      created_at?: string;
      sender_id?: string;
    }>;
    error?: { message?: string };
    errors?: Array<{ code?: number }>;
  }>(dmEventsUrl, requestConfig);

  if (res.status === 401 && !useOAuth1ForDm && account.refreshToken && process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
    const firstErr = (res.data as { errors?: Array<{ code?: number }> })?.errors?.[0];
    if (firstErr?.code === 89) {
      try {
        const { accessToken: newAccess, refreshToken: newRefresh } = await refreshTwitterToken(account.refreshToken);
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { accessToken: newAccess, ...(newRefresh ? { refreshToken: newRefresh } : {}) },
        });
        tokenForTwitter = newAccess;
        await checkAndIncrementXApiUsage(account.id);
        res = await axios.get(dmEventsUrl, {
          ...requestConfig,
          headers: { Authorization: `Bearer ${newAccess}` },
        });
      } catch {
        return [];
      }
    }
  }

  if (res.status === 429 || res.data?.error) return [];

  const cutoffIso = new Date(Date.now() - RECENT_THREAD_ACTIVITY_MAX_AGE_MS).toISOString();
  for (const ev of res.data?.data ?? []) {
    if (ev.event_type !== 'MessageCreate' || !ev.dm_conversation_id || !ev.created_at) continue;
    if (!ev.sender_id || ev.sender_id === ourId) continue;
    const cid = ev.dm_conversation_id;
    const prev = latestOtherMessageAt.get(cid);
    if (!prev || ev.created_at.localeCompare(prev) > 0) latestOtherMessageAt.set(cid, ev.created_at);
  }

  const out: string[] = [];
  for (const [cid, ts] of latestOtherMessageAt) {
    if (ts.localeCompare(cutoffIso) >= 0) out.push(cid);
  }
  return out;
}

export type DmFirstWelcomeSweepSummary = {
  usersScanned: number;
  accountsEligible: number;
  conversationsChecked: number;
  errors: string[];
};

/**
 * Background sweep: for users with first-incoming auto-DM configured, load recently active DM threads
 * and run the same send logic as Inbox (within FIRST_WELCOME_MAX_AGE_MS on the latest inbound message).
 * Schedule from external cron every 1 to 2 minutes with X-Cron-Secret.
 */
export async function runDmFirstWelcomeCronSweep(): Promise<DmFirstWelcomeSweepSummary> {
  const deadline = Date.now() + (Number.isFinite(SWEEP_BUDGET_MS) ? SWEEP_BUDGET_MS : 55_000);
  const errors: string[] = [];
  let usersScanned = 0;
  let accountsEligible = 0;
  let conversationsChecked = 0;

  const users = await withPrismaPoolRetry('dm-first-welcome findMany', () =>
    prisma.user.findMany({
    where: {
      automationSettings: { not: Prisma.DbNull },
      socialAccounts: {
        some: {
          platform: { in: ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] },
          accessToken: { not: '' },
        },
      },
    },
    select: {
      id: true,
      automationSettings: true,
      socialAccounts: {
        where: {
          platform: { in: ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] },
          accessToken: { not: '' },
        },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          accessToken: true,
          refreshToken: true,
          credentialsJson: true,
        },
      },
    },
  })
  );

  for (const user of users) {
    if (Date.now() > deadline) break;
    usersScanned++;
    for (const acc of user.socialAccounts) {
      if (Date.now() > deadline) break;
      if (!user.automationSettings || !automationFirstIncomingReady(user.automationSettings, acc.platform)) continue;
      accountsEligible++;

      let convoIds: string[] = [];
      try {
        if (acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK') {
          convoIds = await listRecentMetaConversationIds(user.id, acc);
        } else if (acc.platform === 'TWITTER') {
          convoIds = await listRecentTwitterConversationIds(acc);
        }
      } catch (e) {
        errors.push(`${acc.id}: ${(e as Error)?.message ?? String(e)}`.slice(0, 200));
        continue;
      }

      for (const conversationId of convoIds.slice(0, MAX_CONVERSATIONS_PER_ACCOUNT)) {
        if (conversationsChecked >= MAX_TOTAL_CONVERSATIONS_PER_RUN) {
          return { usersScanned, accountsEligible, conversationsChecked, errors };
        }
        if (Date.now() > deadline) return { usersScanned, accountsEligible, conversationsChecked, errors };
        if (conversationId.startsWith('mention:')) continue;

        try {
          const loaded = await loadConversationForFirstWelcome(acc, conversationId, user.id);
          if (!loaded.ok) continue;
          conversationsChecked++;
          await runFirstWelcomeMaybe({
            userId: user.id,
            account: {
              id: acc.id,
              platform: acc.platform,
              platformUserId: acc.platformUserId,
              accessToken: acc.accessToken,
              credentialsJson: acc.credentialsJson,
            },
            conversationId,
            messages: loaded.firstWelcomeRows,
            recipientId: loaded.recipientId,
            isInstagramBusinessLogin: loaded.isInstagramBusinessLogin,
          });
        } catch (e) {
          errors.push(`${acc.id}/${conversationId}: ${(e as Error)?.message ?? String(e)}`.slice(0, 200));
        }
      }
    }
  }

  return { usersScanned, accountsEligible, conversationsChecked, errors };
}
