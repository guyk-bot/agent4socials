/**
 * Instagram DM inbox only: fetch thread list from Meta and map for the Inbox Messages tab.
 * Does not touch comments, analytics, or Facebook Messenger.
 */
import axios, { type AxiosResponse } from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { clearMetaThrottle, noteMetaRateLimitError, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';
import {
  getInboxConversationListFromDb,
  setInboxConversationListInDb,
  type InboxConversationListItem,
} from '@/lib/inbox/inbox-db-cache';
import { mergeInboxProfileCacheIntoConversations } from '@/lib/inbox/resolve-inbox-sender-profile';
import { resolveInstagramInboxPageContext } from '@/lib/inbox/resolve-instagram-inbox-token';

const IG_GRAPH = 'https://graph.instagram.com/v25.0';
const LIST_FIELDS =
  'id,updated_time,participants{id,name,username,profile_pic,profile_picture_url,picture}';
const META_LIST_TIMEOUT_MS = 20_000;
const MAX_LIST_PAGES = 2;

type ConvParticipant = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  profile_picture_url?: string;
  picture?: { data?: { url?: string } };
};

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

function isMetaRateLimit(e: unknown): boolean {
  const err = e as { response?: { status?: number; data?: { error?: { code?: number; message?: string } } } };
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const msg = (err?.response?.data?.error?.message ?? '').toLowerCase();
  return status === 429 || code === 4 || code === 17 || code === 32 || msg.includes('rate limit');
}

async function fetchConversationPages(
  url: string,
  params: Record<string, string>,
  token: string
): Promise<ConvItem[]> {
  const all: ConvItem[] = [];
  let nextUrl: string | null = null;
  let pages = 0;
  do {
    const res: AxiosResponse<ConvApiResponse> = await axios.get<ConvApiResponse>(
      nextUrl ?? url,
      {
        params: nextUrl ? { access_token: token } : params,
        timeout: META_LIST_TIMEOUT_MS,
      }
    );
    noteMetaUsageFromHeaders(res.headers);
    if (res.data?.error) {
      const msg = res.data.error.message ?? 'Meta API error';
      if (/rate.?limit|too many/i.test(msg)) noteMetaRateLimitError();
      throw Object.assign(new Error(msg), { metaError: res.data.error });
    }
    all.push(...(res.data?.data ?? []));
    nextUrl = res.data?.paging?.next ?? null;
    pages++;
  } while (nextUrl && pages < MAX_LIST_PAGES);
  return all;
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
      pictureUrl: (s.profile_pic ?? s.profile_picture_url ?? s.picture?.data?.url ?? null) as
        | string
        | null,
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
    ? 'Instagram inbox needs Standard or Advanced Access for instagram_business_manage_messages. In Meta App Dashboard, add your Instagram account as a tester under Roles, then reconnect Instagram.'
    : 'Instagram inbox needs Advanced Access for instagram_manage_messages in Meta App Dashboard. Add your account as an Instagram Tester while the app is in Development mode, then reconnect via Facebook and choose your Page.';
}

