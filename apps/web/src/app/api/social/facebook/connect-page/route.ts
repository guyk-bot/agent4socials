import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

type PageItem = { id: string; name?: string; picture?: string; instagram_business_account_id?: string };

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: { pendingId?: string; pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { pendingId, pageId } = body;
  if (!pendingId || !pageId) {
    return NextResponse.json({ message: 'Missing pendingId or pageId' }, { status: 400 });
  }
  const pending = await prisma.pendingFacebookConnection.findUnique({
    where: { id: pendingId },
  });
  if (!pending || pending.userId !== userId) {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  if (new Date() > pending.expiresAt) {
    await prisma.pendingFacebookConnection.delete({ where: { id: pendingId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const pages = (pending.pages as PageItem[]) ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    return NextResponse.json({ message: 'Invalid page' }, { status: 400 });
  }

  // Fetch me/accounts to get the PAGE access token. Insights, posts, and inbox require the Page token, not the user token.
  let pageAccessToken = pending.accessToken;
  let name = page.name ?? 'Facebook Page';
  let picture: string | null = page.picture ?? null;
  let instagramId: string | null = (page as PageItem & { instagram_business_account_id?: string }).instagram_business_account_id ?? null;
  let gotPageToken = false;
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
      params: { fields: 'id,name,picture,access_token,instagram_business_account', access_token: pending.accessToken },
    });
    const pagesFromApi = pagesRes.data?.data ?? [];
    const pageFromApi = pagesFromApi.find((p) => p.id === pageId);
    if (pageFromApi?.access_token) {
      pageAccessToken = pageFromApi.access_token;
      gotPageToken = true;
    }
    if (pageFromApi?.name) name = pageFromApi.name;
    if (pageFromApi?.picture?.data?.url) picture = pageFromApi.picture.data.url;
    if (pageFromApi?.instagram_business_account?.id) instagramId = pageFromApi.instagram_business_account.id;
  } catch (e) {
    console.warn('[Facebook connect-page] me/accounts error:', (e as Error)?.message ?? e);
  }

  if (!gotPageToken) {
    return NextResponse.json(
      {
        message:
          'Could not get Page access token. When connecting, allow "Manage your business and its assets" (business_management) so we can load analytics, posts, and inbox. Try reconnecting and grant all requested permissions.',
      },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + 3600 * 1000);
  await prisma.socialAccount.deleteMany({ where: { userId, platform: 'FACEBOOK' } });
  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: {
        userId,
        platform: 'FACEBOOK',
        platformUserId: page.id,
      },
    },
    update: {
      accessToken: pageAccessToken,
      username: name,
      profilePicture: picture,
      expiresAt,
      status: 'connected',
    },
    create: {
      userId,
      platform: 'FACEBOOK',
      platformUserId: page.id,
      username: name,
      profilePicture: picture,
      accessToken: pageAccessToken,
      refreshToken: null,
      expiresAt,
      status: 'connected',
    },
  });

  // Auto-connect linked Instagram if this Page has an Instagram Business account. Use the same Page token for IG API calls.
  if (instagramId) {
    let igUsername = 'Instagram';
    let igPicture: string | null = null;
    try {
      const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
        `https://graph.facebook.com/v18.0/${instagramId}`,
        { params: { fields: 'username,profile_picture_url', access_token: pageAccessToken } }
      );
      if (igRes.data?.username) igUsername = igRes.data.username;
      if (igRes.data?.profile_picture_url) igPicture = igRes.data.profile_picture_url;
    } catch (_) {}
    await prisma.socialAccount.deleteMany({ where: { userId, platform: 'INSTAGRAM' } });
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: 'INSTAGRAM',
          platformUserId: instagramId,
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
        platformUserId: instagramId,
        username: igUsername,
        profilePicture: igPicture,
        accessToken: pageAccessToken,
        refreshToken: null,
        expiresAt,
        status: 'connected',
      },
    });
  }
  await prisma.pendingFacebookConnection.delete({ where: { id: pendingId } }).catch(() => {});
  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
