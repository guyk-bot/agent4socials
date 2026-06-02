/**
 * Instagram DM inbox only (Messages tab). Does not touch comments, analytics, or Facebook Messenger.
 *
 * One Meta Graph call per refresh (same token/URL pattern as sync-inbox + dm-first-welcome).
 */
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { clearMetaThrottle, noteMetaRateLimitError, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';
import {
  getInboxConversationListFromDb,
  setInboxConversationListInDb,
  type InboxConversationListItem,
} from '@/lib/inbox/inbox-db-cache';
import { enrichConversationListFromMessageCache } from '@/lib/inbox/enrich-conversations-from-messages';
import {
  enrichInboxSendersFromLatestMessages,
  enrichInstagramAvatarsFromParticipants,
  mergeInboxProfileCacheIntoConversations,
  setIgScopedProfileCallBudgetForRequest,
} from '@/lib/inbox/resolve-inbox-sender-profile';
import { isBogusInstagramInboxSenderName, sanitizeInstagramInboxSenders } from '@/lib/inbox/instagram-dm-sender-utils';

const IG_GRAPH = 'https://graph.instagram.com/v25.0';
const FB_BASE = facebookGraphBaseUrl;
/** Names from Meta; avatars from profile/message cache (no profile_pic fan-out on list). */
const LIST_FIELDS = 'id,updated_time,participants{id,username,name}';
const META_TIMEOUT_MS = 25_000;

type ConvParticipant = { id?: string; name?: string; username?: string };
type ConvItem = {
  id: string;
  updated_time?: string;
  participants?: { data?: ConvParticipant[] };
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

function readCred(credentialsJson: unknown): { loginMethod?: string; linkedPageId?: string } {
  return credentialsJson && typeof credentialsJson === 'object'
    ? (credentialsJson as { loginMethod?: string; linkedPageId?: string })
    : {};
}

async function resolveLinkedPageId(
  userId: string,
  accessToken: string,
  credLinkedPageId?: string
): Promise<string | null> {
  if (credLinkedPageId?.trim()) return credLinkedPageId.trim();
  if (!accessToken) return null;
  const fb = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'FACEBOOK', status: 'connected' },
    select: { platformUserId: true },
    orderBy: { updatedAt: 'desc' },
  });
  return fb?.platformUserId?.trim() ?? null;
}

type MetaListTarget = { url: string; params: Record<string, string>; label: string };

function buildMetaListTarget(
  account: AccountRow,
  linkedPageId: string | null
): MetaListTarget | null {
  const token = (account.accessToken || '').trim();
  if (!token) return null;

  const cred = readCred(account.credentialsJson);
  const isIgRow = account.platform === 'INSTAGRAM';
  const isBusinessLogin = isIgRow && cred.loginMethod === 'instagram_business';

  if (account.platform === 'FACEBOOK') {
    return {
      label: 'page_instagram_only',
      url: `${FB_BASE}/${account.platformUserId}/conversations`,
      params: {
        fields: LIST_FIELDS,
        access_token: token,
        limit: '50',
        platform: 'instagram',
      },
    };
  }

  if (isBusinessLogin) {
    return {
      label: 'ig_business_me',
      url: `${IG_GRAPH}/me/conversations`,
      params: { fields: LIST_FIELDS, access_token: token, limit: '50' },
    };
  }

  if (linkedPageId) {
    return {
      label: 'page_instagram',
      url: `${FB_BASE}/${linkedPageId}/conversations`,
      params: {
        fields: LIST_FIELDS,
        access_token: token,
        limit: '50',
        platform: 'instagram',
      },
    };
  }

  return {
    label: 'ig_me',
    url: `${IG_GRAPH}/me/conversations`,
    params: { fields: LIST_FIELDS, access_token: token, limit: '50' },
  };
}

