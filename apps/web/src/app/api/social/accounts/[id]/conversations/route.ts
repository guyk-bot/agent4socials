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

  try {
    const res = await axios.get<{
      data?: Array<{ id: string; updated_time?: string; senders?: { data?: Array<{ username?: string; name?: string }> } }>;
      error?: { message: string };
    }>(`${baseUrl}/${account.platformUserId}/conversations`, {
      params: {
        fields: 'id,updated_time,senders',
        access_token: account.accessToken,
      },
    });

    if (res.data?.error) {
      const msg = res.data.error.message ?? '';
      if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access'))
        return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.' });
      return NextResponse.json({ conversations: [], error: msg });
    }

    const list = (res.data?.data ?? []).map((c) => ({
      id: c.id,
      updatedTime: c.updated_time ?? null,
      senders: c.senders?.data ?? [],
    }));
    return NextResponse.json({ conversations: list });
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth'))
      return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.' });
    console.error('[Conversations] error:', e);
    return NextResponse.json({ conversations: [], error: 'Could not load conversations.' });
  }
}
