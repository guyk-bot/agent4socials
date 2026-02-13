import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';

/** GET: list imported posts for this account. ?sync=1 to sync from platform first then return. */
export async function GET(
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const sync = request.nextUrl.searchParams.get('sync') === '1';
  if (sync) {
    try {
      await syncImportedPosts(account.id, account.platform, account.platformUserId, account.accessToken);
    } catch (e) {
      console.error('[Imported posts] sync error:', e);
      return NextResponse.json({ message: 'Sync failed', posts: [] }, { status: 200 });
    }
  }
  const posts = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ posts });
}

async function syncImportedPosts(
  socialAccountId: string,
  platform: Platform,
  platformUserId: string,
  accessToken: string
) {
  const baseUrl = 'https://graph.facebook.com/v18.0';
  if (platform === 'INSTAGRAM') {
    const res = await axios.get<{ data?: Array<{ id: string; media_type?: string; media_url?: string; permalink?: string; caption?: string; timestamp?: string }> }>(
      `${baseUrl}/${platformUserId}/media`,
      { params: { fields: 'id,media_type,media_url,permalink,caption,timestamp', access_token: accessToken } }
    );
    const items = res.data?.data ?? [];
    for (const m of items) {
      const publishedAt = m.timestamp ? new Date(m.timestamp) : new Date();
      await prisma.importedPost.upsert({
        where: {
          socialAccountId_platformPostId: { socialAccountId, platformPostId: m.id },
        },
        update: {
          content: m.caption ?? null,
          thumbnailUrl: m.media_url ?? null,
          permalinkUrl: m.permalink ?? null,
          publishedAt,
          mediaType: m.media_type ?? null,
          syncedAt: new Date(),
        },
        create: {
          socialAccountId,
          platformPostId: m.id,
          platform,
          content: m.caption ?? null,
          thumbnailUrl: m.media_url ?? null,
          permalinkUrl: m.permalink ?? null,
          publishedAt,
          mediaType: m.media_type ?? null,
        },
      });
    }
    return;
  }
  if (platform === 'FACEBOOK') {
    const res = await axios.get<{ data?: Array<{ id: string; message?: string; created_time?: string; full_picture?: string; permalink_url?: string }> }>(
      `${baseUrl}/${platformUserId}/published_posts`,
      { params: { fields: 'id,message,created_time,full_picture,permalink_url', access_token: accessToken } }
    );
    const items = res.data?.data ?? [];
    for (const p of items) {
      const publishedAt = p.created_time ? new Date(p.created_time) : new Date();
      await prisma.importedPost.upsert({
        where: {
          socialAccountId_platformPostId: { socialAccountId, platformPostId: p.id },
        },
        update: {
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: null,
          syncedAt: new Date(),
        },
        create: {
          socialAccountId,
          platformPostId: p.id,
          platform,
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: null,
        },
      });
    }
    return;
  }
  // Other platforms: no sync for now
}
