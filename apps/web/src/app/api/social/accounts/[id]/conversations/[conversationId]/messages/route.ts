import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';

const fbBaseUrl = 'https://graph.facebook.com/v18.0';
const igBaseUrl = 'https://graph.instagram.com/v25.0';

/**
 * GET /api/social/accounts/[id]/conversations/[conversationId]/messages
 * Returns messages for a conversation (IG/FB DMs) and recipientId for replying.
 *
 * Two API paths depending on how the IG account was connected:
 * - Instagram Business Login (loginMethod: 'instagram_business'):
 *     GET graph.instagram.com/v25.0/{CONVO_ID}?fields=messages  →  message IDs
 *     then GET graph.instagram.com/v25.0/{MSG_ID}?fields=id,created_time,from,to,message  per message
 * - Facebook Login (default):
 *     GET graph.facebook.com/v18.0/{CONVO_ID}/messages (existing flow)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id, conversationId } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK' && account.platform !== 'TWITTER') {
    return NextResponse.json({ messages: [], error: 'Conversations are only available for Instagram, Facebook, and X (Twitter).' });
  }
  if (!conversationId) {
    return NextResponse.json({ messages: [], error: 'conversationId required' }, { status: 400 });
  }

  // --- Twitter (X) DMs: GET only. We fetch via /2/dm_conversations/:id/dm_events (and fallback /2/dm_conversations/with/:participant_id/dm_events). No test message is sent. ---
  if (account.platform === 'TWITTER') {
    const token = account.accessToken ?? '';
    const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
      ? account.credentialsJson : {}) as Record<string, unknown>;
    // Only use OAuth 1.0a if THIS account was connected via OAuth 1.0a (credentialsJson).
    // Env var TWITTER_ACCESS_TOKEN may belong to a different X account (dev account).
    const oauth1UserToken = credJson.twitterOAuth1AccessToken as string | undefined;
    const oauth1UserSecret = credJson.twitterOAuth1AccessTokenSecret as string | undefined;
    const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
    const ourId = String(account.platformUserId ?? '');

    try {
      const allMessages: Array<{ id: string; fromId: string | null; fromName: string | null; message: string; createdTime: string | null; isFromPage: boolean }> = [];
      const allEventParticipantIds = new Set<string>();
      let nextToken: string | null = null;
      let pageCount = 0;
      const maxPages = 5;
      const userMap = new Map<string, string>();
      const userObjMap = new Map<string, { name?: string; username?: string; profile_image_url?: string }>();
      const dmConversationUrl = `https://api.x.com/2/dm_conversations/${conversationId}/dm_events`;

      do {
        const params: Record<string, string> = {
          'dm_event.fields': 'id,text,sender_id,created_at,participant_ids',
          event_types: 'MessageCreate',
          expansions: 'sender_id,participant_ids',
          'user.fields': 'id,name,username,profile_image_url',
          max_results: '100',
        };
        if (nextToken) params.pagination_token = nextToken;

        const requestConfig = useOAuth1ForDm
          ? {
              params,
              headers: signTwitterRequest('GET', dmConversationUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, params),
              timeout: 15_000,
              validateStatus: () => true,
            }
          : {
              params,
              headers: { Authorization: `Bearer ${token}` },
              timeout: 15_000,
              validateStatus: () => true,
            };

        const res = await axios.get<{
          data?: Array<{
            id: string;
            event_type?: string;
            created_at?: string;
            sender_id?: string;
            text?: string;
            participant_ids?: string[];
          }>;
          includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
          meta?: { next_token?: string };
          error?: { message?: string };
        }>(dmConversationUrl, requestConfig);
        if (res.status === 429) {
          return NextResponse.json(
            { messages: [], recipientId: null, error: 'X is limiting requests. Wait a few minutes and try again.' },
            { status: 429 }
          );
        }
        if (res.data?.error) {
          return NextResponse.json({
            messages: [],
            recipientId: null,
            error: res.data.error.message ?? 'Could not load X messages.',
          });
        }
        for (const u of res.data?.includes?.users ?? []) {
          userMap.set(u.id, u.username ?? u.name ?? u.id);
          userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
        }
        for (const ev of res.data?.data ?? []) {
          if (Array.isArray(ev.participant_ids)) {
            for (const pid of ev.participant_ids) if (pid) allEventParticipantIds.add(pid);
          }
          if (ev.event_type !== 'MessageCreate') continue;
          const fromId = ev.sender_id ?? null;
          const isFromPage = fromId === ourId;
          allMessages.push({
            id: ev.id,
            fromId,
            fromName: fromId ? (userMap.get(fromId) ?? null) : null,
            message: ev.text ?? '',
            createdTime: ev.created_at ?? null,
            isFromPage,
          });
        }
        nextToken = res.data?.meta?.next_token ?? null;
        pageCount++;
      } while (nextToken && pageCount < maxPages);

      // For 1:1 conversations, also try the "with" endpoint in case it returns more history than the conversation-id endpoint
      let recipientIdFromConvo: string | null = null;
      for (const part of conversationId.split('-')) {
        if (part && part !== ourId) {
          recipientIdFromConvo = part;
          break;
        }
      }
      if (recipientIdFromConvo && allMessages.length < 50) {
        try {
          const withUrl = `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(recipientIdFromConvo)}/dm_events`;
          const existingIds = new Set(allMessages.map((m) => m.id));
          let withNext: string | null = null;
          let withPages = 0;
          do {
            const withParams: Record<string, string> = {
              'dm_event.fields': 'id,text,sender_id,created_at,event_type',
              event_types: 'MessageCreate',
              expansions: 'sender_id',
              'user.fields': 'id,name,username,profile_image_url',
              max_results: '100',
            };
            if (withNext) withParams.pagination_token = withNext;
            const withRes = await axios.get<{
              data?: Array<{ id: string; event_type?: string; sender_id?: string; text?: string; created_at?: string }>;
              includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
              meta?: { next_token?: string };
              error?: { message?: string };
            }>(withUrl, {
              params: withParams,
              headers: useOAuth1ForDm
                ? signTwitterRequest('GET', withUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, withParams)
                : { Authorization: `Bearer ${token}` },
              timeout: 15_000,
              validateStatus: () => true,
            });
            if (withRes.status === 429 || withRes.data?.error) break;
            for (const u of withRes.data?.includes?.users ?? []) {
              userMap.set(u.id, u.username ?? u.name ?? u.id);
              userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
            }
            for (const ev of withRes.data?.data ?? []) {
              if ((ev.event_type != null && ev.event_type !== 'MessageCreate') || existingIds.has(ev.id)) continue;
              existingIds.add(ev.id);
              const fromId = ev.sender_id ?? null;
              allMessages.push({
                id: ev.id,
                fromId,
                fromName: fromId ? (userMap.get(fromId) ?? null) : null,
                message: ev.text ?? '',
                createdTime: ev.created_at ?? null,
                isFromPage: fromId === ourId,
              });
            }
            withNext = withRes.data?.meta?.next_token ?? null;
            withPages++;
          } while (withNext && withPages < 5);
        } catch {
          // ignore - use what we have from the main endpoint
        }
      }

      allMessages.sort((a, b) => {
        const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return tA - tB;
      });
      let recipientId: string | null = null;
      for (const m of allMessages) {
        if (m.fromId && m.fromId !== ourId) {
          recipientId = m.fromId;
          break;
        }
      }
      if (!recipientId && ourId) {
        for (const pid of allEventParticipantIds) {
          if (pid !== ourId) {
            recipientId = pid;
            break;
          }
        }
      }
      // X API doesn't return participant_ids for MessageCreate. Parse conversationId as fallback.
      // Conversation ID format: {numericId1}-{numericId2}
      if (!recipientId && ourId) {
        for (const part of conversationId.split('-')) {
          if (part && part !== ourId) {
            recipientId = part;
            break;
          }
        }
      }

      // If we still don't have user info for the recipient, fetch it from the X API.
      if (recipientId && !userObjMap.has(recipientId)) {
        try {
          const recipientRes = await axios.get<{
            data?: { id: string; name?: string; username?: string; profile_image_url?: string };
          }>(`https://api.x.com/2/users/${recipientId}`, {
            params: { 'user.fields': 'id,name,username,profile_image_url' },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8_000,
          });
          if (recipientRes.data?.data) {
            const u = recipientRes.data.data;
            userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
            userMap.set(u.id, u.username ?? u.name ?? u.id);
          }
        } catch {
          // ignore - we'll fall back to "Private account"
        }
      }

      const recipientUser = recipientId ? userObjMap.get(recipientId) : null;
      const recipientName = recipientUser?.name ?? recipientUser?.username ?? (recipientId ? 'Private account' : null);
      const recipientPictureUrl = recipientUser?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null;
      // Enrich allMessages with proper fromName now that userMap may have been updated
      const enrichedMessages = allMessages.map((m) => ({
        ...m,
        fromName: m.fromId ? (userMap.get(m.fromId) ?? m.fromName) : m.fromName,
      }));
      return NextResponse.json({
        messages: enrichedMessages,
        recipientId,
        ...(recipientName && { recipientName: recipientName }),
        ...(recipientPictureUrl && { recipientPictureUrl: recipientPictureUrl }),
      });
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string | { message?: string } } }; message?: string };
      const status = err?.response?.status;
      const bodyError = err?.response?.data?.error;
      const msg = typeof bodyError === 'string'
        ? bodyError
        : bodyError?.message ?? err?.message ?? 'Could not load X messages.';
      if (status === 429) {
        return NextResponse.json(
          { messages: [], recipientId: null, error: 'X is limiting requests. Wait a few minutes and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json({ messages: [], recipientId: null, error: msg });
    }
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; igUserToken?: string; linkedPageId?: string };

  const isInstagramBusinessLogin =
    account.platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  // For Instagram Business Login, account.accessToken IS the long-lived Instagram User token.
  const activeToken = account.accessToken || '';
  // The IDs that belong to "us" (our account or linked Page) for isFromPage detection.
  const ourIds = new Set<string>([account.platformUserId, credJson.linkedPageId].filter((x): x is string => !!x));

  try {
    if (isInstagramBusinessLogin) {
      // Step 1: get message IDs from the conversation
      const convoRes = await axios.get<{
        messages?: {
          data?: Array<{ id: string; created_time?: string }>;
        };
        id?: string;
        error?: { message?: string; code?: number };
      }>(`${igBaseUrl}/${conversationId}`, {
        params: { fields: 'messages', access_token: activeToken },
        timeout: 15_000,
      });

      if (convoRes.data?.error) {
        const errMsg = convoRes.data.error.message ?? '';
        return NextResponse.json({ messages: [], recipientId: null, error: errMsg || 'Could not load messages.' });
      }

      const messageIds = (convoRes.data?.messages?.data ?? []).map((m) => m.id);
      // Only the 20 most recent messages are accessible via graph.instagram.com
      const recentIds = messageIds.slice(0, 20);

      // Step 2: fetch each message detail in parallel
      type IgMessage = {
        id: string;
        created_time?: string;
        from?: { id?: string; username?: string };
        to?: { data?: Array<{ id?: string; username?: string }> };
        message?: string;
        error?: { message?: string; code?: number };
      };
      const msgDetails = await Promise.all(
        recentIds.map((msgId) =>
          axios
            .get<IgMessage>(`${igBaseUrl}/${msgId}`, {
              params: { fields: 'id,created_time,from,to,message', access_token: activeToken },
              timeout: 10_000,
            })
            .then((r) => r.data)
            .catch(() => null)
        )
      );

      let list = msgDetails
        .filter((m): m is IgMessage => m !== null && !m.error)
        .map((m) => ({
          id: m.id,
          fromId: m.from?.id ?? null,
          fromName: m.from?.username ?? null,
          message: m.message ?? '',
          createdTime: m.created_time ?? null,
          isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
        }));

      // Chronological order: oldest first
      list = list.slice().sort((a, b) => {
        const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return tA - tB;
      });

      // Recipient is the first sender that is not us
      let recipientId: string | null = null;
      for (const m of list) {
        if (m.fromId && !ourIds.has(m.fromId)) {
          recipientId = m.fromId;
          break;
        }
      }

      return NextResponse.json({ messages: list, recipientId });
    }

    // --- Facebook Login flow (existing) ---
    const res = await axios.get<{
      data?: Array<{
        id: string;
        from?: { id?: string; name?: string; email?: string };
        to?: { data?: Array<{ id?: string; name?: string }> };
        message?: string;
        created_time?: string;
        attachments?: { data?: Array<{ type?: string; payload?: { url?: string } }> };
      }>;
      paging?: { next?: string; previous?: string };
      error?: { message: string; code?: number };
    }>(`${fbBaseUrl}/${conversationId}/messages`, {
      params: {
        fields: 'id,from,to,message,created_time,attachments',
        access_token: activeToken,
      },
      timeout: 15_000,
    });

    if (res.data?.error) {
      const msg = res.data.error.message ?? '';
      if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access')) {
        return NextResponse.json({
          messages: [],
          recipientId: null,
          error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
        });
      }
      return NextResponse.json({ messages: [], recipientId: null, error: msg });
    }

    let list = (res.data?.data ?? []).map((m) => ({
      id: m.id,
      fromId: m.from?.id ?? null,
      fromName: m.from?.name ?? null,
      message: m.message ?? '',
      createdTime: m.created_time ?? null,
      isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
    }));

    let recipientId: string | null = null;
    for (const m of list) {
      if (m.fromId && !ourIds.has(m.fromId)) {
        recipientId = m.fromId;
        break;
      }
    }

    // Chronological order: oldest at top, newest at bottom.
    list = list.slice().sort((a, b) => {
      const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return tA - tB;
    });

    return NextResponse.json({ messages: list, recipientId });
  } catch (e) {
    const err = e as { message?: string; response?: { data?: unknown; status?: number } };
    const msg = err?.message ?? '';
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth')) {
      return NextResponse.json({
        messages: [],
        recipientId: null,
        error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
      });
    }
    console.error('[Conversation messages] error:', e);
    return NextResponse.json({
      messages: [],
      recipientId: null,
      error: 'Could not load conversation messages.',
    });
  }
}

/**
 * POST /api/social/accounts/[id]/conversations/[conversationId]/messages
 * Body: { text: string, recipientId?: string }
 * Sends a message in the conversation (IG/FB).
 *
 * - Instagram Business Login: POST graph.instagram.com/v25.0/me/messages
 * - Facebook Login: POST graph.facebook.com/v18.0/{PAGE_ID}/messages
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id, conversationId } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK' && account.platform !== 'TWITTER') {
    return NextResponse.json({ message: 'Sending is only available for Instagram, Facebook, and X (Twitter).' }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ message: 'conversationId required' }, { status: 400 });
  }

  let body: { text?: string; recipientId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ message: 'text is required' }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; igUserToken?: string; linkedPageId?: string };

  const isInstagramBusinessLogin =
    account.platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  // account.accessToken is always the correct token for both login methods.
  const activeToken = account.accessToken || '';
  // ourIds contains both the IG Business Account ID and the linked Facebook Page ID.
  // Messages from either of those IDs are "from us" and should NOT be treated as the recipient.
  const ourIds = new Set<string>([account.platformUserId, credJson.linkedPageId].filter((x): x is string => !!x));

  // For Facebook Login Instagram, also look up the linked Page ID from the FACEBOOK social account
  // (same access token stored there), in case credJson.linkedPageId is not set (older accounts).
  let resolvedPageId: string | null = credJson.linkedPageId ?? null;
  if (account.platform === 'INSTAGRAM' && !isInstagramBusinessLogin && !resolvedPageId) {
    try {
      const fb = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', accessToken: activeToken },
        select: { platformUserId: true },
      });
      if (fb?.platformUserId) resolvedPageId = fb.platformUserId;
    } catch { /* ignore */ }
  }
  if (resolvedPageId) ourIds.add(resolvedPageId);

  let recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : null;

  // X (Twitter): recipientId is required (the other participant's user id). Use OAuth 1.0a when set (same as read).
  if (account.platform === 'TWITTER') {
    if (!recipientId) {
      return NextResponse.json({ message: 'recipientId is required to send an X (Twitter) DM.' }, { status: 400 });
    }
    const credJsonX = (account.credentialsJson && typeof account.credentialsJson === 'object'
      ? account.credentialsJson : {}) as Record<string, unknown>;
    const oauth1UserToken = credJsonX.twitterOAuth1AccessToken as string | undefined;
    const oauth1UserSecret = credJsonX.twitterOAuth1AccessTokenSecret as string | undefined;
    const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
    const postUrl = `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(recipientId)}/messages`;
    const postHeaders = useOAuth1ForDm
      ? { ...signTwitterRequest('POST', postUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, {}), 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' };
    try {
      await axios.post<{ data?: { dm_conversation_id?: string; dm_event_id?: string }; error?: { message?: string } }>(
        postUrl,
        { text: text.slice(0, 10000) },
        { headers: postHeaders, timeout: 15_000 }
      );
      return NextResponse.json({ ok: true, message: 'Message sent.' });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } }; status?: number } };
      const msg = err?.response?.data?.error?.message ?? (e as Error)?.message ?? 'Failed to send X message.';
      const isPrivateAccount = /private|protected|cannot send|not allowed|can't send|unable to send|message.*restricted/i.test(msg);
      return NextResponse.json(
        { message: isPrivateAccount ? 'X (Twitter) API does not allow sending messages to private accounts.' : (msg || 'Failed to send message. Reconnect your X account from the sidebar.') },
        { status: err?.response?.status && err.response.status >= 400 ? err.response.status : 500 }
      );
    }
  }

  if (!recipientId) {
    try {
      if (isInstagramBusinessLogin) {
        // Step 1: Try to get recipientId from conversation participants (faster, no per-message fetches)
        try {
          const participantsRes = await axios.get<{
            participants?: { data?: Array<{ id?: string; username?: string }> };
          }>(`${igBaseUrl}/${conversationId}`, {
            params: { fields: 'participants', access_token: activeToken },
            timeout: 10_000,
          });
          const participants = participantsRes.data?.participants?.data ?? [];
          for (const p of participants) {
            if (p.id && !ourIds.has(p.id)) {
              recipientId = p.id;
              break;
            }
          }
        } catch { /* fall through to message scanning */ }

        // Step 2: If participants didn't work, scan ALL messages (not just the newest)
        // The newest message may be from US, so we must iterate until we find an incoming message.
        if (!recipientId) {
          const convoRes = await axios.get<{
            messages?: { data?: Array<{ id: string }> };
          }>(`${igBaseUrl}/${conversationId}`, {
            params: { fields: 'messages', access_token: activeToken },
            timeout: 10_000,
          });
          const allMsgIds = convoRes.data?.messages?.data ?? [];
          for (const msgObj of allMsgIds) {
            try {
              const msgRes = await axios.get<{ from?: { id?: string } }>(`${igBaseUrl}/${msgObj.id}`, {
                params: { fields: 'from', access_token: activeToken },
                timeout: 8_000,
              });
              if (msgRes.data?.from?.id && !ourIds.has(msgRes.data.from.id)) {
                recipientId = msgRes.data.from.id;
                break;
              }
            } catch { /* skip this message, try next */ }
          }
        }
      } else {
        const msgRes = await axios.get<{ data?: Array<{ from?: { id?: string } }> }>(
          `${fbBaseUrl}/${conversationId}/messages`,
          {
            params: { fields: 'from', access_token: activeToken },
            timeout: 10_000,
          }
        );
        const messages = msgRes.data?.data ?? [];
        for (const m of messages) {
          // Use ourIds (IG account + linked Page) so we never pick the Page ID as recipient
          if (m.from?.id && !ourIds.has(m.from.id)) {
            recipientId = m.from.id;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[Conversation messages] could not derive recipientId:', (e as Error)?.message);
    }
  }

  if (!recipientId) {
    return NextResponse.json({ message: 'Could not determine recipient. Open the conversation and try again.' }, { status: 400 });
  }

  try {
    if (isInstagramBusinessLogin) {
      // Instagram API with Instagram Login: POST to /{IG_PROFESSIONAL_ACCOUNT_ID}/messages
      // (not /me/messages). See https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
      await axios.post<{ recipient_id?: string; message_id?: string; error?: { message: string } }>(
        `${igBaseUrl}/${account.platformUserId}/messages`,
        {
          recipient: { id: recipientId },
          message: { text: text.slice(0, 1000) },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          params: { access_token: activeToken },
          timeout: 15_000,
        }
      );
    } else {
      // Facebook Login Instagram: the Messenger Platform endpoint requires the FACEBOOK PAGE ID
      // (not the IG Business Account ID). Use linkedPageId if available, fall back to platformUserId.
      // Requires pages_messaging + instagram_manage_messages in the page access token.
      const senderId = resolvedPageId || account.platformUserId;
      await axios.post<{ message_id?: string; error?: { message: string } }>(
        `${fbBaseUrl}/${senderId}/messages`,
        {
          recipient: { id: recipientId },
          message: { text: text.slice(0, 2000) },
          messaging_type: 'RESPONSE',
        },
        {
          headers: { 'Content-Type': 'application/json' },
          params: { access_token: activeToken },
          timeout: 15_000,
        }
      );
    }
    return NextResponse.json({ ok: true, message: 'Message sent.' });
  } catch (e) {
    const err = e as { response?: { data?: { error?: { message?: string; code?: number; error_subcode?: number } }; status?: number } };
    const metaError = err?.response?.data?.error;
    const apiMsg: string = metaError?.message ?? (e as Error)?.message ?? 'Send failed';
    const code = metaError?.code;
    console.error('[Conversation messages] send error — code:', code, 'msg:', apiMsg);

    // Meta 24-hour messaging window (error code 10 or "outside of allowed window")
    const isOutsideWindow = code === 10 || /outside of allowed window|messaging window/i.test(apiMsg);
    if (isOutsideWindow) {
      return NextResponse.json(
        { message: 'FB & IG allow sending messages only within 24 hours of the customer\'s last message.' },
        { status: 400 }
      );
    }

    // Capability error (code 3): missing permission on the token or account not a tester in dev mode.
    // Always include the raw Meta message so the user knows exactly what Meta says.
    const isCapability = code === 3 || /does not have the capability/i.test(apiMsg);
    if (isCapability) {
      return NextResponse.json(
        {
          message: `Meta error: "${apiMsg}". To fix this: reconnect Facebook & Instagram from the sidebar so the app gets a fresh token with the instagram_manage_messages permission. If the app is in Development mode in Meta, the person you are messaging must also have a role on the app (App roles → Roles → Instagram Tester).`,
        },
        { status: 400 }
      );
    }

    // For all other errors, return the actual Meta message so the user sees what went wrong.
    return NextResponse.json(
      { message: apiMsg || 'Failed to send message. Try reconnecting Instagram from the sidebar.' },
      { status: err?.response?.status && err.response.status >= 400 ? err.response.status : 500 }
    );
  }
}
