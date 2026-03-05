import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

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
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ messages: [], error: 'Conversations are only available for Instagram and Facebook.' });
  }
  if (!conversationId) {
    return NextResponse.json({ messages: [], error: 'conversationId required' }, { status: 400 });
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
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ message: 'Sending is only available for Instagram and Facebook.' }, { status: 400 });
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
    : {}) as { loginMethod?: string; igUserToken?: string };

  const isInstagramBusinessLogin =
    account.platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  // account.accessToken is always the correct token for both login methods.
  const activeToken = account.accessToken || '';

  let recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : null;

  if (!recipientId) {
    try {
      if (isInstagramBusinessLogin) {
        // Derive recipientId from the conversation participants via graph.instagram.com
        const convoRes = await axios.get<{
          messages?: { data?: Array<{ id: string }> };
          id?: string;
        }>(`${igBaseUrl}/${conversationId}`, {
          params: { fields: 'messages', access_token: activeToken },
          timeout: 10_000,
        });
        const firstMsgId = convoRes.data?.messages?.data?.[0]?.id;
        if (firstMsgId) {
          const msgRes = await axios.get<{ from?: { id?: string } }>(`${igBaseUrl}/${firstMsgId}`, {
            params: { fields: 'from', access_token: activeToken },
            timeout: 10_000,
          });
          if (msgRes.data?.from?.id && msgRes.data.from.id !== account.platformUserId) {
            recipientId = msgRes.data.from.id;
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
          if (m.from?.id && m.from.id !== account.platformUserId) {
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
      // Facebook Login Instagram: POST graph.facebook.com/v18.0/{IG_BUSINESS_ACCOUNT_ID}/messages
      // Use JSON body (not form-encoded) and include platform=instagram so Meta routes this as an IG DM.
      await axios.post<{ message_id?: string; error?: { message: string } }>(
        `${fbBaseUrl}/${account.platformUserId}/messages`,
        {
          recipient: { id: recipientId },
          message: { text: text.slice(0, 2000) },
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
    const err = e as { response?: { data?: { error?: { message?: string; code?: number } }; status?: number } };
    const apiMsg = err?.response?.data?.error?.message ?? (e as Error)?.message ?? 'Send failed';
    const code = err?.response?.data?.error?.code;
    const isCapability = code === 3 || /capability|does not have the capability/i.test(String(apiMsg));
    if (isCapability) {
      return NextResponse.json(
        {
          message: isInstagramBusinessLogin
            ? 'Sending requires Standard or Advanced Access for instagram_business_manage_messages. In Meta for Developers: App Dashboard → App Review → Permissions and features → add your account as Instagram Tester under Roles, then reconnect Instagram.'
            : 'Sending requires Advanced Access for instagram_manage_messages. In Meta for Developers request Advanced Access, add test users, then reconnect Facebook & Instagram from the Dashboard.',
        },
        { status: 400 }
      );
    }
    if (err?.response?.status === 400 || String(apiMsg).includes('permission') || String(apiMsg).includes('24 hour')) {
      return NextResponse.json(
        { message: apiMsg || 'Cannot send. The user may need to message your account first, or reconnect and grant messaging permission.' },
        { status: 400 }
      );
    }
    console.error('[Conversation messages] send error:', e);
    return NextResponse.json({ message: 'Failed to send message.' }, { status: 500 });
  }
}
