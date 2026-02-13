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
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ message: 'Refresh supported for Instagram and Facebook only' }, { status: 400 });
  }
  const token = account.accessToken;
  let username: string | undefined;
  let profilePicture: string | undefined;
  let platformUserId: string | undefined;

  try {
    if (account.platform === 'FACEBOOK') {
      const isPlaceholderId = account.platformUserId.startsWith('fb-');
      const pagesRes = await axios.get<{ data?: Array<{ id: string; name?: string; picture?: { data?: { url?: string } }; access_token?: string }> }>(
        'https://graph.facebook.com/v18.0/me/accounts',
        { params: { fields: 'id,name,picture,access_token', access_token: token } }
      );
      const pages = pagesRes.data?.data || [];
      const page = isPlaceholderId ? pages[0] : (pages.find((p) => p.id === account.platformUserId) ?? pages[0]);
      if (page?.id) {
        platformUserId = page.id;
        username = page.name ?? undefined;
        profilePicture = page.picture?.data?.url ?? undefined;
        const tokenToUse = page.access_token || token;
        if (!profilePicture || !username) {
          try {
            const pageRes = await axios.get<{ name?: string; picture?: { data?: { url?: string } } }>(
              `https://graph.facebook.com/v18.0/${page.id}`,
              { params: { fields: 'name,picture', access_token: tokenToUse } }
            );
            if (pageRes.data?.name) username = pageRes.data.name;
            if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
          } catch (_) {}
        }
        if (!profilePicture && tokenToUse) {
          try {
            const pageRes = await axios.get<{ picture?: { data?: { url?: string } } }>(
              `https://graph.facebook.com/v18.0/${page.id}`,
              { params: { fields: 'picture.type(large)', access_token: tokenToUse } }
            );
            if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
          } catch (_) {}
        }
      }
    } else if (account.platform === 'INSTAGRAM') {
      const isOldFormat = account.platformUserId.startsWith('instagram-');
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
        // save real id and profile even when username is missing
        platformUserId = igId;
        username = igRes.data?.username ?? 'Instagram';
        profilePicture = igRes.data?.profile_picture_url ?? undefined;
        break;
      }
      } else {
        try {
          const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
            'https://graph.instagram.com/me',
            { params: { fields: 'username,profile_picture_url', access_token: token } }
          );
          username = igRes.data?.username ?? undefined;
          profilePicture = igRes.data?.profile_picture_url ?? undefined;
        } catch (_) {
          const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
            `https://graph.facebook.com/v18.0/${account.platformUserId}`,
            { params: { fields: 'username,profile_picture_url', access_token: token } }
          );
          username = igRes.data?.username ?? undefined;
          profilePicture = igRes.data?.profile_picture_url ?? undefined;
        }
      }
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
    console.error('[Social accounts] Refresh error:', e);
    return NextResponse.json({ message: 'Failed to refresh profile' }, { status: 500 });
  }
}
