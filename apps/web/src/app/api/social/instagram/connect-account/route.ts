import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

type AccountItem = {
  id: string;
  username?: string;
  profilePicture?: string;
  pageId?: string;
  pageName?: string;
  pagePicture?: string;
};

/**
 * POST /api/social/instagram/connect-account
 * Called from /accounts/instagram/select after the user picks an IG Business account.
 * Must fetch the PAGE access token from me/accounts. Saving the user token would make
 * followers work but insights, posts, and inbox would stay empty.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: { pendingId?: string; accountId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { pendingId, accountId } = body;
  if (!pendingId || !accountId) {
    return NextResponse.json({ message: 'Missing pendingId or accountId' }, { status: 400 });
  }
  const pending = await prisma.pendingInstagramConnection.findUnique({
    where: { id: pendingId },
  });
  if (!pending || pending.userId !== userId) {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  if (new Date() > pending.expiresAt) {
    await prisma.pendingInstagramConnection.delete({ where: { id: pendingId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const accounts = (pending.accounts as AccountItem[]) ?? [];
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    return NextResponse.json({ message: 'Invalid account' }, { status: 400 });
  }

  // Get the PAGE access token from me/accounts. Insights, posts, and inbox require it.
  let pageAccessToken: string | null = null;
  let pageId = account.pageId ?? null;
  let pageName = account.pageName ?? 'Facebook Page';
  let pagePicture: string | null = account.pagePicture ?? null;
  let igUsername = account.username ?? 'Instagram';
  let igPicture: string | null = account.profilePicture ?? null;

  try {
    const pagesRes = await axios.get<{
      data?: Array<{
        id: string;
        name?: string;
        picture?: { data?: { url?: string } };
        access_token?: string;
        instagram_business_account?: { id: string };
      }>;
    }>('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        fields: 'id,name,picture,access_token,instagram_business_account',
        access_token: pending.accessToken,
      },
    });
    const pagesFromApi = pagesRes.data?.data ?? [];
    const linkedPage = pageId
      ? pagesFromApi.find((p) => p.id === pageId)
      : pagesFromApi.find((p) => p.instagram_business_account?.id === accountId);
    if (linkedPage?.access_token) {
      pageAccessToken = linkedPage.access_token;
      pageId = linkedPage.id;
      if (linkedPage.name) pageName = linkedPage.name;
      if (linkedPage.picture?.data?.url) pagePicture = linkedPage.picture.data.url;
    }
  } catch (e) {
    console.warn('[Instagram connect-account] me/accounts error:', (e as Error)?.message ?? e);
  }

  if (!pageAccessToken) {
    return NextResponse.json(
      {
        message:
          'Could not get Page access. When connecting, allow "Manage your business and its assets" (business_management) so we can load analytics, posts, and inbox. Try reconnecting and grant all requested permissions.',
      },
      { status: 400 }
    );
  }

  // Refresh IG profile with Page token
  try {
    const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
      `https://graph.facebook.com/v18.0/${accountId}`,
      { params: { fields: 'username,profile_picture_url', access_token: pageAccessToken } }
    );
    if (igRes.data?.username) igUsername = igRes.data.username;
    if (igRes.data?.profile_picture_url) igPicture = igRes.data.profile_picture_url;
  } catch (_) {}

  const expiresAt = new Date(Date.now() + 3600 * 1000);

  await prisma.socialAccount.deleteMany({ where: { userId, platform: 'INSTAGRAM' } });
  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: {
        userId,
        platform: 'INSTAGRAM',
        platformUserId: accountId,
      },
    },
    update: {
      accessToken: pageAccessToken,
      username: igUsername,
      profilePicture: igPicture,
      expiresAt,
      status: 'connected',
    },
    create: {
      userId,
      platform: 'INSTAGRAM',
      platformUserId: accountId,
      username: igUsername,
      profilePicture: igPicture,
      accessToken: pageAccessToken,
      refreshToken: null,
      expiresAt,
      status: 'connected',
    },
  });

  if (pageId) {
    await prisma.socialAccount.deleteMany({ where: { userId, platform: 'FACEBOOK' } });
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: 'FACEBOOK',
          platformUserId: pageId,
        },
      },
      update: {
        accessToken: pageAccessToken,
        username: pageName,
        profilePicture: pagePicture,
        expiresAt,
        status: 'connected',
      },
      create: {
        userId,
        platform: 'FACEBOOK',
        platformUserId: pageId,
        username: pageName,
        profilePicture: pagePicture,
        accessToken: pageAccessToken,
        refreshToken: null,
        expiresAt,
        status: 'connected',
      },
    });
  }

  await prisma.pendingInstagramConnection.delete({ where: { id: pendingId } }).catch(() => {});
  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
