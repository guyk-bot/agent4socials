import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

type AccountItem = { id: string; username?: string; profilePicture?: string; pageId?: string; pageName?: string; pagePicture?: string };

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
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: {
        userId,
        platform: 'INSTAGRAM',
        platformUserId: account.id,
      },
    },
    update: {
      accessToken: pending.accessToken,
      username: account.username ?? 'Instagram',
      profilePicture: account.profilePicture ?? null,
      expiresAt,
      status: 'connected',
    },
    create: {
      userId,
      platform: 'INSTAGRAM',
      platformUserId: account.id,
      username: account.username ?? 'Instagram',
      profilePicture: account.profilePicture ?? null,
      accessToken: pending.accessToken,
      refreshToken: null,
      expiresAt,
      status: 'connected',
    },
  });
  // Auto-connect linked Facebook Page when this IG was connected via Facebook and we have page info
  if (account.pageId) {
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: 'FACEBOOK',
          platformUserId: account.pageId,
        },
      },
      update: {
        accessToken: pending.accessToken,
        username: account.pageName ?? 'Facebook Page',
        profilePicture: account.pagePicture ?? null,
        expiresAt,
        status: 'connected',
      },
      create: {
        userId,
        platform: 'FACEBOOK',
        platformUserId: account.pageId,
        username: account.pageName ?? 'Facebook Page',
        profilePicture: account.pagePicture ?? null,
        accessToken: pending.accessToken,
        refreshToken: null,
        expiresAt,
        status: 'connected',
      },
    });
  }
  await prisma.pendingInstagramConnection.delete({ where: { id: pendingId } }).catch(() => {});
  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
