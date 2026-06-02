/**
 * Instagram DM inbox only (Messages tab). Does not touch comments, analytics, or Facebook Messenger.
 */
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { clearMetaThrottle, noteMetaRateLimitError, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';
import { runMetaGraphRequest } from '@/lib/meta-graph-queue';
import {
  getInboxConversationListFromDb,
  setInboxConversationListInDb,
  type InboxConversationListItem,
} from '@/lib/inbox/inbox-db-cache';
import { enrichConversationListFromMessageCache } from '@/lib/inbox/enrich-conversations-from-messages';
import { mergeInboxProfileCacheIntoConversations } from '@/lib/inbox/resolve-inbox-sender-profile';
import { resolveInstagramInboxPageContext } from '@/lib/inbox/resolve-instagram-inbox-token';

const IG_GRAPH = 'https://graph.instagram.com/v25.0';
/** Light list: no profile_pic fan-out (that was timing out on Meta). */
const LIST_FIELDS = 'id,updated_time,participants{id,username,name}';
const PER_REQUEST_TIMEOUT_MS = 18_000;
const TOTAL_BUDGET_MS = 48_000;

type ConvParticipant = { id?: string; name?: string; username?: string };
type ConvItem = {
  id: string;
  updated_time?: string;
  participants?: { data?: ConvParticipant[] };
};
type ConvApiResponse = {
  data?: ConvItem[];
  paging?: { next?: string };
  error?: { message: string; code?: number };
};

export type InstagramDmLoadResult = {
  conversations: InboxConversationListItem[];
  error?: string;
  emptyHint?: string;
  fromCache?: boolean;
  stale?: boolean;
  debug?: Record<string, unknown>;
};

type AccountRow = {
  id: string;
  platform: string;
  platformUserId: string;
  username: string | null;
  accessToken: string | null;
  credentialsJson: unknown;
};

type MetaAttempt = {
  label: string;
  url: string;
  params: Record<string, string>;
};

function isMetaRateLimit(e: unknown): boolean {
  const err = e as { response?: { status?: number; data?: { error?: { code?: number; message?: string } } } };
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const msg = (err?.response?.data?.error?.message ?? '').toLowerCase();
  return status === 429 || code === 4 || code === 17 || code === 32 || msg.includes('rate limit');
}

async function fetchOnePage(attempt: MetaAttempt): Promise<ConvItem[]> {
  const res = await runMetaGraphRequest(
    `ig_dm_${attempt.label}`,
    () =>
      axios.get<ConvApiResponse>(attempt.url, {
        params: attempt.params,
        timeout: PER_REQUEST_TIMEOUT_MS,
      }),
    { allowWhenThrottled: true }
  );
  noteMetaUsageFromHeaders(res.headers);
  if (res.data?.error) {
    const msg = res.data.error.message ?? 'Meta API error';
    if (/rate.?limit|too many/i.test(msg)) noteMetaRateLimitError();
    throw Object.assign(new Error(msg), { metaError: res.data.error });
  }
  return res.data?.data ?? [];
}

function mapThreads(
  raw: ConvItem[],
  ourIds: Set<string>,
  ourUsernames: Set<string>
): InboxConversationListItem[] {
  return raw.map((c) => {
    const participants = c.participants?.data ?? [];
    const others = participants.filter((p) => {
      if (!p.id) return true;
      if (ourIds.has(p.id)) return false;
      if (p.username && ourUsernames.has(p.username.toLowerCase())) return false;
      return true;
    });
    const sendersData = others.length > 0 ? others : participants;
    const senders = sendersData.map((s) => ({
      id: s.id,
      name: s.name,
      username: s.username,
      pictureUrl: null as string | null,
    }));
    return {
      id: c.id,
      updatedTime: c.updated_time ?? null,
      senders,
      messageCount: undefined,
    };
  });
}

function permissionErrorMessage(isBusinessLogin: boolean): string {
  return isBusinessLogin
    ? 'Instagram inbox needs instagram_business_manage_messages. Add your Instagram account as a tester under Roles in Meta App Dashboard, then reconnect Instagram.'
    : 'Instagram inbox needs instagram_manage_messages (Advanced Access in Meta App Dashboard). Reconnect via Facebook and choose the Page linked to your Instagram profile.';
}

async function finalizeList(
  accountId: string,
  list: InboxConversationListItem[]
): Promise<InboxConversationListItem[]> {
  let out = (await mergeInboxProfileCacheIntoConversations('instagram', list)) as InboxConversationListItem[];
  out = await enrichConversationListFromMessageCache(accountId, 'instagram', out);
  if (out.length > 0) void setInboxConversationListInDb(accountId, out);
  return out;
}

function buildAttempts(args: {
  account: AccountRow;
  pageCtx: { pageId: string; pageAccessToken: string } | null;
  facebookPageRow: AccountRow | null;
  facebookPageOnly: boolean;
}): MetaAttempt[] {
  const { account, pageCtx, facebookPageRow, facebookPageOnly } = args;
  const token = (account.accessToken || '').trim();
  const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string };

  const isIgRow = account.platform === 'INSTAGRAM';
  const isBusinessLogin = isIgRow && cred.loginMethod === 'instagram_business';
  const attempts: MetaAttempt[] = [];
  const baseParams = (accessToken: string, platform?: string) => {
    const p: Record<string, string> = {
      fields: LIST_FIELDS,
      access_token: accessToken,
      limit: '50',
    };
    if (platform) p.platform = platform;
    return p;
  };

  if (facebookPageOnly && account.platform === 'FACEBOOK') {
    const t = (account.accessToken || '').trim();
    if (t) {
      attempts.push({
        label: 'page_ig_only',
        url: `${facebookGraphBaseUrl}/${account.platformUserId}/conversations`,
        params: baseParams(t, 'instagram'),
      });
    }
    return attempts;
  }

  if (isBusinessLogin && token) {
    attempts.push({
      label: 'ig_business_me',
      url: `${IG_GRAPH}/me/conversations`,
      params: baseParams(token),
    });
    return attempts;
  }

  if (pageCtx?.pageId && pageCtx.pageAccessToken) {
    attempts.push({
      label: 'page_instagram',
      url: `${facebookGraphBaseUrl}/${pageCtx.pageId}/conversations`,
      params: baseParams(pageCtx.pageAccessToken, 'instagram'),
    });
  }

  if (facebookPageRow?.platformUserId && facebookPageRow.accessToken) {
    const pt = facebookPageRow.accessToken.trim();
    const pageId = facebookPageRow.platformUserId;
    if (!attempts.some((a) => a.url.includes(`/${pageId}/conversations`))) {
      attempts.push({
        label: 'fb_row_page_ig',
        url: `${facebookGraphBaseUrl}/${pageId}/conversations`,
        params: baseParams(pt, 'instagram'),
      });
    }
  }

  if (token && pageCtx && token !== pageCtx.pageAccessToken) {
    attempts.push({
      label: 'page_instagram_ig_token',
      url: `${facebookGraphBaseUrl}/${pageCtx.pageId}/conversations`,
      params: baseParams(token, 'instagram'),
    });
  }

  if (isIgRow && token) {
    attempts.push({
      label: 'ig_me',
      url: `${IG_GRAPH}/me/conversations`,
      params: baseParams(token),
    });
  }

  return attempts;
}

