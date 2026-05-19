import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios, { AxiosResponse } from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { refreshTwitterToken } from '@/lib/twitter-refresh';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';

import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { isMetaNonCriticalThrottled, noteMetaUsageFromHeaders, noteMetaRateLimitError } from '@/lib/meta-usage-guard';
import { MetaGraphThrottledError, runMetaGraphRequest } from '@/lib/meta-graph-queue';
import { readInboxProfileCache, writeInboxProfileCache } from '@/lib/inbox/inbox-profile-cache';
import {
  getInboxConversationListFromDb,
  setInboxConversationListInDb,
  type InboxConversationListItem,
} from '@/lib/inbox/inbox-db-cache';

const baseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

type ConvParticipant = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  picture?: { data?: { url?: string } };
};

type ConvItem = {
  id: string;
  updated_time?: string;
  participants?: { data?: ConvParticipant[] };
};

type ConvApiResponse = {
  data?: ConvItem[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: { message: string; code?: number };
};

/**
 * GET /api/social/accounts/[id]/conversations
 * Returns list of conversations (DMs) for this Instagram, Facebook, or X (Twitter) account.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const includeMessageCounts = searchParams.get('includeMessageCounts') === '1' || searchParams.get('includeMessageCounts') === 'true';
  const deltaMode = searchParams.get('delta') === '1' || searchParams.get('delta') === 'true';
  const sinceParam = searchParams.get('since');
  const sinceIso = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam).toISOString() : null;
  const manualInboxSync =
    searchParams.get('manualInboxSync') === '1' || searchParams.get('manualInboxSync') === 'true';
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      username: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  // NOTE: We intentionally do NOT apply the non-critical throttle here.
  // The conversations list is a single lightweight Meta API call that is essential
  // for the inbox to show new messages. Blocking it hides new DMs for 45 minutes.
  // If Meta genuinely rate-limits this call, the API returns 429 which is handled below.

  if (account.platform === 'PINTEREST' || account.platform === 'LINKEDIN') {
    return NextResponse.json({
      conversations: [],
      error: null,
      hint:
        account.platform === 'PINTEREST'
          ? 'Pinterest direct messages are not available in this app.'
          : 'LinkedIn member messaging is not available through this integration. DMs stay on linkedin.com.',
    });
  }

  if (
    account.platform !== 'INSTAGRAM' &&
    account.platform !== 'FACEBOOK' &&
    account.platform !== 'TWITTER'
  ) {
    return NextResponse.json({
      conversations: [],
      hint: 'Conversations are only available for Instagram, Facebook, and X (Twitter).',
    });
  }

  const token = (account.accessToken || '').trim();
  if (!token) {
    return NextResponse.json({
      conversations: [],
      error: 'No access token. Reconnect this account from the sidebar (Reconnect Facebook & Instagram) and choose your Page.',
    }, { status: 200 });
  }

  // --- Twitter (X) DMs: GET /2/dm_events only. No test message is ever sent. ---
  // X returns all DM events for the user from the last 30 days; we paginate with meta.next_token.
  if (account.platform === 'TWITTER') {
    try {
      if (manualInboxSync) {
        const up = await prisma.socialAccount.updateMany({
          where: {
            id: account.id,
            OR: [
              { xInboxLastManualSyncAt: null },
              { xInboxLastManualSyncAt: { lt: new Date(Date.now() - 15 * 60_000) } },
            ],
          },
          data: { xInboxLastManualSyncAt: new Date() },
        });
        if (up.count === 0) {
          return NextResponse.json(
            {
              conversations: [],
              error:
                'You can manually refresh X inbox once every 15 minutes. This protects shared API limits.',
              inboxManualCooldown: true,
            },
            { status: 429 }
          );
        }
      }

      const ourId = String(account.platformUserId ?? '');
      const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
        ? account.credentialsJson : {}) as Record<string, unknown>;
      // Only use OAuth 1.0a if THIS account was explicitly connected via OAuth 1.0a (credentialsJson tokens).
      // Do NOT fall back to TWITTER_ACCESS_TOKEN env vars — those may belong to a different X account
      // (the developer's account) and would silently return 0 DMs for the wrong account.
      const oauth1UserToken = credJson.twitterOAuth1AccessToken as string | undefined;
      const oauth1UserSecret = credJson.twitterOAuth1AccessTokenSecret as string | undefined;
      const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);

      type TwitterSender = { id: string | undefined; name: string | undefined; username: string | undefined; pictureUrl: string | null };
      type TwitterConvItem = { id: string; updatedTime: string | null; senders: TwitterSender[]; messageCount: number | undefined };

      const dmEventsUrl = 'https://api.x.com/2/dm_events';
      const convosById = new Map<string, { updatedTime: string; otherParticipantIds: Set<string> }>();
      let nextToken: string | null = null;
      let pageCount = 0;
      let totalEventsFetched = 0;
      let lastRawResponse: unknown;
      const userMap = new Map<string, { id: string; name?: string; username?: string; profile_image_url?: string }>();
      let tokenForTwitter = token;

      const maxPages = deltaMode ? 1 : 5;
      do {
        await checkAndIncrementXApiUsage(account.id);
        const params: Record<string, string> = {
          'dm_event.fields': 'id,text,sender_id,dm_conversation_id,created_at,participant_ids',
          event_types: 'MessageCreate',
          expansions: 'sender_id,participant_ids',
          'user.fields': 'id,name,username,profile_image_url',
          max_results: '100',
        };
        if (nextToken) params.pagination_token = nextToken;

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
            id: string;
            event_type?: string;
            dm_conversation_id?: string;
            created_at?: string;
            sender_id?: string;
            participant_ids?: string[];
          }>;
          includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
          meta?: { next_token?: string };
          error?: { message?: string };
          errors?: Array<{ code?: number; title?: string; detail?: string; type?: string; status?: number }>;
        }>(dmEventsUrl, requestConfig);

        if (res.status === 429) {
          return NextResponse.json(
            { conversations: [], error: 'X is limiting requests (too many). Wait a few minutes and try again.' },
            { status: 429 }
          );
        }

        // 401: token expired (89) or missing DM permission (220). Per Twitter docs: 89 = refresh or reconnect, 220 = app must have Read+Write+Direct Messages.
        if (res.status === 401 && !useOAuth1ForDm) {
          const firstErr = (res.data as { errors?: Array<{ code?: number; message?: string }> })?.errors?.[0];
          const code = firstErr?.code;
          if (code === 89 && account.refreshToken && process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
            try {
              const { accessToken: newAccess, refreshToken: newRefresh } = await refreshTwitterToken(account.refreshToken);
              await prisma.socialAccount.update({
                where: { id: account.id },
                data: { accessToken: newAccess, ...(newRefresh ? { refreshToken: newRefresh } : {}) },
              });
              (account as { accessToken: string }).accessToken = newAccess;
              tokenForTwitter = newAccess;
              await checkAndIncrementXApiUsage(account.id);
              res = await axios.get(dmEventsUrl, { ...requestConfig, headers: { Authorization: `Bearer ${newAccess}` } });
            } catch {
              return NextResponse.json({
                conversations: [],
                error: 'X token expired (code 89). Reconnect your X account from the sidebar.',
              });
            }
          }
          if (res.status === 401) {
            const retryFirstErr = (res.data as { errors?: Array<{ code?: number }> })?.errors?.[0];
            if (retryFirstErr?.code === 220) {
              return NextResponse.json({
                conversations: [],
                error: 'X app does not have DM access (code 220). In X Developer Portal → your app → User authentication settings, set App permissions to "Read + Write + Direct Messages", then reconnect X.',
              });
            }
            return NextResponse.json({
              conversations: [],
              error: 'X authorization failed (401). Reconnect your X account from the sidebar.',
            });
          }
        } else if (res.status === 401 && useOAuth1ForDm) {
          return NextResponse.json({
            conversations: [],
            error: 'X OAuth 1.0a authorization failed (401). Reconnect X or check TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET in Vercel.',
          });
        }

        lastRawResponse = { status: res.status, keys: Object.keys(res.data ?? {}), dataLen: res.data?.data?.length ?? null, error: res.data?.error, errors: res.data?.errors };
        const apiErr = res.data?.error ?? (res.data?.errors?.[0]
          ? { message: (res.data.errors[0] as { detail?: string; title?: string }).detail ?? (res.data.errors[0] as { title?: string }).title ?? 'X API error' }
          : null);
        if (apiErr) {
          const msg = apiErr.message ?? '';
          if (/dm\.read|scope|403|forbidden|permission|not authorized/i.test(msg)) {
            return NextResponse.json({
              conversations: [],
              error: 'X DMs: permission denied. Reconnect your X account from the sidebar.',
            });
          }
          return NextResponse.json({ conversations: [], error: msg || 'Could not load X conversations.' });
        }
        const events = res.data?.data ?? [];
        totalEventsFetched += events.length;
        for (const u of res.data?.includes?.users ?? []) {
          userMap.set(u.id, u);
        }
        for (const ev of events) {
          if (!ev.dm_conversation_id) continue;
          const cid = ev.dm_conversation_id;
          if (!convosById.has(cid)) {
            convosById.set(cid, { updatedTime: '', otherParticipantIds: new Set() });
          }
          const cur = convosById.get(cid)!;
          if (ev.event_type === 'MessageCreate') {
            const updated = ev.created_at ?? '';
            if (updated.localeCompare(cur.updatedTime) > 0) cur.updatedTime = updated;
            if (ev.sender_id && ev.sender_id !== ourId) cur.otherParticipantIds.add(ev.sender_id);
          }
          if (Array.isArray(ev.participant_ids)) {
            for (const pid of ev.participant_ids) if (pid && pid !== ourId) cur.otherParticipantIds.add(pid);
          }
          // X API doesn't return participant_ids for MessageCreate events.
          // Parse the conversation ID (format: {numericId1}-{numericId2}) to find the other participant.
          if (ourId) {
            for (const part of cid.split('-')) {
              if (part && part !== ourId) cur.otherParticipantIds.add(part);
            }
          }
        }
        nextToken = res.data?.meta?.next_token ?? null;
        pageCount++;
      } while (nextToken && pageCount < maxPages);

      const ourUsername = (account.username ?? '').trim() || undefined;
      let list: TwitterConvItem[] = Array.from(convosById.entries()).map(([id, { updatedTime, otherParticipantIds }]) => {
        const senders: TwitterSender[] = Array.from(otherParticipantIds).map((uid) => {
          const u = userMap.get(uid);
          return {
            id: uid,
            name: u?.name ?? undefined,
            username: u?.username ?? undefined,
            pictureUrl: u?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null,
          };
        });
        // Self-DM: otherParticipantIds is empty (conversation id is ourId-ourId). Show our username instead of "X (Twitter) user".
        const fallbackSender: TwitterSender = senders.length > 0
          ? { id: undefined, name: undefined, username: undefined, pictureUrl: null }
          : { id: ourId, name: ourUsername ?? 'You', username: ourUsername, pictureUrl: null };
        return {
          id,
          updatedTime: updatedTime || null,
          senders: senders.length > 0 ? senders : [fallbackSender],
          messageCount: undefined as number | undefined,
        };
      });

      // Mentions (@-replies referencing this user) — surfaced alongside DMs in Unified Inbox.
      const mentionItems: TwitterConvItem[] = [];
      if (ourId) {
        let mNext: string | null = null;
        let mPages = 0;
        const mentionsUrl = `https://api.x.com/2/users/${ourId}/mentions`;
        try {
          do {
            await checkAndIncrementXApiUsage(account.id);
            const mParams: Record<string, string> = {
              max_results: '15',
              'tweet.fields': 'author_id,created_at,text',
              expansions: 'author_id',
              'user.fields': 'id,name,username,profile_image_url',
            };
            if (mNext) mParams.pagination_token = mNext;
            const mRequestConfig = useOAuth1ForDm
              ? {
                  params: mParams,
                  headers: signTwitterRequest('GET', mentionsUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, mParams),
                  timeout: 15_000,
                  validateStatus: () => true,
                }
              : {
                  params: mParams,
                  headers: { Authorization: `Bearer ${tokenForTwitter}` },
                  timeout: 15_000,
                  validateStatus: () => true,
                };
            const mRes = await axios.get<{
              data?: Array<{ id: string; created_at?: string; author_id?: string; text?: string }>;
              includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
              meta?: { next_token?: string };
              errors?: unknown[];
            }>(mentionsUrl, mRequestConfig);
            if (mRes.status >= 200 && mRes.status < 300 && mRes.data?.data) {
              for (const u of mRes.data.includes?.users ?? []) {
                userMap.set(u.id, u);
              }
              for (const tw of mRes.data.data) {
                const aid = tw.author_id;
                const au = aid ? userMap.get(aid) : undefined;
                mentionItems.push({
                  id: `mention:${tw.id}`,
                  updatedTime: tw.created_at ?? null,
                  senders: aid
                    ? [
                        {
                          id: aid,
                          name: au?.name,
                          username: au?.username,
                          pictureUrl: au?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null,
                        },
                      ]
                    : [{ id: undefined, name: 'Unknown', username: undefined, pictureUrl: null }],
                  messageCount: 1,
                });
              }
              mNext = mRes.data.meta?.next_token ?? null;
            } else {
              mNext = null;
            }
            mPages++;
          } while (mNext && mPages < 3);
        } catch (mentionErr) {
          console.warn('[Conversations] Twitter mentions fetch skipped:', (mentionErr as Error)?.message);
        }
      }

      list = [...mentionItems, ...list];

      const missingUserIds = new Set<string>();
      for (const conv of list) {
        for (const s of conv.senders) {
          if (s.id && (s.name === undefined || s.username === undefined)) missingUserIds.add(s.id);
        }
      }
      if (missingUserIds.size > 0) {
        const idsArr = Array.from(missingUserIds).slice(0, 100);
        try {
          await checkAndIncrementXApiUsage(account.id);
          const usersRes = await axios.get<{
            data?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }>;
            error?: { message?: string };
          }>('https://api.x.com/2/users', {
            params: { ids: idsArr.join(','), 'user.fields': 'id,name,username,profile_image_url' },
            headers: { Authorization: `Bearer ${tokenForTwitter}` },
            timeout: 15_000,
          });
          if (usersRes.data?.data) {
            for (const u of usersRes.data.data) {
              userMap.set(u.id, u);
            }
            list = list.map((conv) => ({
              ...conv,
              senders: conv.senders.map((s): TwitterSender => {
                if (!s.id) return s;
                const u = userMap.get(s.id);
                if (!u) return s;
                return {
                  id: s.id,
                  name: s.name ?? u.name ?? undefined,
                  username: s.username ?? u.username ?? undefined,
                  pictureUrl: s.pictureUrl ?? (u.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null),
                };
              }),
            }));
          }
        } catch (e) {
          console.warn('[Conversations] Twitter user enrichment failed:', (e as Error)?.message);
        }
      }
      for (const conv of list) {
        for (const s of conv.senders) {
          if (s.id && s.name === undefined && s.username === undefined) {
            (s as { name?: string }).name = 'Private account';
          }
        }
      }
      if (sinceIso) {
        list = list.filter((c) => !!c.updatedTime && c.updatedTime.localeCompare(sinceIso) > 0);
      }
      list.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));

      let debug: { eventCount?: number; conversationCount?: number; tokenCheck?: string; rawErrors?: unknown; dmEventsResponse?: unknown } | undefined;
      if (list.length === 0) {
        let tokenCheck = 'not_checked';
        let rawErrors: unknown;
        try {
          await checkAndIncrementXApiUsage(account.id);
          const meRes = await axios.get<{ data?: { id?: string; username?: string }; error?: { message?: string }; errors?: unknown }>(
            'https://api.x.com/2/users/me',
            { params: { 'user.fields': 'id,username' }, headers: { Authorization: `Bearer ${token}` }, timeout: 8_000 }
          );
          if (meRes.data?.error) tokenCheck = `token_error: ${meRes.data.error.message ?? 'unknown'}`;
          else if (meRes.data?.data?.id) tokenCheck = `ok (user ${meRes.data.data.username ?? meRes.data.data.id})`;
          else tokenCheck = 'ok (no user id)';
          rawErrors = meRes.data?.errors;
        } catch (meErr) {
          const meMsg = (meErr as { response?: { data?: { error?: { message?: string } }; status?: number } })?.response?.data?.error?.message ?? (meErr as Error)?.message;
          tokenCheck = `check_failed: ${String(meMsg ?? 'unknown').slice(0, 80)}`;
        }
        debug = {
          eventCount: totalEventsFetched,
          conversationCount: 0,
          tokenCheck,
          dmEventsResponse: lastRawResponse,
          ...(rawErrors ? { rawErrors } : {}),
        };
      }
      return NextResponse.json({ conversations: list, ...(debug && { debug }) });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } }; status?: number }; message?: string };
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Could not load X conversations.';
      if (err?.response?.status === 403 || /dm\.read|scope|permission/i.test(msg)) {
        return NextResponse.json({
          conversations: [],
          error: 'X (Twitter) DMs require dm.read scope. Reconnect your X account from the sidebar.',
        });
      }
      console.warn('[Conversations] Twitter error:', msg);
      return NextResponse.json({ conversations: [], error: msg });
    }
  }

  const isInstagram = account.platform === 'INSTAGRAM';
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string; igUserToken?: string };

  // Instagram Business Login: accessToken IS the long-lived Instagram User token.
  // Route through graph.instagram.com — no Page token needed.
  const isInstagramBusinessLogin = isInstagram && credJson.loginMethod === 'instagram_business';
  // igUserToken is account.accessToken itself (the long-lived IG User token saved at connect-time)
  const igUserToken = isInstagramBusinessLogin ? token : null;

  // For Facebook Login path: find linked Page ID to build the graph.facebook.com endpoint.
  let linkedPageId: string | false = false;
  if (isInstagram && !isInstagramBusinessLogin) {
    linkedPageId = credJson.linkedPageId || false;
    if (!linkedPageId) {
      // After reconnect, token on IG vs FB rows may differ: resolve any connected Page for this user.
      const fb = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', status: 'connected' },
        select: { platformUserId: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (fb?.platformUserId) linkedPageId = fb.platformUserId;
    }
    if (!linkedPageId && token) {
      const fbByToken = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', accessToken: token },
        select: { platformUserId: true },
      });
      if (fbByToken?.platformUserId) linkedPageId = fbByToken.platformUserId;
    }
    if (linkedPageId && !credJson.linkedPageId) {
      void prisma.socialAccount
        .update({
          where: { id: account.id },
          data: {
            credentialsJson: {
              ...credJson,
              loginMethod: 'facebook_login',
              linkedPageId: linkedPageId as string,
            },
          },
        })
        .catch(() => {});
    }
  }

  if (isInstagram && !isInstagramBusinessLogin && !linkedPageId) {
    return NextResponse.json({
      conversations: [],
      error:
        'Instagram inbox needs your Facebook Page linked to this account. Reconnect Instagram from Accounts and choose the Page tied to your Instagram profile.',
    });
  }

  // Route to the correct API based on login method:
  // - Instagram Business Login → graph.instagram.com/v25.0/me/conversations (Instagram User token)
  // - Facebook Login           → graph.facebook.com/{version}/{PAGE_ID}/conversations (Page token)
  const conversationsPath = isInstagramBusinessLogin
    ? 'https://graph.instagram.com/v25.0/me/conversations'
    : isInstagram && linkedPageId
      ? `${baseUrl}/${linkedPageId}/conversations`
      : isInstagram
        ? 'https://graph.instagram.com/v25.0/me/conversations'
        : `${baseUrl}/${account.platformUserId}/conversations`;

  const activeToken = isInstagramBusinessLogin ? igUserToken! : token;
  const queryParams: Record<string, string> = {
    fields: 'id,updated_time,participants{id,name,username,profile_pic,picture}',
    access_token: activeToken,
    limit: '100',
  };
  // platform=instagram is only needed for graph.facebook.com Page token path (Facebook Login).
  // For graph.instagram.com (Instagram Business Login) it is not required and may cause errors.
  if (isInstagram && !isInstagramBusinessLogin) queryParams.platform = 'instagram';

  function isMetaRateLimitResponse(e: unknown): boolean {
    const err = e as { response?: { status?: number; data?: { error?: { code?: number; message?: string } } } };
    const status = err?.response?.status;
    const code = err?.response?.data?.error?.code;
    const msg = (err?.response?.data?.error?.message ?? '').toLowerCase();
    return status === 429 || code === 4 || code === 17 || code === 32 || msg.includes('rate limit');
  }

  /** Essential inbox path: call Meta directly (not runMetaGraphRequest) so app throttle does not hide DMs for 45 min. */
  async function fetchAllConversations(
    url: string,
    params: Record<string, string>,
    fetchToken: string,
    pageLimit = 5
  ): Promise<ConvItem[]> {
    const all: ConvItem[] = [];
    let nextUrl: string | null = null;
    let pageCount = 0;
    do {
      const currentFetchUrl: string = nextUrl ?? url;
      const currentParams: Record<string, string> = nextUrl ? { access_token: fetchToken } : params;
      let res: AxiosResponse<ConvApiResponse>;
      try {
        res = await axios.get<ConvApiResponse>(currentFetchUrl, {
          params: currentParams,
          timeout: 60_000,
        });
        noteMetaUsageFromHeaders(res.headers);
      } catch (e) {
        if (isMetaRateLimitResponse(e)) noteMetaRateLimitError();
        throw e;
      }
      if (res.data?.error) {
        const msg = res.data.error.message ?? 'Meta API error';
        if (/rate.?limit|too many/i.test(msg)) noteMetaRateLimitError();
        throw Object.assign(new Error(msg), { metaError: res.data.error });
      }
      all.push(...(res.data?.data ?? []));
      nextUrl = res.data?.paging?.next ?? null;
      pageCount++;
    } while (nextUrl && pageCount < pageLimit);
    return all;
  }

  async function returnCachedConversations(reason: string): Promise<NextResponse> {
    const cached = await getInboxConversationListFromDb(id);
    if (cached && cached.length > 0) {
      return NextResponse.json({
        conversations: cached,
        fromCache: true,
        stale: true,
        emptyHint:
          'Showing your saved conversation list while Meta limits API usage. Tap Retry in a few minutes for a live refresh.',
      });
    }
    return NextResponse.json({
      conversations: [],
      error: reason,
      throttled: true,
    });
  }

  try {
    let rawConversations: ConvItem[];
    try {
      rawConversations = await fetchAllConversations(conversationsPath, queryParams, activeToken, deltaMode ? 1 : 5);
    } catch (innerErr) {
      const metaErr = (innerErr as { metaError?: { message?: string; code?: number } }).metaError;
      if (metaErr) {
        const msg = metaErr.message ?? '';
        const code = metaErr.code;
        const metaMsg = typeof msg === 'string' ? msg : '';
        if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access'))
          return NextResponse.json({
            conversations: [],
            error: isInstagramBusinessLogin
              ? 'Your Instagram session has expired. Reconnect your Instagram account to refresh it.'
              : 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
            debug: { rawMessage: metaMsg, code, metaMessage: metaMsg },
          });
        if (code === 3 || /capability|does not have the capability/i.test(metaMsg))
          return NextResponse.json({
            conversations: [],
            error: isInstagramBusinessLogin
              ? 'Instagram inbox needs Standard or Advanced Access for instagram_business_manage_messages. In Meta for Developers: App Dashboard, go to App Review, Permissions and features, find instagram_business_manage_messages and add your Instagram account as a tester under Roles. Then reconnect your Instagram account.'
              : 'Instagram inbox needs Advanced Access. In Meta for Developers: App Dashboard, App Review, Permissions and features, find instagram_manage_messages and Request Advanced Access. Add test users under Roles if the app is in Development mode. Then reconnect Facebook and Instagram from the sidebar and choose your Page.',
            debug: { rawMessage: metaMsg, code, metaMessage: metaMsg },
          });
        return NextResponse.json({ conversations: [], error: metaMsg, debug: { rawMessage: metaMsg, code, metaMessage: metaMsg } });
      }
      throw innerErr;
    }

    // Build the set of IDs and usernames that belong to "us" so we can exclude our account
    // from the conversation sender list. We check both ID and username because Instagram's
    // participants API sometimes returns a different ID format than what is stored in the DB.
    const ourIds = new Set<string>();
    if (account.platformUserId) ourIds.add(account.platformUserId);
    if (linkedPageId) ourIds.add(linkedPageId as string);
    const ourUsernames = new Set<string>();
    if (account.username) ourUsernames.add(account.username.toLowerCase());

    let list = rawConversations.map((c) => {
      const participants = c.participants?.data ?? [];
      const others = participants.filter((p) => {
        if (!p.id) return true; // no ID = unknown participant, include it
        if (ourIds.has(p.id)) return false; // matched by ID
        if (p.username && ourUsernames.has(p.username.toLowerCase())) return false; // matched by username
        return true;
      });
      const sendersData = others.length > 0 ? others : participants;
      return {
      id: c.id,
      updatedTime: c.updated_time ?? null,
        senders: sendersData.map((s) => ({
          id: s.id,
          name: s.name,
          username: s.username,
          pictureUrl: (s.profile_pic ?? s.picture?.data?.url ?? null) as string | null,
        })),
        messageCount: undefined as number | undefined,
      };
    });

    // Enrich senders with profile picture only when data is missing from the conversation list.
    // - Skip any sender that already has a pictureUrl from the participants response.
    // - Check the app_kv profile cache first (7-day TTL) before making a live API call.
    // This reduces enrich calls from up to 20 per Inbox open to near-zero for returning users.
    const idsToEnrich = new Set<string>();
    for (const conv of list) {
      for (const s of conv.senders) {
        // Only enrich if we don't already have a picture from the conversation list
        if (s.id && !s.pictureUrl) idsToEnrich.add(s.id);
      }
    }
    const skipProfileEnrich = isMetaNonCriticalThrottled();
    const profileCachePlatform = isInstagram ? 'instagram' : 'facebook';
    if (idsToEnrich.size > 0) {
      try {
        const profiles = new Map<
          string,
          { name?: string; username?: string; pictureUrl?: string | null }
        >();

        if (skipProfileEnrich) {
          for (const enrichId of idsToEnrich) {
            const cached = await readInboxProfileCache(profileCachePlatform, enrichId);
            if (cached) profiles.set(enrichId, cached);
          }
        } else if (isInstagram) {
          const enrichIds = Array.from(idsToEnrich).slice(0, 20);
          for (const id of enrichIds) {
            // Check cache first — avoid API call if profile was fetched recently
            const cached = await readInboxProfileCache('instagram', id);
            if (cached) {
              profiles.set(id, cached);
              continue;
            }
            try {
              if (isInstagramBusinessLogin) {
                const profileRes = await runMetaGraphRequest(
                  'conversation-sender-profile',
                  () =>
                    axios.get<{
                      id?: string;
                      name?: string;
                      username?: string;
                      profile_pic?: string;
                      profile_picture_url?: string;
                      picture?: { data?: { url?: string } };
                    }>(`https://graph.instagram.com/v25.0/${id}`, {
                      params: {
                        fields: 'name,username,profile_pic,profile_picture_url,picture',
                        access_token: igUserToken!,
                      },
                      timeout: 12_000,
                    })
                );
                noteMetaUsageFromHeaders(profileRes.headers);
                const p = profileRes.data;
                const pictureUrl = p.profile_pic ?? p.profile_picture_url ?? p.picture?.data?.url ?? null;
                const profileData = { name: p.name, username: p.username, pictureUrl };
                profiles.set(id, profileData);
                void writeInboxProfileCache('instagram', id, profileData);
                if (p?.id && p.id !== id) {
                  profiles.set(p.id, profileData);
                  void writeInboxProfileCache('instagram', p.id, profileData);
                }
              } else {
                const profileRes = await runMetaGraphRequest(
                  'conversation-sender-profile',
                  () =>
                    axios.get<{
                      id?: string;
                      name?: string;
                      username?: string;
                      profile_pic?: string;
                      picture?: { data?: { url?: string } };
                    }>(`${baseUrl}/${id}`, {
                      params: {
                        fields: 'id,name,username,profile_pic,picture.type(large)',
                        access_token: activeToken,
                        ...(isInstagram ? { platform: 'instagram' } : {}),
                      },
                      timeout: 12_000,
                    })
                );
                noteMetaUsageFromHeaders(profileRes.headers);
                const p = profileRes.data;
                const pictureUrl = p.profile_pic ?? p.picture?.data?.url ?? null;
                const profileData = { name: p.name, username: p.username, pictureUrl };
                profiles.set(id, profileData);
                void writeInboxProfileCache('instagram', id, profileData);
                if (p?.id && p.id !== id) {
                  profiles.set(p.id, profileData);
                  void writeInboxProfileCache('instagram', p.id, profileData);
                }
              }
            } catch (e) {
              if (e instanceof MetaGraphThrottledError) break;
            }
          }
        } else {
          // Facebook Page messaging: batch lookup, then per-user fallback for any still missing.
          const enrichIds = Array.from(idsToEnrich).slice(0, 50);
          for (const id of enrichIds) {
            const cached = await readInboxProfileCache('facebook', id);
            if (cached?.pictureUrl || cached?.name) {
              profiles.set(id, cached);
            }
          }
          const needBatch = enrichIds.filter((id) => !profiles.has(id));
          if (needBatch.length > 0) {
            try {
              const profileRes = await axios.get<
                Record<
                  string,
                  {
                    id?: string;
                    name?: string;
                    first_name?: string;
                    last_name?: string;
                    picture?: { data?: { url?: string } };
                  }
                >
              >(baseUrl, {
                params: {
                  ids: needBatch.join(','),
                  fields: 'id,name,first_name,last_name,picture.type(large)',
                  access_token: token,
                },
                timeout: 30_000,
              });
              const raw = profileRes.data ?? {};
              for (const [k, v] of Object.entries(raw)) {
                const fullName =
                  v.name ||
                  [v.first_name, v.last_name].filter(Boolean).join(' ').trim() ||
                  undefined;
                const profileData = {
                  name: fullName,
                  username: undefined,
                  pictureUrl: v.picture?.data?.url ?? null,
                };
                profiles.set(k, profileData);
                void writeInboxProfileCache('facebook', k, profileData);
              }
            } catch {
              /* batch may partially fail */
            }
          }
          for (const id of enrichIds) {
            if (profiles.get(id)?.pictureUrl) continue;
            try {
              const profileRes = await axios.get<{
                name?: string;
                first_name?: string;
                last_name?: string;
                picture?: { data?: { url?: string } };
              }>(`${baseUrl}/${id}`, {
                params: { fields: 'name,first_name,last_name,picture.type(large)', access_token: token },
                timeout: 12_000,
              });
              const v = profileRes.data;
              const fullName =
                v.name ||
                [v.first_name, v.last_name].filter(Boolean).join(' ').trim() ||
                undefined;
              const profileData = {
                name: fullName,
                username: undefined,
                pictureUrl: v.picture?.data?.url ?? null,
              };
              profiles.set(id, profileData);
              void writeInboxProfileCache('facebook', id, profileData);
            } catch {
              /* ignore single profile failure */
            }
          }
        }

        if (profiles.size > 0) {
          list = list.map((conv) => ({
            ...conv,
            senders: conv.senders.map((s) => {
              if (!s.id) return s;
              const p = profiles.get(s.id);
              if (!p) return s;
              return {
                ...s,
                name: s.name || p.name || s.name,
                username: s.username || p.username || s.username,
                pictureUrl: s.pictureUrl || p.pictureUrl || s.pictureUrl,
              };
            }),
          }));
        }
      } catch (e) {
        console.warn('[Conversations] profile enrichment failed:', (e as Error)?.message);
      }
    }

    if (sinceIso) {
      list = list.filter((c) => !!c.updatedTime && c.updatedTime.localeCompare(sinceIso) > 0);
    }

    // Optional message counts: capped + sequential (25 parallel Meta calls caused app rate-limit spikes).
    const metaThrottle = isInstagram && isMetaNonCriticalThrottled();
    if (includeMessageCounts && list.length > 0 && !metaThrottle) {
      const toFetch = list.slice(0, 12);
      const counts: number[] = [];
      for (const conv of toFetch) {
        try {
          if (isInstagram) {
            const res = await runMetaGraphRequest(
              'conversations-message-count',
              () =>
                axios.get<{ messages?: { data?: unknown[] }; error?: { message?: string } }>(
                  `${igBaseUrl}/${conv.id}`,
                  { params: { fields: 'messages', access_token: activeToken }, timeout: 8_000 }
                )
            );
            if (res.data?.error) counts.push(0);
            else counts.push((res.data?.messages?.data ?? []).length);
          } else {
            const res = await runMetaGraphRequest(
              'conversations-message-count',
              () =>
                axios.get<{ data?: unknown[] }>(`${baseUrl}/${conv.id}/messages`, {
                  params: { fields: 'id', access_token: token },
                  timeout: 8_000,
                })
            );
            counts.push((res.data?.data ?? []).length);
          }
        } catch {
          counts.push(0);
        }
      }
      list = list.map((c, i) => ({
        ...c,
        messageCount: i < counts.length ? counts[i] : undefined,
      }));
    }

    const emptyHint =
      isInstagram && list.length === 0
        ? isInstagramBusinessLogin
          ? 'No Instagram conversations returned. Confirm instagram_business_manage_messages is granted, then reconnect your Instagram account.'
          : 'No Instagram conversations returned. Open Meta App Dashboard and ensure instagram_manage_messages is approved for your Page, then reconnect Facebook and Instagram.'
        : undefined;

    if (list.length > 0) {
      void setInboxConversationListInDb(account.id, list as InboxConversationListItem[]);
    }

    return NextResponse.json({
      conversations: list,
      ...(emptyHint ? { emptyHint } : {}),
    });
  } catch (e) {
    if (e instanceof MetaGraphThrottledError) {
      console.warn('[Conversations] Meta Graph throttled:', e.message);
      return returnCachedConversations(
        'Meta inbox loading is paused briefly because the app hit Meta API usage limits. Wait a few minutes, then tap Retry.'
      );
    }
    if (isMetaNonCriticalThrottled() || isMetaRateLimitResponse(e)) {
      console.warn('[Conversations] Meta rate limited, serving cache if available');
      return returnCachedConversations(
        'Meta is temporarily limiting inbox requests. Wait a few minutes and tap Retry.'
      );
    }
    const err = e as { message?: string; code?: string; response?: { data?: unknown; status?: number } };
    const msg = err?.message ?? '';
    const status = err?.response?.status;
    const axiosData = err?.response?.data;
    const metaErrorMsg = axiosData && typeof axiosData === 'object' && (axiosData as { error?: { message?: string } }).error?.message;
    const metaErrorStr = typeof metaErrorMsg === 'string' ? metaErrorMsg : '';
    const isCapabilityError = status === 400 && (/(#3)|capability|does not have the capability/i.test(metaErrorStr));
    if (isCapabilityError)
      return NextResponse.json({
        conversations: [],
        error: isInstagramBusinessLogin
          ? 'Instagram inbox needs Standard or Advanced Access for instagram_business_manage_messages. In Meta for Developers: App Dashboard, go to App Review, Permissions and features, find instagram_business_manage_messages and add your Instagram account as a tester under Roles. Then reconnect your Instagram account.'
          : 'Instagram inbox needs Advanced Access. In Meta for Developers: App Dashboard, App Review, Permissions and features, find instagram_manage_messages and Request Advanced Access. Add test users under Roles if the app is in Development mode. Then reconnect Facebook and Instagram from the sidebar and choose your Page.',
        debug: { rawMessage: msg, responseData: axiosData, metaMessage: metaErrorMsg },
      });
    const isTimeout = err?.code === 'ECONNABORTED' || /timeout|408/i.test(msg);
    if (status === 400) {
      const metaMsg = axiosData && typeof axiosData === 'object' && (axiosData as { error?: { message?: string } }).error?.message;
      const hint = isInstagramBusinessLogin
        ? 'Instagram returned 400. Ensure instagram_business_manage_messages is granted and your account is added as a tester in Meta App Dashboard under Roles. Reconnect your Instagram account and try again.'
        : account.platform === 'INSTAGRAM'
          ? 'Instagram returned 400. Ensure instagram_manage_messages is granted: reconnect from the sidebar and choose your Page, or request Advanced Access in Meta App Dashboard.'
          : 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.';
      return NextResponse.json({
        conversations: [],
        error: hint,
        debug: { rawMessage: msg, responseData: axiosData, ...(metaMsg ? { metaMessage: metaMsg } : {}) },
      });
    }
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth'))
      return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.', debug: { rawMessage: msg, responseData: axiosData } });
    if (isTimeout) {
      const cached = await getInboxConversationListFromDb(account.id);
      if (cached && cached.length > 0) {
        return NextResponse.json({
          conversations: cached,
          fromCache: true,
          stale: true,
          emptyHint: 'Showing saved conversations. Live refresh timed out; tap Retry in a moment.',
        });
      }
      return NextResponse.json({ conversations: [], error: 'The request to load conversations timed out. Try again. If you have many Instagram conversations, request Advanced Access for instagram_manage_messages in Meta App Dashboard, or reconnect and choose your Page.', debug: { rawMessage: msg, responseData: axiosData } });
    }
    const cached = await getInboxConversationListFromDb(account.id);
    if (cached && cached.length > 0) {
      return NextResponse.json({
        conversations: cached,
        fromCache: true,
        stale: true,
        emptyHint: 'Showing saved conversations. Live refresh failed; tap Retry.',
        debug: { rawMessage: msg, responseData: axiosData },
      });
    }
    console.error('[Conversations] error:', e);
    return NextResponse.json({ conversations: [], error: 'Could not load conversations.', debug: { rawMessage: msg, responseData: axiosData } });
  }
}