export async function loadInstagramDmConversations(args: {
  userId: string;
  account: AccountRow;
  /** Facebook Page row: return only IG threads from Page conversations?platform=instagram */
  facebookPageOnly: boolean;
  cacheOnly: boolean;
  fresh: boolean;
}): Promise<InstagramDmLoadResult> {
  const { userId, account, facebookPageOnly, cacheOnly, fresh } = args;
  const accountId = account.id;
  const token = (account.accessToken || '').trim();

  if (cacheOnly) {
    const cached = await getInboxConversationListFromDb(accountId);
    if (cached?.length) {
      const merged = await mergeInboxProfileCacheIntoConversations('instagram', cached);
      return { conversations: merged, fromCache: true };
    }
    return { conversations: [] };
  }

  if (!token) {
    return {
      conversations: [],
      error:
        'No access token. Reconnect Instagram via Facebook from Inbox and choose the Page linked to your profile.',
    };
  }

  const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string };

  const isIgRow = account.platform === 'INSTAGRAM';
  const isBusinessLogin = isIgRow && cred.loginMethod === 'instagram_business';

  if (fresh) clearMetaThrottle();

  const ourIds = new Set<string>();
  if (account.platformUserId) ourIds.add(account.platformUserId);
  const ourUsernames = new Set<string>();
  if (account.username) ourUsernames.add(account.username.toLowerCase());

  type Attempt = { url: string; params: Record<string, string>; token: string };
  const attempts: Attempt[] = [];

  if (facebookPageOnly) {
    attempts.push({
      url: `${facebookGraphBaseUrl}/${account.platformUserId}/conversations`,
      params: {
        fields: LIST_FIELDS,
        access_token: token,
        limit: '50',
        platform: 'instagram',
      },
      token,
    });
  } else if (isBusinessLogin) {
    attempts.push({
      url: `${IG_GRAPH}/me/conversations`,
      params: { fields: LIST_FIELDS, access_token: token, limit: '50' },
      token,
    });
  } else {
    let pageId = cred.linkedPageId?.trim() || '';
    let pageToken = token;
    const pageCtx = await resolveInstagramInboxPageContext(userId, {
      id: account.id,
      platformUserId: account.platformUserId,
      accessToken: token,
      credentialsJson: account.credentialsJson,
    });
    if (pageCtx) {
      pageId = pageCtx.pageId;
      pageToken = pageCtx.pageAccessToken;
    } else {
      const fb = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', status: 'connected' },
        select: { platformUserId: true, accessToken: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (fb?.platformUserId && fb.accessToken) {
        pageId = fb.platformUserId;
        pageToken = fb.accessToken.trim();
      }
    }
    if (!pageId) {
      return {
        conversations: [],
        error:
          'Instagram inbox needs your Facebook Page linked to this account. Reconnect via Facebook from Inbox and choose the Page tied to your Instagram profile.',
      };
    }
    ourIds.add(pageId);
    attempts.push({
      url: `${facebookGraphBaseUrl}/${pageId}/conversations`,
      params: {
        fields: LIST_FIELDS,
        access_token: pageToken,
        limit: '50',
        platform: 'instagram',
      },
      token: pageToken,
    });
    if (token !== pageToken) {
      attempts.push({
        url: `${IG_GRAPH}/me/conversations`,
        params: { fields: LIST_FIELDS, access_token: token, limit: '50' },
        token,
      });
    }
  }

  let lastMetaError: { message: string; code?: number } | null = null;

  for (const attempt of attempts) {
    try {
      const raw = await fetchConversationPages(attempt.url, attempt.params, attempt.token);
      if (raw.length === 0) continue;
      let list = mapThreads(raw, ourIds, ourUsernames);
      list = (await mergeInboxProfileCacheIntoConversations('instagram', list)) as typeof list;
      void setInboxConversationListInDb(accountId, list);
      return { conversations: list };
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
            debug: { metaMessage: msg, code: metaErr.code },
          };
        }
        if (metaErr.code === 3 || /capability|does not have the capability/i.test(msg)) {
          return {
            conversations: [],
            error: permissionErrorMessage(isBusinessLogin),
            debug: { metaMessage: msg, code: metaErr.code },
          };
        }
        continue;
      }
      if (isMetaRateLimit(e)) {
        const cached = await getInboxConversationListFromDb(accountId);
        if (cached?.length) {
          const merged = await mergeInboxProfileCacheIntoConversations('instagram', cached);
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
    }
  }

  const cached = await getInboxConversationListFromDb(accountId);
  if (cached?.length) {
    const merged = await mergeInboxProfileCacheIntoConversations('instagram', cached);
    return {
      conversations: merged,
      fromCache: true,
      stale: true,
      emptyHint: 'Showing saved Instagram threads. Live refresh did not return new data.',
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
    'Meta returned no Instagram DM threads for this Page. If you expect messages here: request Advanced Access for instagram_manage_messages in Meta App Dashboard, add your account as an Instagram Tester while the app is in Development mode, send a new DM to this profile, then reconnect via Facebook.';
  return { conversations: [], error: emptyHint, emptyHint };
}