export async function loadInstagramDmConversations(args: {
  userId: string;
  account: AccountRow;
  facebookPageOnly: boolean;
  cacheOnly: boolean;
  fresh: boolean;
  /** Optional connected Facebook Page row (same user) for token + fallback list. */
  facebookPageAccount?: AccountRow | null;
}): Promise<InstagramDmLoadResult> {
  const { userId, account, facebookPageOnly, cacheOnly, fresh, facebookPageAccount } = args;
  const accountId = account.id;
  const token = (account.accessToken || '').trim();

  if (cacheOnly) {
    const cached = await getInboxConversationListFromDb(accountId);
    if (cached?.length) {
      const merged = await finalizeList(accountId, cached);
      return { conversations: merged, fromCache: true };
    }
    return { conversations: [] };
  }

  if (!token && !facebookPageAccount?.accessToken) {
    return {
      conversations: [],
      error:
        'No access token. Reconnect via Facebook from Inbox and choose the Page linked to your Instagram profile.',
    };
  }

  const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };
  const isBusinessLogin =
    account.platform === 'INSTAGRAM' && cred.loginMethod === 'instagram_business';

  if (fresh) clearMetaThrottle();

  const ourIds = new Set<string>();
  if (account.platformUserId) ourIds.add(account.platformUserId);
  const ourUsernames = new Set<string>();
  if (account.username) ourUsernames.add(account.username.toLowerCase());

  const pageCtx =
    account.platform === 'INSTAGRAM' && token
      ? await resolveInstagramInboxPageContext(userId, {
          id: account.id,
          platformUserId: account.platformUserId,
          accessToken: token,
          credentialsJson: account.credentialsJson,
        })
      : null;

  if (pageCtx?.pageId) ourIds.add(pageCtx.pageId);

  const attempts = buildAttempts({
    account,
    pageCtx,
    facebookPageRow: facebookPageAccount ?? null,
    facebookPageOnly,
  });

  if (attempts.length === 0) {
    return {
      conversations: [],
      error:
        'Instagram inbox needs your Facebook Page linked to this account. Reconnect via Facebook and choose the Page tied to your Instagram profile.',
    };
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastMetaError: { message: string; code?: number } | null = null;

  for (const attempt of attempts) {
    if (Date.now() >= deadline) break;
    try {
      const raw = await fetchOnePage(attempt);
      if (raw.length === 0) continue;
      let list = mapThreads(raw, ourIds, ourUsernames);
      list = await finalizeList(accountId, list);
      return { conversations: list, debug: { source: attempt.label, count: list.length } };
    } catch (e) {
      const metaErr = (e as { metaError?: { message?: string; code?: number } }).metaError;
      if (metaErr) {
        lastMetaError = { message: metaErr.message ?? 'Meta API error', code: metaErr.code };
        const msg = metaErr.message ?? '';
        if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access')) {
          return {
            conversations: [],
            error: isBusinessLogin
              ? 'Your Instagram session has expired. Reconnect your Instagram account.'
              : 'Reconnect via Facebook from Inbox and choose your Page when asked to grant messaging permission.',
            debug: { metaMessage: msg, code: metaErr.code, attempt: attempt.label },
          };
        }
        if (metaErr.code === 3 || /capability|does not have the capability/i.test(msg)) {
          return {
            conversations: [],
            error: permissionErrorMessage(isBusinessLogin),
            debug: { metaMessage: msg, code: metaErr.code, attempt: attempt.label },
          };
        }
        continue;
      }
      if (isMetaRateLimit(e)) {
        const cached = await getInboxConversationListFromDb(accountId);
        if (cached?.length) {
          const merged = await finalizeList(accountId, cached);
          return {
            conversations: merged,
            fromCache: true,
            stale: true,
            emptyHint: 'Showing saved Instagram threads. Meta rate limit hit; try again in a minute.',
          };
        }
      }
      const err = e as { code?: string; message?: string };
      if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message ?? '')) {
        lastMetaError = { message: 'Meta request timed out' };
        continue;
      }
      lastMetaError = { message: err.message ?? 'Meta request failed' };
    }
  }

  const cached = await getInboxConversationListFromDb(accountId);
  if (cached?.length) {
    const merged = await finalizeList(accountId, cached);
    return {
      conversations: merged,
      fromCache: true,
      stale: true,
      emptyHint: 'Showing saved Instagram threads. Live refresh did not return new data.',
    };
  }

  if (lastMetaError?.message.includes('timed out')) {
    return {
      conversations: [],
      error:
        'Meta took too long to respond. Wait a moment and tap Retry from Meta. If it keeps failing, confirm instagram_manage_messages is approved in Meta App Dashboard and reconnect via Facebook.',
      debug: { metaMessage: lastMetaError.message },
    };
  }

  if (lastMetaError) {
    return {
      conversations: [],
      error: lastMetaError.message,
      debug: { metaMessage: lastMetaError.message, code: lastMetaError.code },
    };
  }

  const emptyHint =
    'Meta returned no Instagram DM threads for this Page. Send a test DM to your Instagram profile, then tap Retry. If the app is in Development mode, add your Instagram account as a tester under Roles in Meta App Dashboard.';
  return { conversations: [], error: emptyHint, emptyHint };
}

/** Load Instagram DMs for the user's connected Instagram (+ optional Facebook Page row). */
export async function loadInstagramDmInboxForUser(
  userId: string,
  opts: { fresh: boolean; cacheOnly?: boolean }
): Promise<InstagramDmLoadResult & { instagramAccountId?: string }> {
  const ig = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'INSTAGRAM', status: 'connected' },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      username: true,
      accessToken: true,
      credentialsJson: true,
    },
  });
  if (!ig) {
    return { conversations: [], error: 'No connected Instagram account. Connect Instagram from the sidebar.' };
  }

  const fbPage = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'FACEBOOK', status: 'connected' },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      username: true,
      accessToken: true,
      credentialsJson: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const result = await loadInstagramDmConversations({
    userId,
    account: ig,
    facebookPageOnly: false,
    cacheOnly: opts.cacheOnly ?? false,
    fresh: opts.fresh,
    facebookPageAccount: fbPage,
  });
  return { ...result, instagramAccountId: ig.id };
}
