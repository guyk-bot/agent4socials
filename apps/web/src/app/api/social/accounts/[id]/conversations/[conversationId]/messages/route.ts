import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/conversations/[conversationId]/messages
 * Returns messages for a conversation (IG/FB DMs) and recipientId for replying.
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
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

  try {
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
    }>(`${baseUrl}/${conversationId}/messages`, {
      params: {
        fields: 'id,from,to,message,created_time,attachments',
        access_token: account.accessToken,
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

    const list = (res.data?.data ?? []).map((m) => ({
      id: m.id,
      fromId: m.from?.id ?? null,
      fromName: m.from?.name ?? null,
      message: m.message ?? '',
      createdTime: m.created_time ?? null,
      isFromPage: m.from?.id === account.platformUserId,
    }));

    // Recipient for reply: the other participant (first "from" that is not our page).
    let recipientId: string | null = null;
    for (const m of list) {
      if (m.fromId && m.fromId !== account.platformUserId) {
        recipientId = m.fromId;
        break;
      }
    }

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
 * Sends a message in the conversation (IG/FB). If recipientId is omitted, it is derived from the conversation.
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
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

  let recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : null;
  if (!recipientId) {
    try {
      const msgRes = await axios.get<{ data?: Array<{ from?: { id?: string } }> }>(
        `${baseUrl}/${conversationId}/messages`,
        {
          params: { fields: 'from', access_token: account.accessToken },
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
    } catch (e) {
      console.warn('[Conversation messages] could not derive recipientId:', (e as Error)?.message);
    }
  }

  if (!recipientId) {
    return NextResponse.json({ message: 'Could not determine recipient. Open the conversation and try again.' }, { status: 400 });
  }

  try {
    // Page Send API: POST /{page-id}/messages
    await axios.post<{ message_id?: string; error?: { message: string } }>(
      `${baseUrl}/${account.platformUserId}/messages`,
      new URLSearchParams({
        recipient: JSON.stringify({ id: recipientId }),
        messaging_type: 'RESPONSE',
        message: JSON.stringify({ text: text.slice(0, 2000) }),
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        params: { access_token: account.accessToken },
        timeout: 15_000,
      }
    );
    return NextResponse.json({ ok: true, message: 'Message sent.' });
  } catch (e) {
    const err = e as { response?: { data?: { error?: { message?: string } }; status?: number } };
    const apiMsg = err?.response?.data?.error?.message ?? (e as Error)?.message ?? 'Send failed';
    if (err?.response?.status === 400 || String(apiMsg).includes('permission') || String(apiMsg).includes('24 hour')) {
      return NextResponse.json(
        { message: apiMsg || 'Cannot send. The user may need to message your page first, or reconnect and grant messaging permission.' },
        { status: 400 }
      );
    }
    console.error('[Conversation messages] send error:', e);
    return NextResponse.json({ message: 'Failed to send message.' }, { status: 500 });
  }
}
