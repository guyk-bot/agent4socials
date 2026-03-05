import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * POST /api/social/accounts/[id]/comments/reply
 * Reply to a comment on Instagram or Facebook.
 * Body: { commentId: string; message: string }
 */
export async function POST(
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
  const body = await request.json() as { commentId?: string; message?: string };
  const { commentId, message } = body;

  if (!commentId || !message?.trim()) {
    return NextResponse.json({ message: 'commentId and message are required' }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK') {
    return NextResponse.json({ message: 'Comment replies are only supported for Instagram and Facebook.' }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };

  const isInstagramBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const accessToken = account.accessToken ?? '';

  try {
    if (isInstagramBusinessLogin) {
      // Instagram Business Login: reply via graph.instagram.com
      await axios.post(
        `https://graph.instagram.com/v25.0/${commentId}/replies`,
        null,
        {
          params: { message: message.trim(), access_token: accessToken },
          timeout: 15_000,
        }
      );
    } else {
      // Facebook Login (Instagram or Facebook): reply via graph.facebook.com
      await axios.post(
        `https://graph.facebook.com/v18.0/${commentId}/comments`,
        null,
        {
          params: { message: message.trim(), access_token: accessToken },
          timeout: 15_000,
        }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const axErr = err as { response?: { data?: { error?: { message?: string; code?: number } } } };
    const msg = axErr?.response?.data?.error?.message ?? 'Failed to send reply';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
