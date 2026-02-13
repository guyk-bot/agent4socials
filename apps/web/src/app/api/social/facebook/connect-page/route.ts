import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

type PageItem = { id: string; name?: string; picture?: string };

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
  let name = page.name ?? 'Facebook Page';
  let picture: string | null = page.picture ?? null;
  if (!picture || !page.name) {
    try {
      const pagesRes = await axios.get<{ data?: Array<{ id: string; name?: string; picture?: { data?: { url?: string } }; access_token?: string }> }>(
        'https://graph.facebook.com/v18.0/me/accounts',
        { params: { fields: 'id,name,picture,access_token', access_token: pending.accessToken } }
      );
      const pages = pagesRes.data?.data || [];
      const pageFromApi = pages.find((p) => p.id === pageId);
      const tokenToUse = pageFromApi?.access_token || pending.accessToken;
      const res = await axios.get<{ name?: string; picture?: { data?: { url?: string } } }>(
        `https://graph.facebook.com/v18.0/${pageId}`,
        { params: { fields: 'name,picture', access_token: tokenToUse } }
      );
      if (res.data?.name) name = res.data.name;
      if (res.data?.picture?.data?.url) picture = res.data.picture.data.url;
    } catch (_) {}
  }
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: {
        userId,
        platform: 'FACEBOOK',
        platformUserId: page.id,
      },
    },
    update: {
      accessToken: pending.accessToken,
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
      accessToken: pending.accessToken,
      refreshToken: null,
      expiresAt,
      status: 'connected',
    },
  });
  await prisma.pendingFacebookConnection.delete({ where: { id: pendingId } }).catch(() => {});
  return NextResponse.json({ ok: true, redirect: '/accounts' });
}
