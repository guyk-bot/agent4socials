import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/conversations
 * Returns list of conversations (DMs) for this Instagram or Facebook account.
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
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ conversations: [], hint: 'Conversations are only available for Instagram and Facebook.' });
  }

  const isInstagram = account.platform === 'INSTAGRAM';
  const baseUrlForConversations = isInstagram ? 'https://graph.instagram.com/v18.0' : baseUrl;
  const conversationsPath = `/${account.platformUserId}/conversations`;
  const queryParams: Record<string, string> = {
    fields: 'id,updated_time,senders',
    access_token: account.accessToken,
  };
  if (isInstagram) queryParams.platform = 'instagram';

  try {
    const res = await axios.get<{
      data?: Array<{ id: string; updated_time?: string; senders?: { data?: Array<{ username?: string; name?: string }> } }>;
      error?: { message: string };
    }>(`${baseUrlForConversations}${conversationsPath}`, {
      params: queryParams,
      timeout: 60_000,
    });

    if (res.data?.error) {
      const msg = res.data.error.message ?? '';
      const code = (res.data as { error?: { code?: number } }).error?.code;
      if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access'))
        return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.', debug: { rawMessage: msg, code } });
      return NextResponse.json({ conversations: [], error: msg, debug: { rawMessage: msg, code } });
    }

    const list = (res.data?.data ?? []).map((c) => ({
      id: c.id,
      updatedTime: c.updated_time ?? null,
      senders: c.senders?.data ?? [],
    }));
    return NextResponse.json({ conversations: list });
  } catch (e) {
    const err = e as { message?: string; code?: string; response?: { data?: unknown; status?: number } };
    const msg = err?.message ?? '';
    const axiosData = err?.response?.data;
    const isTimeout = err?.code === 'ECONNABORTED' || /timeout|408/i.test(msg);
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth'))
      return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.', debug: { rawMessage: msg, responseData: axiosData } });
    if (isTimeout)
      return NextResponse.json({ conversations: [], error: 'The request to load conversations timed out. Try again. If you have many Instagram conversations, request Advanced Access for instagram_manage_messages in Meta App Dashboard, or reconnect and choose your Page.', debug: { rawMessage: msg, responseData: axiosData } });
    console.error('[Conversations] error:', e);
    return NextResponse.json({ conversations: [], error: 'Could not load conversations.', debug: { rawMessage: msg, responseData: axiosData } });
  }
}
