import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios, { type AxiosResponse } from 'axios';

/** GET: list imported posts for this account. ?sync=1 to sync from platform first then return. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  try {
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
    if (!account.accessToken) {
      return NextResponse.json({ posts: [], syncError: 'Reconnect your account to sync posts.' }, { status: 200 });
    }
    const sync = request.nextUrl.searchParams.get('sync') === '1';
    let syncError: string | undefined;
    if (sync) {
      try {
        syncError = await syncImportedPosts(account.id, account.platform, account.platformUserId, account.accessToken);
      } catch (e) {
        console.error('[Imported posts] sync error:', e);
        const msg = (e as Error)?.message ?? '';
        const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        syncError = metaMsg || msg || 'Sync failed. Try reconnecting your account.';
      }
    }
    const posts = await prisma.importedPost.findMany({
      where: { socialAccountId: account.id },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });
    const serialized = posts.map((p) => ({
      id: p.id,
      content: p.content,
      thumbnailUrl: p.thumbnailUrl,
      permalinkUrl: p.permalinkUrl,
      impressions: p.impressions ?? 0,
      interactions: p.interactions ?? 0,
      publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : String(p.publishedAt),
      mediaType: p.mediaType,
      platform: p.platform,
    }));
    return NextResponse.json({ posts: serialized, syncError });
  } catch (e) {
    console.error('[Imported posts] GET error:', e);
    const msg = (e as Error)?.message ?? 'Server error while loading posts.';
    return NextResponse.json({ posts: [], syncError: msg }, { status: 200 });
  }
}

async function syncImportedPosts(
  socialAccountId: string,
  platform: Platform,
  platformUserId: string,
  accessToken: string
): Promise<string | undefined> {
  const baseUrl = 'https://graph.facebook.com/v18.0';
  if (platform === 'INSTAGRAM') {
    type MediaPage = {
      data?: Array<{ id: string; media_type?: string; media_url?: string; permalink?: string; caption?: string; timestamp?: string; thumbnail_url?: string }>;
      paging?: { next?: string; cursors?: { before?: string; after?: string } };
    };
    const fields = 'id,media_type,media_url,permalink,caption,timestamp,thumbnail_url';
    const allItems: Array<{ id: string; media_type?: string; media_url?: string; permalink?: string; caption?: string; timestamp?: string; thumbnail_url?: string }> = [];
    const maxMedia = 200;
    const firstPageLimit = 100;
    let nextUrl: string | null = `${baseUrl}/${platformUserId}/media`;
    try {
      while (nextUrl && allItems.length < maxMedia) {
        const isFirst = !nextUrl.includes('?');
        const res: AxiosResponse<MediaPage> = await axios.get<MediaPage>(
          nextUrl,
          isFirst ? { params: { fields, access_token: accessToken, limit: firstPageLimit } } : {}
        );
        const page = res.data?.data ?? [];
        allItems.push(...page);
        const paging = res.data?.paging;
        const nextFromMeta = paging?.next;
        const afterCursor = paging?.cursors?.after;
        const gotFullPage = page.length >= (isFirst ? firstPageLimit : 50);
        if (nextFromMeta && allItems.length < maxMedia) {
          nextUrl = nextFromMeta;
        } else if (!nextFromMeta && afterCursor && gotFullPage && allItems.length < maxMedia) {
          nextUrl = `${baseUrl}/${platformUserId}/media?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}&limit=50&after=${encodeURIComponent(afterCursor)}`;
        } else {
          nextUrl = null;
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Instagram account to sync posts.';
      }
      if (metaMsg) return metaMsg;
      throw e;
    }
    const items = allItems;
    for (const m of items) {
      const publishedAt = m.timestamp ? new Date(m.timestamp) : new Date();
      let thumbnailUrl: string | null = m.media_url ?? m.thumbnail_url ?? null;
      if (!thumbnailUrl && m.media_type === 'CAROUSEL_ALBUM') {
        try {
          const childRes = await axios.get<{ data?: Array<{ media_url?: string }> }>(
            `${baseUrl}/${m.id}/children`,
            { params: { fields: 'media_url', access_token: accessToken } }
          );
          const first = childRes.data?.data?.[0];
          if (first?.media_url) thumbnailUrl = first.media_url;
        } catch {
          // ignore
        }
      }
      let impressions = 0;
      let interactions = 0;
      try {
        const insightsRes = await axios.get<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
          `${baseUrl}/${m.id}/insights`,
          { params: { metric: 'impressions,reach,engagement', access_token: accessToken } }
        );
        const data = insightsRes.data?.data ?? [];
        for (const d of data) {
          const val = d.values?.[0]?.value ?? 0;
          if (d.name === 'impressions' || d.name === 'reach' || d.name === 'views') impressions = val;
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
          thumbnailUrl,
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
          thumbnailUrl,
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
      const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Facebook Page to sync posts.';
      }
      if (metaMsg) return metaMsg;
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
          impressions: 0,
          interactions: 0,
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
          impressions: 0,
          interactions: 0,
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
            impressions: 0,
            interactions: 0,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: t.id,
            platform: 'TWITTER',
            content: t.text ?? null,
            permalinkUrl,
            publishedAt,
            impressions: 0,
            interactions: 0,
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
