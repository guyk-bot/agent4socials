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
  const token = account.accessToken;
  const isOldFormat = account.platformUserId.startsWith('instagram-');
  let username: string | undefined;
  let profilePicture: string | undefined;
  let platformUserId: string | undefined;

  try {
    if (isOldFormat) {
      const pagesRes = await axios.get<{ data?: Array<{ id: string; instagram_business_account?: { id: string } }> }>(
        'https://graph.facebook.com/v18.0/me/accounts',
        { params: { fields: 'id,instagram_business_account', access_token: token } }
      );
      const pages = pagesRes.data?.data || [];
      for (const page of pages) {
        const igId = page.instagram_business_account?.id;
        if (!igId) continue;
        const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
          `https://graph.facebook.com/v18.0/${igId}`,
          { params: { fields: 'username,profile_picture_url', access_token: token } }
        );
        if (igRes.data?.username) {
          username = igRes.data.username;
          profilePicture = igRes.data.profile_picture_url ?? undefined;
          platformUserId = igId;
          break;
        }
      }
    } else {
      const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
        `https://graph.facebook.com/v18.0/${account.platformUserId}`,
        { params: { fields: 'username,profile_picture_url', access_token: token } }
      );
      username = igRes.data?.username ?? undefined;
      profilePicture = igRes.data?.profile_picture_url ?? undefined;
    }
    const data: { username?: string; profilePicture?: string; platformUserId?: string } = {};
    if (username) data.username = username;
    if (profilePicture !== undefined) data.profilePicture = profilePicture;
    if (platformUserId) data.platformUserId = platformUserId;
    if (Object.keys(data).length > 0) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[Social accounts] Instagram refresh error:', e);
    return NextResponse.json({ message: 'Failed to refresh Instagram profile' }, { status: 500 });
  }
}
