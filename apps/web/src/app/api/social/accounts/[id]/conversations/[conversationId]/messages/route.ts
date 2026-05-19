import { NextRequest, NextResponse, after } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { runFirstWelcomeMaybe } from '@/lib/dm-first-welcome';
import { loadConversationForFirstWelcome } from '@/lib/inbox/load-conversation-for-first-welcome';
import { isMetaNonCriticalThrottled } from '@/lib/meta-usage-guard';
import { deleteInboxMessagesFromDb, getInboxMessagesFromDb, setInboxMessagesInDb } from '@/lib/inbox/inbox-db-cache';

import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

export const maxDuration = 60;

const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

function scheduleDmFirstWelcome(args: Parameters<typeof runFirstWelcomeMaybe>[0]) {
  after(() => {
    void runFirstWelcomeMaybe(args).catch((err) => {
      console.error('[dm-first-welcome]', err);
    });
  });
}

function metaAttachmentTypeFromUrl(url: string, explicit?: string): 'image' | 'video' | 'file' {
  const t = typeof explicit === 'string' ? explicit.toLowerCase() : '';
  if (t === 'image' || t === 'video' || t === 'file') return t;
  const base = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(base)) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/.test(base)) return 'video';
  return 'file';
}

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
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform === 'PINTEREST' || account.platform === 'LINKEDIN') {
    return NextResponse.json({
      messages: [],
      error: null,
      hint:
        account.platform === 'PINTEREST'
          ? 'Pinterest direct messages are not available in this app.'
          : 'LinkedIn direct messages are not available in this app.',
    });
  }
  if (
    account.platform !== 'INSTAGRAM' &&
    account.platform !== 'FACEBOOK' &&
    account.platform !== 'TWITTER'
  ) {
    return NextResponse.json({
      messages: [],
      error: 'Conversations are only available for Instagram, Facebook, and X (Twitter).',
    });
  }
  if (!conversationId) {
    return NextResponse.json({ messages: [], error: 'conversationId required' }, { status: 400 });
  }

  const isBackground = request.nextUrl.searchParams.get('background') === '1';
  const forceRefresh =
    request.nextUrl.searchParams.get('refresh') === '1' ||
    request.nextUrl.searchParams.get('refresh') === 'true';
  // convUpdatedTime: ISO timestamp of the conversation's last platform update.
  // When the client detects the conversation was updated after the last message fetch
  // it passes this so the DB cache can be bypassed if it pre-dates the new message.
  const convUpdatedTime = request.nextUrl.searchParams.get('convUpdatedTime') || null;

  // ── DB cache (instant path) ──────────────────────────────────────────────
  // Serve from the server-side AppKv cache when available. The sync-inbox cron
  // pre-warms every conversation every ~30 min, so returning users never hit
  // the Meta/X API for already-seen conversations.
  // Pass convUpdatedTime so new messages (conv updated after cache write) bypass the cache.
  if (!forceRefresh && (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK')) {
    const cached = await getInboxMessagesFromDb(account.id, conversationId, convUpdatedTime);
    if (cached) {
      // recipientId: pick first sender that isn't us from the cached messages
      const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
        ? account.credentialsJson : {}) as { linkedPageId?: string };
      const ourIds = new Set<string>(
        [account.platformUserId, credJson.linkedPageId].filter((x): x is string => !!x)
      );
      let recipientId: string | null = null;
      for (const m of cached) {
        if (m.fromId && !ourIds.has(m.fromId)) { recipientId = m.fromId; break; }
      }
      return NextResponse.json({ messages: cached, recipientId, error: null });
    }
  }

  // Background prefetch fast-fails when Meta API usage is high (will be retried later).
  if (isBackground && (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') && isMetaNonCriticalThrottled()) {
    return NextResponse.json({ messages: [], error: 'throttled', recipientId: null });
  }

  const loaded = await loadConversationForFirstWelcome(account, conversationId, userId);
  if (!loaded.ok) {
    if (loaded.status === 429) {
      return NextResponse.json({ messages: [], recipientId: null, error: loaded.error }, { status: 429 });
    }
    return NextResponse.json({ messages: [], recipientId: null, error: loaded.error });
  }

  // Write messages to DB so subsequent opens are instant (served from cache above).
  if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
    void setInboxMessagesInDb(account.id, conversationId, loaded.messages).catch(() => {});
  }

  scheduleDmFirstWelcome({
    userId,
    account: {
      id: account.id,
      platform: account.platform,
      platformUserId: account.platformUserId,
      accessToken: account.accessToken,
      credentialsJson: account.credentialsJson,
    },
    conversationId,
    messages: loaded.firstWelcomeRows,
    recipientId: loaded.recipientId,
    isInstagramBusinessLogin: loaded.isInstagramBusinessLogin,
  });

  return NextResponse.json({
    messages: loaded.messages,
    recipientId: loaded.recipientId,
    error: null,
    ...(loaded.recipientName ? { recipientName: loaded.recipientName } : {}),
    ...(loaded.recipientPictureUrl ? { recipientPictureUrl: loaded.recipientPictureUrl } : {}),
  });
}

