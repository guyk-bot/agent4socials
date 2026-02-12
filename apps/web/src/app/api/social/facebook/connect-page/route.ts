import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

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
      username: page.name ?? 'Facebook Page',
      profilePicture: page.picture ?? null,
      expiresAt,
      status: 'connected',
    },
    create: {
      userId,
      platform: 'FACEBOOK',
      platformUserId: page.id,
      username: page.name ?? 'Facebook Page',
      profilePicture: page.picture ?? null,
      accessToken: pending.accessToken,
      refreshToken: null,
      expiresAt,
      status: 'connected',
    },
  });
  await prisma.pendingFacebookConnection.delete({ where: { id: pendingId } }).catch(() => {});
  return NextResponse.json({ ok: true, redirect: '/accounts' });
}
