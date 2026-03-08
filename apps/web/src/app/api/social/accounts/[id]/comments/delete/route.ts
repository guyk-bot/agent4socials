import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * POST /api/social/accounts/[id]/comments/delete
 * Delete a user comment on a Page post (Facebook) or media (Instagram).
 * Body: { commentId: string }
 * Facebook: pages_read_user_content or pages_manage_engagement.
 * Instagram: instagram_manage_comments.
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
  const body = await request.json() as { commentId?: string };
  const commentId = body?.commentId;

  if (!commentId || typeof commentId !== 'string' || !commentId.trim()) {
    return NextResponse.json({ message: 'commentId is required' }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK') {
    return NextResponse.json({ message: 'Comment deletion is only supported for Instagram and Facebook.' }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };
  const isInstagramBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const accessToken = account.accessToken ?? '';

  try {
    if (isInstagramBusinessLogin) {
      await axios.delete(
        `https://graph.instagram.com/v25.0/${commentId}`,
        { params: { access_token: accessToken }, timeout: 15_000 }
      );
    } else {
      await axios.delete(
        `https://graph.facebook.com/v18.0/${commentId}`,
        { params: { access_token: accessToken }, timeout: 15_000 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const axErr = err as { response?: { status?: number; data?: { error?: { message?: string; code?: number } } } };
    const msg = axErr?.response?.data?.error?.message ?? 'Failed to delete comment';
    const code = axErr?.response?.status;
    return NextResponse.json({ message: msg }, { status: code === 401 ? 401 : 400 });
  }
}