async function fetchFromMeta(target: MetaListTarget): Promise<ConvItem[]> {
  const res = await axios.get<{ data?: ConvItem[]; error?: { message: string; code?: number } }>(
    target.url,
    { params: target.params, timeout: META_TIMEOUT_MS }
  );
  noteMetaUsageFromHeaders(res.headers);
  if (res.data?.error) {
    const msg = res.data.error.message ?? 'Meta API error';
    if (/rate.?limit|too many/i.test(msg)) noteMetaRateLimitError();
    throw Object.assign(new Error(msg), { metaError: res.data.error, metaLabel: target.label });
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

function convNeedsSenderIdentity(c: InboxConversationListItem): boolean {
  const s = c.senders?.[0];
  if (!s) return true;
  if (isBogusInstagramInboxSenderName(s.name)) return true;
  return !(s.name?.trim() || s.username?.trim());
}

async function enrichSenders(
  account: AccountRow,
  userId: string,
  accountId: string,
  list: InboxConversationListItem[],
  ourIds: Set<string>,
  ourUsernames: Set<string>,
  opts: { liveFromMeta: boolean }
): Promise<InboxConversationListItem[]> {
  let out = sanitizeInstagramInboxSenders(list);
  out = (await mergeInboxProfileCacheIntoConversations('instagram', out)) as InboxConversationListItem[];
  out = await enrichConversationListFromMessageCache(accountId, 'instagram', out);

  const token = (account.accessToken || '').trim();
  const cred = readCred(account.credentialsJson);
  const isBusinessLogin =
    account.platform === 'INSTAGRAM' && cred.loginMethod === 'instagram_business';

  if (opts.liveFromMeta && token && out.some(convNeedsSenderIdentity)) {
    setIgScopedProfileCallBudgetForRequest(8);
    out = await enrichInstagramAvatarsFromParticipants({
      userId,
      list: out,
      isInstagramBusinessLogin: isBusinessLogin,
      accessToken: token,
      ourIds,
      ourUsernames,
      maxConversations: 15,
      forceEnrich: true,
    });
    if (out.some(convNeedsSenderIdentity)) {
      out = await enrichInboxSendersFromLatestMessages({
        platform: 'instagram',
        list: out,
        ourIds,
        accessToken: token,
        isInstagramBusinessLogin: isBusinessLogin,
        maxConversations: 8,
        forceEnrich: true,
      });
    }
  }

  if (out.length > 0) void setInboxConversationListInDb(accountId, out);
  return out;
}

function buildOurIdentitySets(account: AccountRow, linkedPageId: string | null): {
  ourIds: Set<string>;
  ourUsernames: Set<string>;
} {
  const ourIds = new Set<string>();
  if (account.platformUserId) ourIds.add(account.platformUserId);
  const ourUsernames = new Set<string>();
  if (account.username) ourUsernames.add(account.username.toLowerCase());
  if (linkedPageId) ourIds.add(linkedPageId);
  const credLinked = readCred(account.credentialsJson).linkedPageId?.trim();
  if (credLinked) ourIds.add(credLinked);
  return { ourIds, ourUsernames };
}

/** Background: resolve IG DM sender names/avatars after the fast list response. */
export async function enrichInstagramDmSendersInBackground(userId: string): Promise<void> {
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
  if (!ig?.accessToken) return;

  const list = await getInboxConversationListFromDb(ig.id);
  if (!list?.length) return;

  const cred = readCred(ig.credentialsJson);
  const isBusinessLogin = cred.loginMethod === 'instagram_business';
  const linkedPageId = isBusinessLogin
    ? null
    : await resolveLinkedPageId(userId, ig.accessToken.trim(), cred.linkedPageId);
  const { ourIds, ourUsernames } = buildOurIdentitySets(ig, linkedPageId);

  await enrichSenders(ig, userId, ig.id, list, ourIds, ourUsernames, { liveFromMeta: true });
}

function permissionError(isBusinessLogin: boolean): string {
  return isBusinessLogin
    ? 'Instagram inbox needs instagram_business_manage_messages. Add your Instagram account as a tester under Roles in Meta App Dashboard, then reconnect Instagram.'
    : 'Instagram inbox needs instagram_manage_messages (Advanced Access in Meta App Dashboard). Reconnect via Facebook and choose the Page linked to your Instagram profile.';
}

function parseMetaFailure(e: unknown, isBusinessLogin: boolean): InstagramDmLoadResult | null {
  const metaErr = (e as { metaError?: { message?: string; code?: number }; metaLabel?: string })
    .metaError;
  if (metaErr) {
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
        error: permissionError(isBusinessLogin),
        debug: { metaMessage: msg, code: metaErr.code },
      };
    }
    return {
      conversations: [],
      error: msg || 'Meta could not load Instagram messages.',
      debug: { metaMessage: msg, code: metaErr.code },
    };
  }

  const err = e as { code?: string; message?: string; response?: { status?: number } };
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message ?? '')) {
    return {
      conversations: [],
      error:
        'Meta took too long to respond. Wait a minute and tap Retry from Meta. If it keeps failing, confirm instagram_manage_messages is approved in Meta App Dashboard.',
      debug: { timedOut: true },
    };
  }

  const status = err.response?.status;
  if (status === 429) {
    return {
      conversations: [],
      error: 'Meta rate limit hit. Wait a minute and tap Retry from Meta.',
      debug: { rateLimited: true },
    };
  }

  return null;
}

