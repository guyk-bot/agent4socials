import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { scheduleInboxWarmForUser } from '@/lib/inbox/schedule-inbox-warm';
import { buildPostConnectDashboardPath } from '@/lib/post-connect-dashboard-url';

type AccountItem = {
  id: string;
  username?: string;
  profilePicture?: string;
  pageId?: string;
  pageName?: string;
  pagePicture?: string;
  pageAccessToken?: string;
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
  let body: { pendingId?: string; accountId?: string; pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { pendingId, accountId, pageId } = body;
  if (!pendingId || (!accountId && !pageId)) {
    return NextResponse.json({ message: 'Missing pendingId or accountId/pageId' }, { status: 400 });
  }
  const pending = await prisma.pendingConnection.findUnique({
    where: { id: pendingId },
  });
  if (!pending || pending.userId !== userId || pending.platform !== 'INSTAGRAM') {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  const payload = pending.payload as {
    accounts?: AccountItem[];
    pages?: Array<{ id: string; name?: string; picture?: string; instagram_business_account_id?: string }>;
    accessToken?: string;
  };
  if (pending.expiresAt && new Date() > pending.expiresAt) {
    await prisma.pendingConnection.delete({ where: { id: pendingId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const accounts = (payload?.accounts ?? []) as AccountItem[];
  const pages = (payload?.pages ?? []) as Array<{
    id: string;
    name?: string;
    picture?: string;
    instagram_business_account_id?: string;
    access_token?: string;
  }>;
  const account = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const pageFromPayload = pageId ? pages.find((p) => p.id === pageId) : undefined;
  if (!account && !pageFromPayload) {
    return NextResponse.json({ message: 'Invalid account or page' }, { status: 400 });
  }

  const connectInstagramId = account?.id ?? pageFromPayload?.instagram_business_account_id ?? null;
  const connectPageId = account?.pageId ?? pageFromPayload?.id ?? pageId ?? null;

  // Prefer Page token from OAuth pending payload (already fetched at login).
  let pageAccessToken: string | null = account?.pageAccessToken ?? null;
  let resolvedPageId = connectPageId;
  let pageName = account?.pageName ?? pageFromPayload?.name ?? 'Facebook Page';
  let pagePicture: string | null = account?.pagePicture ?? pageFromPayload?.picture ?? null;
  let igUsername = account?.username ?? 'Instagram';
  let igPicture: string | null = account?.profilePicture ?? null;

  if (!pageAccessToken && resolvedPageId) {
    pageAccessToken = pages.find((p) => p.id === resolvedPageId)?.access_token ?? null;
  }

  if (!pageAccessToken && payload.accessToken) {
    try {
      const pagesRes = await axios.get<{
        data?: Array<{
          id: string;
          name?: string;
          picture?: { data?: { url?: string } };
          access_token?: string;
          instagram_business_account?: { id: string };
        }>;
      }>(`${facebookGraphBaseUrl}/me/accounts`, {
        params: {
          fields: 'id,name,picture,access_token,instagram_business_account',
          access_token: payload.accessToken,
        },
      });
      const pagesFromApi = pagesRes.data?.data ?? [];
      const linkedPage = resolvedPageId
        ? pagesFromApi.find((p) => p.id === resolvedPageId)
        : connectInstagramId
          ? pagesFromApi.find((p) => p.instagram_business_account?.id === connectInstagramId)
          : undefined;
      if (linkedPage?.access_token) {
        pageAccessToken = linkedPage.access_token;
        resolvedPageId = linkedPage.id;
        if (linkedPage.name) pageName = linkedPage.name;
        if (linkedPage.picture?.data?.url) pagePicture = linkedPage.picture.data.url;
      }
    } catch (e) {
      console.warn('[Instagram connect-account] me/accounts error:', (e as Error)?.message ?? e);
    }
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

  const igIdToConnect = connectInstagramId ?? null;
  const needsIgProfileRefresh = !account?.username || !account?.profilePicture;
  if (igIdToConnect && needsIgProfileRefresh) {
    try {
      const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
        `${facebookGraphBaseUrl}/${igIdToConnect}`,
        { params: { fields: 'username,profile_picture_url', access_token: pageAccessToken } }
      );
      if (igRes.data?.username) igUsername = igRes.data.username;
      if (igRes.data?.profile_picture_url) igPicture = igRes.data.profile_picture_url;
    } catch (_) {}
  }

  const expiresAt = new Date(Date.now() + 3600 * 1000);

  const igCredentials = {
    loginMethod: 'facebook_login' as const,
    linkedPageId: resolvedPageId ?? null,
  };

  await Promise.all([
    igIdToConnect
      ? prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: {
              userId,
              platform: 'INSTAGRAM',
              platformUserId: igIdToConnect,
            },
          },
          update: {
            accessToken: pageAccessToken,
            username: igUsername,
            profilePicture: igPicture,
            expiresAt,
            status: 'connected',
            credentialsJson: igCredentials,
          },
          create: {
            userId,
            platform: 'INSTAGRAM',
            platformUserId: igIdToConnect,
            username: igUsername,
            profilePicture: igPicture,
            accessToken: pageAccessToken,
            refreshToken: null,
            expiresAt,
            status: 'connected',
            credentialsJson: igCredentials,
          },
        })
      : Promise.resolve(),
    resolvedPageId
      ? prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: {
              userId,
              platform: 'FACEBOOK',
              platformUserId: resolvedPageId,
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
            platformUserId: resolvedPageId,
            username: pageName,
            profilePicture: pagePicture,
            accessToken: pageAccessToken,
            refreshToken: null,
            expiresAt,
            status: 'connected',
          },
        })
      : Promise.resolve(),
  ]);

  await prisma.pendingConnection.delete({ where: { id: pendingId } }).catch(() => {});

  const igAccount = igIdToConnect
    ? await prisma.socialAccount.findFirst({
        where: { userId, platform: 'INSTAGRAM', platformUserId: igIdToConnect },
        select: { id: true, username: true, profilePicture: true },
      })
    : null;
  const fbAccount = resolvedPageId
    ? await prisma.socialAccount.findFirst({
        where: { userId, platform: 'FACEBOOK', platformUserId: resolvedPageId },
        select: { id: true, username: true, profilePicture: true },
      })
    : null;

  scheduleInboxWarmForUser(userId);

  const redirect = igAccount?.id
    ? buildPostConnectDashboardPath(igAccount.id, 'INSTAGRAM', igUsername, igPicture)
    : fbAccount?.id
      ? buildPostConnectDashboardPath(fbAccount.id, 'FACEBOOK', pageName, pagePicture)
      : '/dashboard';

  return NextResponse.json({ ok: true, redirect });
}
