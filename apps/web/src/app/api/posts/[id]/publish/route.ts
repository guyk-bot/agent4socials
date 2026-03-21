import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { publishTarget } from '@/lib/publish-target';
import { createMediaServeToken } from '@/lib/media-serve-token';
import { ensureInstagramJpegOnR2 } from '@/lib/instagram-media-r2';
import { refreshTwitterToken } from '@/lib/twitter-refresh';
import { getValidPinterestToken } from '@/lib/pinterest-token';

// Allow up to 5 minutes for video publishing (TikTok uploads + polling).
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const { id: postId } = await params;
  const cronSecret = request.headers.get('X-Cron-Secret');
  const isCron = process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  let userId: string | null = null;
  let linkToken: string | null = null;
  if (!isCron) {
    userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      try {
        const body = (await request.json().catch(() => ({}))) as { token?: string; contentByPlatform?: Record<string, string> };
        linkToken = typeof body?.token === 'string' ? body.token.trim() : null;
        if (linkToken && body?.contentByPlatform && typeof body.contentByPlatform === 'object' && Object.keys(body.contentByPlatform).length > 0) {
          await prisma.post.updateMany({
            where: { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } },
            data: { contentByPlatform: body.contentByPlatform },
          });
        }
      } catch {
        linkToken = null;
      }
      if (!linkToken) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    }
  }
  let post = await prisma.post.findFirst({
    where: isCron
      ? { id: postId, status: PostStatus.SCHEDULED, scheduledAt: { lte: new Date() }, scheduleDelivery: 'auto' }
      : linkToken
        ? { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } }
        : { id: postId, userId: userId! },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: {
            select: {
              id: true,
              platform: true,
              platformUserId: true,
              accessToken: true,
              refreshToken: true,
              expiresAt: true,
              credentialsJson: true,
            },
          },
        },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }
  if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED && post.status !== PostStatus.POSTING) {
    return NextResponse.json({ message: 'Post already published' }, { status: 400 });
  }
  // Allow retry when POSTING (e.g. previous publish failed mid-way)

  await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.POSTING },
  });

  const contentByPlatform = (post as { contentByPlatform?: Record<string, string> | null }).contentByPlatform ?? null;
  const mediaByPlatform = (post as { mediaByPlatform?: Record<string, { fileUrl: string; type: string }[]> | null }).mediaByPlatform ?? null;
  const defaultMedia = post.media.map((m) => {
    const meta = (m as { metadata?: { thumbnailUrl?: string; useVideoDefaultForPublish?: boolean } }).metadata;
    const useVideoDefault = meta?.useVideoDefaultForPublish;
    return {
      fileUrl: m.fileUrl,
      type: m.type,
      thumbnailUrl: useVideoDefault ? undefined : meta?.thumbnailUrl,
    };
  });

  /** When URL is already on our R2 (S3_PUBLIC_URL), return as-is. Meta fetches directly from r2.dev, bypassing our domain (avoids Vercel bot protection / robots 403). */
  function directR2IfOurs(url: string): string | null {
    if (!url?.startsWith('http')) return null;
    const base = process.env.S3_PUBLIC_URL?.trim();
    if (!base) return null;
    try {
      const baseOrigin = new URL(base.replace(/\/$/, '')).origin;
      const urlOrigin = new URL(url).origin;
      if (urlOrigin === baseOrigin) return url;
    } catch (_) {}
    return null;
  }

  /** Meta (Instagram/Facebook) must fetch the image URL from their servers. Prefer short token URL (serve), else proxy, else raw.
   * For Instagram: append format=jpeg (Meta requires JPEG only; we convert PNG/WebP on-the-fly). */
  function publicMediaUrlForMeta(fileUrl: string, opts?: { instagramImage?: boolean }): string {
    if (!fileUrl || !fileUrl.startsWith('http')) return fileUrl;
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');
    if (!appBase) return fileUrl;
    try {
      const parsed = new URL(fileUrl);
      const appHost = new URL(appBase).hostname;
      if (parsed.hostname === appHost) return fileUrl; // already our domain
    } catch (_) {}
    const jpegParam = opts?.instagramImage ? '&format=jpeg' : '';
    const serveToken = createMediaServeToken(fileUrl);
    if (serveToken) {
      return `${appBase}/api/media/serve?t=${serveToken}${jpegParam}`;
    }
    if (process.env.S3_PUBLIC_URL?.trim()) {
      return `${appBase}/api/media/proxy?url=${encodeURIComponent(fileUrl)}${jpegParam}`;
    }
    return fileUrl;
  }

  const results: { platform: string; ok: boolean; error?: string; mediaSkipped?: boolean }[] = [];
  const isDebug = request.nextUrl.searchParams.get('debug') === '1';
  const debugInfo: { mediaUrlsByPlatform?: Record<string, string>; fullErrors?: Record<string, string> } = isDebug ? { mediaUrlsByPlatform: {}, fullErrors: {} } : undefined!;

  for (const target of post.targets) {
    const { platform, socialAccount } = target;
    let token = socialAccount.accessToken;
    if (platform === 'PINTEREST') {
      token = await getValidPinterestToken({
        id: socialAccount.id,
        accessToken: socialAccount.accessToken,
        refreshToken: socialAccount.refreshToken,
        expiresAt: socialAccount.expiresAt,
      });
    }
    const platformUserId = socialAccount.platformUserId;
    const caption = (contentByPlatform?.[platform] ?? post.content ?? '').trim();
    const platformMedia = mediaByPlatform?.[platform];
    const targetMedia = (platformMedia && platformMedia.length > 0 ? platformMedia : defaultMedia) as { fileUrl: string; type: string; thumbnailUrl?: string }[];
    const allImages = targetMedia.filter((m) => m.type === 'IMAGE');
    let firstImageUrl = allImages[0]?.fileUrl;
    let firstMediaUrl = targetMedia[0]?.fileUrl;
    let videoThumbnailUrl = targetMedia[0] && targetMedia[0].type === 'VIDEO' ? (targetMedia[0] as { thumbnailUrl?: string }).thumbnailUrl : undefined;
    let imageUrls: string[] | undefined;
    // For TikTok PULL_FROM_URL: pass video via our own domain so TikTok can fetch it.
    // (Requires agent4socials.com to be verified in TikTok Developer Portal.)
    if (platform === 'TIKTOK' && firstMediaUrl) {
      firstMediaUrl = publicMediaUrlForMeta(firstMediaUrl);
    }
    if (platform === 'PINTEREST' && firstImageUrl) {
      firstImageUrl = publicMediaUrlForMeta(firstImageUrl);
    }
    if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
      const isInstagram = platform === 'INSTAGRAM';
      const firstIsImage = targetMedia[0]?.type === 'IMAGE';
      async function urlForInstagram(raw: string, forImage: boolean): Promise<string> {
        if (!forImage) {
          const directR2 = directR2IfOurs(raw);
          if (directR2) return directR2;
          return publicMediaUrlForMeta(raw, { instagramImage: false });
        }
        const direct = await ensureInstagramJpegOnR2(raw, fetch);
        return direct ?? publicMediaUrlForMeta(raw, { instagramImage: true });
      }
      if (firstImageUrl) firstImageUrl = await urlForInstagram(firstImageUrl, isInstagram);
      if (firstMediaUrl) firstMediaUrl = await urlForInstagram(firstMediaUrl, isInstagram && firstIsImage);
      if (videoThumbnailUrl) {
        const thumbR2 = directR2IfOurs(videoThumbnailUrl);
        if (thumbR2) videoThumbnailUrl = thumbR2;
        else videoThumbnailUrl = await urlForInstagram(videoThumbnailUrl, isInstagram);
      }
      if (isInstagram && allImages.length >= 2 && allImages.length <= 10) {
        imageUrls = await Promise.all(allImages.map((m) => urlForInstagram(m.fileUrl, true)));
      }
      if (isDebug && debugInfo.mediaUrlsByPlatform) {
        const url = firstImageUrl || firstMediaUrl || videoThumbnailUrl;
        if (url) debugInfo.mediaUrlsByPlatform[platform] = url;
      }
      // Pre-flight: verify Meta can fetch the media URL (2207076 = Meta couldn't fetch)
      const urlToCheck = firstImageUrl || firstMediaUrl || (imageUrls && imageUrls[0]);
      if (urlToCheck && urlToCheck.startsWith('http')) {
        try {
          const headRes = await fetch(urlToCheck, { method: 'GET', headers: { 'User-Agent': 'InstagramBot/1.0' }, signal: AbortSignal.timeout(15_000) });
          if (!headRes.ok) {
            const hint = !process.env.MEDIA_SERVE_SECRET && !process.env.CRON_SECRET
              ? ' Set MEDIA_SERVE_SECRET or CRON_SECRET in Vercel.'
              : !process.env.S3_PUBLIC_URL
                ? ' Set S3_PUBLIC_URL in Vercel.'
                : '';
            await prisma.postTarget.update({
              where: { id: target.id },
              data: { status: PostStatus.FAILED, error: `Media URL ${headRes.status}${hint}`.slice(0, 500) },
            });
            results.push({
              platform,
              ok: false,
              error: `Media URL returned ${headRes.status} (Meta would get same).${hint} Check docs/INSTAGRAM_2207076_ANALYSIS.md`,
            });
            continue;
          }
        } catch (preflightErr) {
          const msg = (preflightErr as Error)?.message ?? String(preflightErr);
          await prisma.postTarget.update({
            where: { id: target.id },
            data: { status: PostStatus.FAILED, error: `Media unreachable: ${msg}`.slice(0, 500) },
          });
          results.push({
            platform,
            ok: false,
            error: `Media URL unreachable: ${msg}. Set S3_PUBLIC_URL, CRON_SECRET in Vercel. See docs/INSTAGRAM_2207076_ANALYSIS.md`,
          });
          continue;
        }
      }
    }

    const creds = socialAccount.credentialsJson as {
      twitterOAuth1AccessToken?: string;
      twitterOAuth1AccessTokenSecret?: string;
      pinterestDefaultBoardId?: string | null;
    } | null;
    const twitterOAuth1 =
      platform === 'TWITTER' && creds?.twitterOAuth1AccessToken && creds?.twitterOAuth1AccessTokenSecret
        ? { accessToken: creds.twitterOAuth1AccessToken, accessTokenSecret: creds.twitterOAuth1AccessTokenSecret }
        : undefined;
    const pinterestBoardId =
      platform === 'PINTEREST' && typeof creds?.pinterestDefaultBoardId === 'string'
        ? creds.pinterestDefaultBoardId
        : null;

    if (platform === 'PINTEREST' && !firstImageUrl) {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: PostStatus.FAILED,
          error: 'Pinterest needs at least one image in the post.',
        },
      });
      results.push({ platform, ok: false, error: 'Pinterest needs at least one image.' });
      continue;
    }

    let result = await publishTarget(
      {
        platform,
        token,
        platformUserId,
        caption,
        firstImageUrl,
        firstMediaUrl,
        imageUrls,
        videoThumbnailUrl,
        twitterOAuth1,
        pinterestBoardId,
      },
      { fetch, axios }
    );

    // On 401 Unauthorized for Twitter, try refreshing the token and retry once
    const isTwitterUnauthorized =
      platform === 'TWITTER' &&
      !result.ok &&
      (result.error?.includes('401') || (result.error?.toLowerCase?.() ?? '').includes('unauthorized'));
    if (isTwitterUnauthorized && socialAccount.refreshToken && process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
      try {
        const { accessToken: newAccess, refreshToken: newRefresh } = await refreshTwitterToken(socialAccount.refreshToken);
        await prisma.socialAccount.update({
          where: { id: socialAccount.id },
          data: { accessToken: newAccess, ...(newRefresh ? { refreshToken: newRefresh } : {}) },
        });
        token = newAccess;
        result = await publishTarget(
          {
            platform,
            token,
            platformUserId,
            caption,
            firstImageUrl,
            firstMediaUrl,
            imageUrls,
            videoThumbnailUrl,
            twitterOAuth1,
            pinterestBoardId,
          },
          { fetch, axios }
        );
      } catch (refreshErr) {
        result = {
          ok: false,
          error: `Token refresh failed: ${(refreshErr as Error).message}. Reconnect the Twitter account in Accounts.`,
        };
      }
    }

    // On transient network errors (e.g. socket hang up on serverless), retry up to 2 more times with delay for Twitter
    const isTwitterNetworkError = (r: typeof result) =>
      platform === 'TWITTER' &&
      !r.ok &&
      (r.error?.includes('socket hang up') ||
        r.error?.includes('ECONNRESET') ||
        r.error?.includes('ETIMEDOUT') ||
        r.error?.includes('ECONNABORTED') ||
        (r.error?.toLowerCase?.() ?? '').includes('network'));
    if (isTwitterNetworkError(result)) {
      for (let attempt = 0; attempt < 2 && isTwitterNetworkError(result); attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        result = await publishTarget(
          {
            platform,
            token,
            platformUserId,
            caption,
            firstImageUrl,
            firstMediaUrl,
            imageUrls,
            videoThumbnailUrl,
            twitterOAuth1,
            pinterestBoardId,
          },
          { fetch, axios }
        );
      }
    }

    if (result.ok) {
      const inboxNote = result.sentToInbox
        ? 'Posted as Private on TikTok (unaudited app). Open TikTok app, tap the video on your Profile and change visibility to Public.'
        : undefined;
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: PostStatus.POSTED,
          ...(result.platformPostId ? { platformPostId: result.platformPostId } : {}),
          ...(inboxNote ? { error: inboxNote } : {}),
        },
      });
      results.push({ platform, ok: true, ...(result.mediaSkipped ? { mediaSkipped: true } : {}), ...(result.sentToInbox ? { sentToInbox: true } : {}) });
    } else {
      if (platform === 'INSTAGRAM') {
        console.error('[Instagram publish failed]', { postId, error: result.error, mediaUrl: firstImageUrl || firstMediaUrl });
      }
      if (platform === 'TIKTOK') {
        console.error('[TikTok publish failed]', { postId, error: result.error });
      }
      await prisma.postTarget.update({
        where: { id: target.id },
        data: { status: PostStatus.FAILED, error: result.error?.slice(0, 500) },
      });
      if (isDebug && debugInfo.fullErrors && result.error) {
        debugInfo.fullErrors[platform] = result.error;
      }
      results.push({ platform, ok: false, error: result.error?.slice(0, 200) });
    }
  }

  const anyFailed = results.some((r) => !r.ok);
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: anyFailed ? PostStatus.FAILED : PostStatus.POSTED,
      ...(anyFailed ? {} : { postedAt: new Date() }),
    },
  });

  return NextResponse.json({ ok: !anyFailed, results, ...(isDebug && debugInfo ? { debugInfo } : {}) });
}
