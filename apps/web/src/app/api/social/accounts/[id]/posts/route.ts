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
    select: { id: true, platform: true, platformUserId: true, accessToken: true, username: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const sync = request.nextUrl.searchParams.get('sync') === '1';
  let syncError: string | undefined;
  if (sync) {
    try {
      syncError = await syncImportedPosts(account.id, account.platform, account.platformUserId, account.accessToken);
    } catch (e) {
      console.error('[Imported posts] sync error:', e);
      syncError = (e as Error)?.message ?? 'Sync failed. Try reconnecting your account.';
    }
  }
  const posts = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ posts, syncError });
}

async function syncImportedPosts(
  socialAccountId: string,
  platform: Platform,
  platformUserId: string,
  accessToken: string
): Promise<string | undefined> {
  const baseUrl = 'https://graph.facebook.com/v18.0';
  if (platform === 'INSTAGRAM') {
    let res: { data?: { data?: Array<{ id: string; media_type?: string; media_url?: string; permalink?: string; caption?: string; timestamp?: string }> } };
    try {
      res = await axios.get(
        `${baseUrl}/${platformUserId}/media`,
        { params: { fields: 'id,media_type,media_url,permalink,caption,timestamp', access_token: accessToken } }
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access')) return 'Reconnect your Instagram account to sync posts.';
      throw e;
    }
    const items = res.data?.data ?? [];
    for (const m of items) {
      const publishedAt = m.timestamp ? new Date(m.timestamp) : new Date();
      let impressions = 0;
      let interactions = 0;
      try {
        const insightsRes = await axios.get<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
          `${baseUrl}/${m.id}/insights`,
          { params: { metric: 'views,engagement', access_token: accessToken } }
        );
        const data = insightsRes.data?.data ?? [];
        for (const d of data) {
          const val = d.values?.[0]?.value ?? 0;
          if (d.name === 'views' || d.name === 'impressions') impressions = val;
          if (d.name === 'engagement') interactions = val;
        }
      } catch {
        // insights may not be available for all media
      }
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
          impressions,
          interactions,
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
          impressions,
          interactions,
        },
      });
    }
    return undefined;
  }
  if (platform === 'FACEBOOK') {
    let res: { data?: { data?: Array<{ id: string; message?: string; created_time?: string; full_picture?: string; permalink_url?: string }> } };
    try {
      res = await axios.get(
        `${baseUrl}/${platformUserId}/published_posts`,
        { params: { fields: 'id,message,created_time,full_picture,permalink_url', access_token: accessToken } }
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access')) return 'Reconnect your Facebook Page to sync posts.';
      throw e;
    }
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
  if (platform === 'TWITTER') {
    try {
      const tweetsRes = await axios.get<{
        data?: Array<{ id: string; text?: string; created_at?: string }>;
      }>(`https://api.twitter.com/2/users/${platformUserId}/tweets`, {
        params: {
          max_results: 50,
          'tweet.fields': 'created_at',
          exclude: 'retweets,replies',
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const items = tweetsRes.data?.data ?? [];
      for (const t of items) {
        const publishedAt = t.created_at ? new Date(t.created_at) : new Date();
        const permalinkUrl = `https://x.com/i/status/${t.id}`;
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: { socialAccountId, platformPostId: t.id },
          },
          update: {
            content: t.text ?? null,
            permalinkUrl,
            publishedAt,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: t.id,
            platform: 'TWITTER',
            content: t.text ?? null,
            permalinkUrl,
            publishedAt,
          },
        });
      }
      return undefined;
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('OAuth') || msg.includes('401') || msg.includes('403')) return 'Reconnect your X (Twitter) account to sync posts.';
      throw e;
    }
  }
  // Other platforms: no sync for now
  return undefined;
}
