import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios, { AxiosResponse } from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';

const baseUrl = 'https://graph.facebook.com/v18.0';
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
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, username: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK' && account.platform !== 'TWITTER') {
    return NextResponse.json({ conversations: [], hint: 'Conversations are only available for Instagram, Facebook, and X (Twitter).' });
  }

  const token = (account.accessToken || '').trim();
  if (!token) {
    return NextResponse.json({
      conversations: [],
      error: 'No access token. Reconnect this account from the sidebar (Reconnect Facebook & Instagram) and choose your Page.',
    }, { status: 200 });
  }

  // --- Twitter (X) DMs: GET /2/dm_events with OAuth 1.0a user token (Access Token + Secret). App-Only Bearer cannot read DMs. ---
  if (account.platform === 'TWITTER') {
    try {
      const ourId = String(account.platformUserId ?? '');
      const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
        ? account.credentialsJson : {}) as Record<string, unknown>;
      const oauth1UserToken = (credJson.twitterOAuth1AccessToken as string | undefined) || process.env.TWITTER_ACCESS_TOKEN;
      const oauth1UserSecret = (credJson.twitterOAuth1AccessTokenSecret as string | undefined) || process.env.TWITTER_ACCESS_TOKEN_SECRET;
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

      do {
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
            }
          : {
              params,
              headers: { Authorization: `Bearer ${token}` },
              timeout: 15_000,
            };

        const res = await axios.get<{
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
          errors?: Array<{ title?: string; detail?: string; type?: string; status?: number }>;
        }>(dmEventsUrl, requestConfig);
        lastRawResponse = { status: res.status, keys: Object.keys(res.data ?? {}), dataLen: res.data?.data?.length ?? null, error: res.data?.error, errors: res.data?.errors };
        const apiErr = res.data?.error ?? (res.data?.errors?.[0]
          ? { message: res.data.errors[0].detail ?? res.data.errors[0].title ?? 'X API error' }
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
        }
        nextToken = res.data?.meta?.next_token ?? null;
        pageCount++;
      } while (nextToken && pageCount < 5);

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
        return {
          id,
          updatedTime: updatedTime || null,
          senders: senders.length > 0 ? senders : [{ id: undefined, name: undefined, username: undefined, pictureUrl: null }],
          messageCount: undefined as number | undefined,
        };
      });

      const missingUserIds = new Set<string>();
      for (const conv of list) {
        for (const s of conv.senders) {
          if (s.id && (s.name === undefined || s.username === undefined)) missingUserIds.add(s.id);
        }
      }
      if (missingUserIds.size > 0) {
        const idsArr = Array.from(missingUserIds).slice(0, 100);
        try {
          const usersRes = await axios.get<{
            data?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }>;
            error?: { message?: string };
          }>('https://api.x.com/2/users', {
            params: { ids: idsArr.join(','), 'user.fields': 'id,name,username,profile_image_url' },
            headers: { Authorization: `Bearer ${token}` },
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
      list.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));

      let debug: { eventCount?: number; conversationCount?: number; tokenCheck?: string; rawErrors?: unknown; dmEventsResponse?: unknown } | undefined;
      if (list.length === 0) {
        let tokenCheck = 'not_checked';
        let rawErrors: unknown;
        try {
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
    if (!linkedPageId && token) {
      // Existing account may have been connected via Facebook before we stored linkedPageId.
      const fb = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', accessToken: token },
        select: { platformUserId: true },
      });
      if (fb?.platformUserId) linkedPageId = fb.platformUserId;
    }
  }

  // Route to the correct API based on login method:
  // - Instagram Business Login → graph.instagram.com/v25.0/me/conversations (Instagram User token)
  // - Facebook Login           → graph.facebook.com/v18.0/{PAGE_ID}/conversations (Page token)
  const conversationsPath = isInstagramBusinessLogin
    ? 'https://graph.instagram.com/v25.0/me/conversations'
    : isInstagram && linkedPageId
      ? `https://graph.facebook.com/v18.0/${linkedPageId}/conversations`
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

  // Fetch all pages of conversations (follow paging.next up to 5 pages).
  async function fetchAllConversations(url: string, params: Record<string, string>, token: string): Promise<ConvItem[]> {
    const all: ConvItem[] = [];
    let nextUrl: string | null = null;
    let pageCount = 0;
    do {
      const res: AxiosResponse<ConvApiResponse> = await axios.get(nextUrl ?? url, {
        params: nextUrl ? { access_token: token } : params,
        timeout: 60_000,
      });
      if (res.data?.error) {
        throw Object.assign(new Error(res.data.error.message ?? 'Meta API error'), { metaError: res.data.error });
      }
      all.push(...(res.data?.data ?? []));
      nextUrl = res.data?.paging?.next ?? null;
      pageCount++;
    } while (nextUrl && pageCount < 5);
    return all;
  }

  try {
    let rawConversations: ConvItem[];
    try {
      rawConversations = await fetchAllConversations(conversationsPath, queryParams, activeToken);
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

    // Enrich senders with profile picture (and name/username if missing).
    // For Instagram we always fetch profiles so we get profile_pic; participants API often doesn't include it.
    const idsToEnrich = new Set<string>();
    for (const conv of list) {
      for (const s of conv.senders) {
        if (s.id) idsToEnrich.add(s.id);
      }
    }
    if (idsToEnrich.size > 0) {
      try {
        const profiles = new Map<
          string,
          { name?: string; username?: string; pictureUrl?: string | null }
        >();

        if (isInstagram) {
          // For Instagram Business Login: use graph.instagram.com with the IG User token.
          // For Facebook Login: use graph.facebook.com with the Page token — sender IDs are
          // Instagram-Scoped IDs (IGSID) which are accessible on graph.facebook.com too.
          await Promise.all(
            Array.from(idsToEnrich).map(async (id) => {
              try {
                if (isInstagramBusinessLogin) {
                  const profileRes = await axios.get<{
                    id?: string; name?: string; username?: string;
                    profile_pic?: string; profile_picture_url?: string;
                    picture?: { data?: { url?: string } };
                  }>(`https://graph.instagram.com/v25.0/${id}`, {
                    params: { fields: 'name,username,profile_pic,profile_picture_url,picture', access_token: igUserToken! },
                    timeout: 15_000,
                  });
                  const p = profileRes.data;
                  const pictureUrl = p.profile_pic ?? p.profile_picture_url ?? p.picture?.data?.url ?? null;
                  // Always use the query `id` as the map key so the lookup in conv.senders always works,
                  // even if the API returns a slightly different id format in the response body.
                  profiles.set(id, { name: p.name, username: p.username, pictureUrl });
                  if (p?.id && p.id !== id) profiles.set(p.id, { name: p.name, username: p.username, pictureUrl });
                } else {
                  // Facebook Login: look up IGSID profile via graph.facebook.com with Page token
                  const profileRes = await axios.get<{
                    id?: string; name?: string; username?: string; profile_pic?: string;
                    picture?: { data?: { url?: string } };
                  }>(`${baseUrl}/${id}`, {
                    params: { fields: 'id,name,username,profile_pic,picture.type(large)', access_token: activeToken },
                    timeout: 15_000,
                  });
                  const p = profileRes.data;
                  const pictureUrl = p.profile_pic ?? p.picture?.data?.url ?? null;
                  profiles.set(id, { name: p.name, username: p.username, pictureUrl });
                  if (p?.id && p.id !== id) profiles.set(p.id, { name: p.name, username: p.username, pictureUrl });
                }
              } catch {
                // ignore per-profile failures
              }
            })
          );
        } else {
          // Facebook Page messaging: batch lookup for name and picture.
          const idsParam = Array.from(idsToEnrich).join(',');
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
              ids: idsParam,
              fields: 'id,name,first_name,last_name,picture',
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
            profiles.set(k, {
              name: fullName,
              username: undefined,
              pictureUrl: v.picture?.data?.url ?? null,
            });
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

    // Optional: fetch message count per conversation for unread badge (limit 25 to avoid timeout)
    if (includeMessageCounts && list.length > 0) {
      const toFetch = list.slice(0, 25);
      const counts = await Promise.all(
        toFetch.map(async (conv): Promise<number> => {
          try {
            if (isInstagram) {
              const res = await axios.get<{ messages?: { data?: unknown[] }; error?: { message?: string } }>(
                `${igBaseUrl}/${conv.id}`,
                { params: { fields: 'messages', access_token: activeToken }, timeout: 8_000 }
              );
              if (res.data?.error) return 0;
              return (res.data?.messages?.data ?? []).length;
            } else {
              const res = await axios.get<{ data?: unknown[] }>(
                `${baseUrl}/${conv.id}/messages`,
                { params: { fields: 'id', access_token: token }, timeout: 8_000 }
              );
              return (res.data?.data ?? []).length;
            }
          } catch {
            return 0;
          }
        })
      );
      list = list.map((c, i) => ({
        ...c,
        messageCount: i < counts.length ? counts[i] : undefined,
      }));
    }

    return NextResponse.json({ conversations: list });
  } catch (e) {
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
    if (isTimeout)
      return NextResponse.json({ conversations: [], error: 'The request to load conversations timed out. Try again. If you have many Instagram conversations, request Advanced Access for instagram_manage_messages in Meta App Dashboard, or reconnect and choose your Page.', debug: { rawMessage: msg, responseData: axiosData } });
    console.error('[Conversations] error:', e);
    return NextResponse.json({ conversations: [], error: 'Could not load conversations.', debug: { rawMessage: msg, responseData: axiosData } });
  }
}
