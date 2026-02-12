import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

export async function PATCH(
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
    select: { id: true, platform: true, accessToken: true, platformUserId: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'INSTAGRAM') {
    return NextResponse.json({ message: 'Refresh only supported for Instagram' }, { status: 400 });
  }
  try {
    const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
      `https://graph.facebook.com/v18.0/${account.platformUserId}`,
      {
        params: {
          fields: 'username,profile_picture_url',
          access_token: account.accessToken,
        },
      }
    );
    const username = igRes.data?.username ?? undefined;
    const profilePicture = igRes.data?.profile_picture_url ?? undefined;
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        ...(username && { username }),
        ...(profilePicture !== undefined && { profilePicture }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[Social accounts] Instagram refresh error:', e);
    return NextResponse.json({ message: 'Failed to refresh Instagram profile' }, { status: 500 });
  }
}