export async function loadInstagramDmConversations(args: {
  userId: string;
  account: AccountRow;
  facebookPageOnly: boolean;
  cacheOnly: boolean;
  fresh: boolean;
  /** Skip per-thread Meta profile calls in this request (run in after() instead). */
  deferHeavyEnrichment?: boolean;
}): Promise<InstagramDmLoadResult> {
  const { userId, account, facebookPageOnly, cacheOnly, fresh, deferHeavyEnrichment } = args;
  const accountId = account.id;
  const token = (account.accessToken || '').trim();
  const cred = readCred(account.credentialsJson);
  const isBusinessLogin =
    account.platform === 'INSTAGRAM' && cred.loginMethod === 'instagram_business';
  const useLiveMetaEnrichment = fresh && !deferHeavyEnrichment;

  const ourIds = new Set<string>();
  if (account.platformUserId) ourIds.add(account.platformUserId);
  const ourUsernames = new Set<string>();
  if (account.username) ourUsernames.add(account.username.toLowerCase());
  const credLinkedPageId = cred.linkedPageId?.trim();
  if (credLinkedPageId) ourIds.add(credLinkedPageId);

  const enrich = (list: InboxConversationListItem[]) =>
    enrichSenders(account, userId, accountId, list, ourIds, ourUsernames, {
      liveFromMeta: useLiveMetaEnrichment,
    });

  if (cacheOnly) {
    const cached = await getInboxConversationListFromDb(accountId);
    if (cached?.length) {
      return { conversations: await enrich(cached), fromCache: true };
    }
    return { conversations: [] };
  }

  if (!token) {
    return {
      conversations: [],
      error:
        'No access token. Reconnect via Facebook from Inbox and choose the Page linked to your Instagram profile.',
    };
  }

  if (fresh) clearMetaThrottle();

  const linkedPageId =
    account.platform === 'INSTAGRAM' && !isBusinessLogin && !facebookPageOnly
      ? await resolveLinkedPageId(userId, token, cred.linkedPageId)
      : cred.linkedPageId?.trim() ?? null;

  if (linkedPageId) ourIds.add(linkedPageId);

  const target = buildMetaListTarget(account, linkedPageId);
  if (!target) {
    return {
      conversations: [],
      error:
        'Instagram inbox needs your Facebook Page linked to this account. Reconnect via Facebook and choose the Page tied to your Instagram profile.',
    };
  }

  console.log(`[InstagramDM] fetch account=${accountId} label=${target.label} url=${target.url}`);

  try {
    const raw = await fetchFromMeta(target);
    if (raw.length === 0) {
      const cached = await getInboxConversationListFromDb(accountId);
      if (cached?.length) {
        return {
          conversations: await enrich(cached),
          fromCache: true,
          stale: true,
          emptyHint: 'Meta returned no new Instagram threads. Showing saved conversations.',
        };
      }
      const emptyHint =
        'Meta returned no Instagram DM threads. Send a test DM to your Instagram profile, then tap Retry. In Development mode, add your Instagram account as a tester under Roles in Meta App Dashboard.';
      return { conversations: [], error: emptyHint, emptyHint, debug: { source: target.label, count: 0 } };
    }

    let list = mapThreads(raw, ourIds, ourUsernames);
    list = await enrich(list);
    return { conversations: list, debug: { source: target.label, count: list.length } };
  } catch (e) {
    const parsed = parseMetaFailure(e, isBusinessLogin);
    const cached = await getInboxConversationListFromDb(accountId);
    if (cached?.length) {
      return {
        conversations: await enrich(cached),
        fromCache: true,
        stale: true,
        emptyHint: parsed?.error ?? 'Showing saved Instagram threads. Live refresh failed.',
        debug: parsed?.debug,
      };
    }
    if (parsed) return parsed;
    const msg = (e as Error)?.message ?? 'Could not load Instagram messages from Meta.';
    return { conversations: [], error: msg, debug: { rawMessage: msg } };
  }
}

/** Load Instagram DMs for the user's connected Instagram account. */
export async function loadInstagramDmInboxForUser(
  userId: string,
  opts: { fresh: boolean; cacheOnly?: boolean; deferHeavyEnrichment?: boolean }
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

  const result = await loadInstagramDmConversations({
    userId,
    account: ig,
    facebookPageOnly: false,
    cacheOnly: opts.cacheOnly ?? false,
    fresh: opts.fresh,
    deferHeavyEnrichment: opts.deferHeavyEnrichment,
  });
  return { ...result, instagramAccountId: ig.id };
}