/**
 * POST /api/social/accounts/[id]/conversations/[conversationId]/messages
 * Body: { text?: string, recipientId?: string, attachments?: Array<{ url: string, type?: 'image'|'video'|'file' }> }
 * Sends a message in the conversation (IG/FB).
 *
 * - Instagram Business Login: POST graph.instagram.com/v25.0/me/messages
 * - Facebook Login: POST graph.facebook.com/v18.0/{PAGE_ID}/messages
 *
 * For Instagram and Facebook you may send public HTTPS URLs as attachments (image, video, or file).
 * Each attachment is sent as its own message, then optional text. X (Twitter) does not support attachments in this endpoint yet.
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
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (
    account.platform !== 'INSTAGRAM' &&
    account.platform !== 'FACEBOOK' &&
    account.platform !== 'TWITTER'
  ) {
    return NextResponse.json({
      message: 'Sending is only available for Instagram, Facebook, and X (Twitter).',
    }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ message: 'conversationId required' }, { status: 400 });
  }

  let body: { text?: string; recipientId?: string; attachments?: Array<{ url?: string; type?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const rawAtt = Array.isArray(body.attachments) ? body.attachments : [];
  const safeAttachments: { url: string; type?: string }[] = [];
  for (const a of rawAtt) {
    const u = typeof a?.url === 'string' ? a.url.trim() : '';
    if (!u.startsWith('https://')) continue;
    safeAttachments.push({
      url: u,
      ...(typeof a?.type === 'string' ? { type: a.type } : {}),
    });
  }

  if (account.platform === 'TWITTER') {
    if (safeAttachments.length > 0) {
      return NextResponse.json(
        {
          message:
            'X (Twitter) DMs in this app support text only for now. Remove attachments or use Instagram or Facebook for media.',
        },
        { status: 400 }
      );
    }
    if (!text) {
      return NextResponse.json({ message: 'text is required' }, { status: 400 });
    }
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
          const allMsgIds = (convoRes.data?.messages?.data ?? []).slice(0, 12);
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

  if (!text && safeAttachments.length === 0) {
    return NextResponse.json(
      { message: 'text or at least one https attachment URL is required' },
      { status: 400 }
    );
  }

  try {
    if (isInstagramBusinessLogin) {
      const url = `${igBaseUrl}/${account.platformUserId}/messages`;
      const commonParams = { access_token: activeToken };
      const commonHeaders = { 'Content-Type': 'application/json' };
      for (const a of safeAttachments) {
        const attType = metaAttachmentTypeFromUrl(a.url, a.type);
        await axios.post<{ recipient_id?: string; message_id?: string; error?: { message: string } }>(
          url,
          {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: attType,
                payload: { url: a.url, is_reusable: true },
              },
            },
          },
          {
            headers: commonHeaders,
            params: commonParams,
            timeout: 15_000,
          }
        );
      }
      if (text) {
        await axios.post<{ recipient_id?: string; message_id?: string; error?: { message: string } }>(
          url,
          {
            recipient: { id: recipientId },
            message: { text: text.slice(0, 1000) },
          },
          {
            headers: commonHeaders,
            params: commonParams,
            timeout: 15_000,
          }
        );
      }
    } else {
      const senderId = resolvedPageId || account.platformUserId;
      const url = `${fbBaseUrl}/${senderId}/messages`;
      const commonParams = { access_token: activeToken };
      const commonHeaders = { 'Content-Type': 'application/json' };
      for (const a of safeAttachments) {
        const attType = metaAttachmentTypeFromUrl(a.url, a.type);
        await axios.post<{ message_id?: string; error?: { message: string } }>(
          url,
          {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: attType,
                payload: { url: a.url, is_reusable: true },
              },
            },
            messaging_type: 'RESPONSE',
          },
          {
            headers: commonHeaders,
            params: commonParams,
            timeout: 15_000,
          }
        );
      }
      if (text) {
        await axios.post<{ message_id?: string; error?: { message: string } }>(
          url,
          {
            recipient: { id: recipientId },
            message: { text: text.slice(0, 2000) },
            messaging_type: 'RESPONSE',
          },
          {
            headers: commonHeaders,
            params: commonParams,
            timeout: 15_000,
          }
        );
      }
    }
    after(() => {
      void deleteInboxMessagesFromDb(account.id, conversationId).catch(() => {});
    });
    const sentAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      message: 'Message sent.',
      sentMessage: {
        id: `local-${Date.now()}`,
        fromId: account.platformUserId,
        fromName: null,
        message: text,
        createdTime: sentAt,
        isFromPage: true,
      },
    });
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
