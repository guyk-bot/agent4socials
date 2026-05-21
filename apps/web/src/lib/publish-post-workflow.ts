/**
 * Shared publish execution for POST /api/posts/[id]/publish and in-process cron.
 * Cron calls this directly so one lambda holds one DB connection instead of
 * N parallel HTTP publishes each opening their own connection (pool exhaustion).
 */

import { prisma, withPrismaPoolRetry } from '@/lib/db';
import { PostStatus, Prisma } from '@prisma/client';
import axios from 'axios';
import { publishTarget } from '@/lib/publish-target';
import {
  buildDefaultTikTokDirectPostPayload,
  isTikTokDirectPostPayload,
  type TikTokDirectPostPayload,
} from '@/lib/tiktok/tiktok-publish-compliance';
import { createMediaServeToken } from '@/lib/media-serve-token';
import { ensureInstagramJpegOnR2 } from '@/lib/instagram-media-r2';
import { ensureStoryJpegOnR2 } from '@/lib/story-media-r2';
import { refreshTwitterToken } from '@/lib/twitter-refresh';
import { getValidPinterestToken } from '@/lib/pinterest-token';
import {
  postScalarsSelectWithMediaType,
  postScalarsSelectWithoutMediaType,
  prismaPostReadWithMediaTypeFallback,
} from '@/lib/prisma-post-media-type-fallback';
import { resolveComposerMediaType } from '@/lib/composer-media-type';

export type PublishPostRequestBody = {
  token?: string;
  contentByPlatform?: Record<string, string>;
  pinterestSandbox?: boolean;
  tiktokPublishByAccountId?: Record<string, unknown>;
  /** Composer format (photo, story, reel, …). Used when Post.mediaType was not persisted. */
  mediaType?: string;
};

export type PublishPostWorkflowResult = {
  status: number;
  body: Record<string, unknown>;
};

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

function publishTargetTimeoutMs(platform: string): number {
  if (platform === 'TIKTOK') return 600_000;
  if (platform === 'YOUTUBE') return 180_000;
  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') return 150_000;
  if (platform === 'LINKEDIN') return 300_000;
  return 120_000;
}

/** If publish was killed mid-flight, derive final post status from per-platform targets. */
/** Mark post and targets POSTING and persist TikTok settings before returning HTTP 202. */
export async function preparePostForBackgroundPublish(
  postId: string,
  userId: string,
  requestBody: PublishPostRequestBody
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  return withPrismaPoolRetry('prepare-post-publish', async () => {
    const post = await prisma.post.findFirst({
      where: { id: postId, userId },
      select: {
        id: true,
        status: true,
        content: true,
        title: true,
        tiktokPublishByAccountId: true,
        targets: { select: { id: true, socialAccountId: true, platform: true } },
      },
    });
    if (!post) {
      return { ok: false, message: 'Post not found', status: 404 };
    }
    if (
      post.status !== PostStatus.DRAFT &&
      post.status !== PostStatus.SCHEDULED &&
      post.status !== PostStatus.POSTING
    ) {
      return { ok: false, message: 'Post already published', status: 400 };
    }

    const stored =
      post.tiktokPublishByAccountId &&
      typeof post.tiktokPublishByAccountId === 'object' &&
      !Array.isArray(post.tiktokPublishByAccountId)
        ? (post.tiktokPublishByAccountId as Record<string, unknown>)
        : {};
    const bodyTiktok = requestBody.tiktokPublishByAccountId;
    const allowedAccountIds = new Set(post.targets.map((t) => t.socialAccountId));
    const merged: Record<string, unknown> = { ...stored };
    if (bodyTiktok && typeof bodyTiktok === 'object' && !Array.isArray(bodyTiktok)) {
      for (const [accountId, payload] of Object.entries(bodyTiktok)) {
        if (!allowedAccountIds.has(accountId)) continue;
        if (isTikTokDirectPostPayload(payload)) {
          merged[accountId] = payload;
        }
      }
    }

    const captionSeed = String(post.title || post.content || '').trim();
    for (const target of post.targets) {
      if (target.platform !== 'TIKTOK') continue;
      if (isTikTokDirectPostPayload(merged[target.socialAccountId])) continue;
      merged[target.socialAccountId] = buildDefaultTikTokDirectPostPayload(captionSeed);
    }

    const updateData: Prisma.PostUpdateInput = {
      status: PostStatus.POSTING,
    };
    if (Object.keys(merged).length > 0) {
      updateData.tiktokPublishByAccountId = merged as Prisma.InputJsonValue;
    }

    await prisma.post.update({
      where: { id: postId },
      data: updateData,
      select: { id: true },
    });
    await prisma.postTarget.updateMany({
      where: { postId },
      data: { status: PostStatus.POSTING, error: null },
    });

    return { ok: true };
  });
}

export async function finalizePostPublishState(postId: string): Promise<void> {
  await withPrismaPoolRetry('finalizePostPublishState', async () => {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { status: true },
    });
    if (!post || post.status !== PostStatus.POSTING) return;

    const targetsNow = await prisma.postTarget.findMany({
      where: { postId },
      select: { status: true },
    });
    if (targetsNow.some((t) => t.status === PostStatus.POSTING)) {
      return;
    }
    const totalTargets = targetsNow.length;
    const postedCount = targetsNow.filter((t) => t.status === PostStatus.POSTED).length;
    const allTargetsPosted = totalTargets > 0 && postedCount === totalTargets;
    const nextPostStatus =
      totalTargets === 0
        ? PostStatus.FAILED
        : allTargetsPosted
          ? PostStatus.POSTED
          : postedCount > 0
            ? PostStatus.POSTED
            : PostStatus.FAILED;

    await prisma.post.update({
      where: { id: postId },
      data: {
        status: nextPostStatus,
        ...(postedCount > 0 ? { postedAt: new Date() } : {}),
      },
      select: { id: true },
    });
  });
}

export async function runPublishPostWorkflow(input: {
  postId: string;
  isCron: boolean;
  userId: string | null;
  linkToken: string | null;
  requestBody: PublishPostRequestBody;
  isDebug: boolean;
}): Promise<PublishPostWorkflowResult> {
  const { postId, isCron, userId, linkToken, requestBody, isDebug } = input;

  try {
  const post = await withPrismaPoolRetry('publish-find-post', () =>
    prismaPostReadWithMediaTypeFallback((withMediaTypeCol) =>
    prisma.post.findFirst({
      where: isCron
        ? { id: postId, status: PostStatus.SCHEDULED, scheduledAt: { lte: new Date() }, scheduleDelivery: 'auto' }
        : linkToken
          ? { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } }
          : { id: postId, userId: userId! },
      select: {
        ...(withMediaTypeCol ? postScalarsSelectWithMediaType() : postScalarsSelectWithoutMediaType()),
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
    })
  ));
  if (!post) {
    return { status: 404, body: { message: 'Post not found' } };
  }
  if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED && post.status !== PostStatus.POSTING) {
    return { status: 400, body: { message: 'Post already published' } };
  }

  await withPrismaPoolRetry('publish-mark-posting', () =>
    prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.POSTING },
    select: { id: true },
  })
  );

  const contentByPlatform = (post as { contentByPlatform?: Record<string, string> | null }).contentByPlatform ?? null;
  const mediaByPlatform = (post as { mediaByPlatform?: Record<string, { fileUrl: string; type: string }[]> | null }).mediaByPlatform ?? null;
  const postMediaType = resolveComposerMediaType({
    requestBodyType: requestBody.mediaType,
    postMediaType: (post as { mediaType?: string | null }).mediaType,
    media: post.media,
  });
  const storedTiktok = (post as { tiktokPublishByAccountId?: Record<string, unknown> | null }).tiktokPublishByAccountId;
  const bodyTiktok = requestBody.tiktokPublishByAccountId;
  const tiktokMerged: Record<string, unknown> = {
    ...(storedTiktok && typeof storedTiktok === 'object' && !Array.isArray(storedTiktok) ? storedTiktok : {}),
    ...(bodyTiktok && typeof bodyTiktok === 'object' && !Array.isArray(bodyTiktok) ? bodyTiktok : {}),
  };
  const defaultMedia = post.media.map((m) => {
    const meta = (m as { metadata?: { thumbnailUrl?: string; useVideoDefaultForPublish?: boolean } }).metadata;
    const useVideoDefault = meta?.useVideoDefaultForPublish;
    return {
      fileUrl: m.fileUrl,
      type: m.type,
      thumbnailUrl: useVideoDefault ? undefined : meta?.thumbnailUrl,
    };
  });

  function directR2IfOurs(url: string): string | null {
    if (!url?.startsWith('http')) return null;
    const base = process.env.S3_PUBLIC_URL?.trim();
    if (base) {
      try {
        const baseOrigin = new URL(base.replace(/\/$/, '')).origin;
        const urlOrigin = new URL(url).origin;
        if (urlOrigin === baseOrigin) return url;
      } catch (_) {}
    }
    try {
      const host = new URL(url).hostname;
      if (/\.r2\.dev$/i.test(host) || /cloudflarestorage\.com$/i.test(host)) return url;
    } catch (_) {}
    return null;
  }

  function publicMediaUrlForMeta(fileUrl: string, opts?: { instagramImage?: boolean }): string {
    if (!fileUrl || !fileUrl.startsWith('http')) return fileUrl;
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');
    if (!appBase) return fileUrl;
    try {
      const parsed = new URL(fileUrl);
      const appHost = new URL(appBase).hostname;
      if (parsed.hostname === appHost) return fileUrl;
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

  const debugInfo: { mediaUrlsByPlatform?: Record<string, string>; fullErrors?: Record<string, string> } | undefined =
    isDebug ? { mediaUrlsByPlatform: {}, fullErrors: {} } : undefined;

  type PublishOutcome = {
    platform: string;
    ok: boolean;
    error?: string;
    mediaSkipped?: boolean;
    sentToInbox?: boolean;
  };

  const results: PublishOutcome[] = await Promise.all(
    post.targets.map(async (target): Promise<PublishOutcome> => {
    try {
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
    const targetMedia = (platformMedia && platformMedia.length > 0 ? platformMedia : defaultMedia) as {
      fileUrl: string;
      type: string;
      thumbnailUrl?: string;
    }[];
    const allImages = targetMedia.filter((m) => m.type === 'IMAGE');
    const firstVideo = targetMedia.find((m) => m.type === 'VIDEO');
    let firstImageUrl = allImages[0]?.fileUrl;
    // Instagram/Facebook Reels and native video use `firstMediaUrl`. It must be a real VIDEO asset;
    // using `targetMedia[0]` sent single images through the IG Reels pipeline (transcoding: invalid duration).
    let firstMediaUrl =
      platform === 'INSTAGRAM' || platform === 'FACEBOOK' ? firstVideo?.fileUrl : targetMedia[0]?.fileUrl;
    if ((platform === 'TIKTOK' || platform === 'LINKEDIN' || platform === 'YOUTUBE') && firstVideo?.fileUrl) {
      firstMediaUrl = firstVideo.fileUrl;
    }
    let videoThumbnailUrl =
      targetMedia[0] && targetMedia[0].type === 'VIDEO' ? (targetMedia[0] as { thumbnailUrl?: string }).thumbnailUrl : undefined;
    let imageUrls: string[] | undefined;
    if (platform === 'TIKTOK' || platform === 'LINKEDIN') {
      if (firstMediaUrl) {
        const directR2 = directR2IfOurs(firstMediaUrl);
        if (directR2) firstMediaUrl = directR2;
      }
    }
    if (platform === 'PINTEREST' && firstImageUrl) {
      firstImageUrl = publicMediaUrlForMeta(firstImageUrl);
    }
    if (platform === 'PINTEREST' && firstMediaUrl) {
      firstMediaUrl = publicMediaUrlForMeta(firstMediaUrl);
    }
    if (platform === 'PINTEREST' && videoThumbnailUrl) {
      videoThumbnailUrl = publicMediaUrlForMeta(videoThumbnailUrl);
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
      const isStoryImage = postMediaType === 'story' && Boolean(allImages[0]?.fileUrl);
      if (isStoryImage) {
        const raw = allImages[0]!.fileUrl;
        let storyUrl: string | null = null;
        const directR2 = directR2IfOurs(raw);
        if (directR2) storyUrl = await ensureStoryJpegOnR2(directR2, fetch);
        if (!storyUrl) {
          const jpegR2 = await ensureInstagramJpegOnR2(raw, fetch);
          if (jpegR2) storyUrl = await ensureStoryJpegOnR2(jpegR2, fetch);
        }
        firstImageUrl = storyUrl ?? (await urlForInstagram(raw, isInstagram));
      } else if (firstImageUrl) {
        firstImageUrl = await urlForInstagram(firstImageUrl, isInstagram);
      }
      if (firstMediaUrl) firstMediaUrl = await urlForInstagram(firstMediaUrl, isInstagram && firstIsImage);
      if (videoThumbnailUrl) {
        const thumbR2 = directR2IfOurs(videoThumbnailUrl);
        if (thumbR2) videoThumbnailUrl = thumbR2;
        else videoThumbnailUrl = await urlForInstagram(videoThumbnailUrl, isInstagram);
      }
      if (isInstagram && allImages.length >= 2 && allImages.length <= 10) {
        imageUrls = await Promise.all(allImages.map((m) => urlForInstagram(m.fileUrl, true)));
      }
      if (isDebug && debugInfo?.mediaUrlsByPlatform) {
        const url = firstImageUrl || firstMediaUrl || videoThumbnailUrl;
        if (url) debugInfo.mediaUrlsByPlatform[platform] = url;
      }
      const urlToCheck = firstImageUrl || firstMediaUrl || (imageUrls && imageUrls[0]);
      if (urlToCheck && urlToCheck.startsWith('http')) {
        try {
          const headRes = await fetch(urlToCheck, {
            method: 'GET',
            headers: { 'User-Agent': 'InstagramBot/1.0' },
            signal: AbortSignal.timeout(15_000),
          });
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
            return {
              platform,
              ok: false,
              error: `Media URL returned ${headRes.status} (Meta would get same).${hint} Check docs/INSTAGRAM_2207076_ANALYSIS.md`,
            };
          }
        } catch (preflightErr) {
          const msg = (preflightErr as Error)?.message ?? String(preflightErr);
          await prisma.postTarget.update({
            where: { id: target.id },
            data: { status: PostStatus.FAILED, error: `Media unreachable: ${msg}`.slice(0, 500) },
          });
          return {
            platform,
            ok: false,
            error: `Media URL unreachable: ${msg}. Set S3_PUBLIC_URL, CRON_SECRET in Vercel. See docs/INSTAGRAM_2207076_ANALYSIS.md`,
          };
        }
      }
    }

    const creds = socialAccount.credentialsJson as {
      twitterOAuth1AccessToken?: string;
      twitterOAuth1AccessTokenSecret?: string;
      grantedScope?: string;
      pinterestDefaultBoardId?: string | null;
      linkedinRestPersonUrn?: string;
    } | null;
    const twitterOAuth1 =
      platform === 'TWITTER' && creds?.twitterOAuth1AccessToken && creds?.twitterOAuth1AccessTokenSecret
        ? { accessToken: creds.twitterOAuth1AccessToken, accessTokenSecret: creds.twitterOAuth1AccessTokenSecret }
        : undefined;
    const pinterestBoardId =
      platform === 'PINTEREST' && typeof creds?.pinterestDefaultBoardId === 'string' ? creds.pinterestDefaultBoardId : null;

    if (platform === 'PINTEREST' && !firstImageUrl && !firstMediaUrl) {
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: PostStatus.FAILED,
          error: 'Pinterest needs at least one image or video in the post.',
        },
      });
      return { platform, ok: false, error: 'Pinterest needs at least one image or video.' };
    }

    const isTiktokVideo = platform === 'TIKTOK' && targetMedia.some((m) => m.type === 'VIDEO');
    const isTiktokPhoto = platform === 'TIKTOK' && !isTiktokVideo && targetMedia.some((m) => m.type === 'IMAGE');
    const isTiktokDirectPostRequired = isTiktokVideo || isTiktokPhoto;
    let tiktokDirectPost: TikTokDirectPostPayload | undefined;
    if (isTiktokDirectPostRequired) {
      const raw = tiktokMerged[socialAccount.id];
      const tiktokEntries = Object.entries(tiktokMerged).filter(([, value]) => isTikTokDirectPostPayload(value));
      const fallbackSinglePayload =
        raw == null && tiktokEntries.length === 1
          ? tiktokEntries[0]?.[1]
          : undefined;
      const rawForValidation = raw ?? fallbackSinglePayload;
      if (!isTikTokDirectPostPayload(raw)) {
        const missingFields =
          rawForValidation && typeof rawForValidation === 'object' && !Array.isArray(rawForValidation)
            ? ([
                ['privacyLevel', typeof (rawForValidation as Record<string, unknown>).privacyLevel === 'string'],
                ['allowComment', typeof (rawForValidation as Record<string, unknown>).allowComment === 'boolean'],
                ['allowDuet', typeof (rawForValidation as Record<string, unknown>).allowDuet === 'boolean'],
                ['allowStitch', typeof (rawForValidation as Record<string, unknown>).allowStitch === 'boolean'],
                ['commercialDisclosureOn', typeof (rawForValidation as Record<string, unknown>).commercialDisclosureOn === 'boolean'],
                ['yourBrand', typeof (rawForValidation as Record<string, unknown>).yourBrand === 'boolean'],
                ['brandedContent', typeof (rawForValidation as Record<string, unknown>).brandedContent === 'boolean'],
                ['title', typeof (rawForValidation as Record<string, unknown>).title === 'string'],
              ] as const)
                .filter(([, ok]) => !ok)
                .map(([name]) => name)
            : [];
        const availableIds = Object.keys(tiktokMerged);
        const details =
          missingFields.length > 0
            ? ` Missing or invalid fields: ${missingFields.join(', ')}.`
            : ` No TikTok payload was saved for this account (expected account id: ${socialAccount.id}${availableIds.length ? `, saved ids: ${availableIds.join(', ')}` : ', saved ids: none'}).`;
        const fallbackDetails =
          !raw && fallbackSinglePayload
            ? ` Reused the only saved TikTok payload from a different account id key (${tiktokEntries[0]?.[0]}).`
            : '';
        if (fallbackSinglePayload && isTikTokDirectPostPayload(fallbackSinglePayload)) {
          tiktokDirectPost = fallbackSinglePayload;
          console.log('[TikTok publish] using single-payload fallback by account id', {
            expectedAccountId: socialAccount.id,
            fallbackAccountId: tiktokEntries[0]?.[0],
          });
        } else {
        const msg =
          isCron || post.status === PostStatus.SCHEDULED
            ? 'TikTok needs Post to TikTok settings saved on the post. Open the post in the composer, complete the TikTok step, and save or reschedule.'
            : 'TikTok needs Post to TikTok settings. Open the post in the composer, complete the TikTok step, then publish again.';
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.FAILED, error: `${msg}${details}${fallbackDetails}`.slice(0, 500) },
        });
        return { platform, ok: false, error: `${msg}${details}${fallbackDetails}`.slice(0, 300) };
        }
      }
      if (!tiktokDirectPost && isTikTokDirectPostPayload(raw)) {
        tiktokDirectPost = raw;
      }
    }

    const isStory = postMediaType === 'story' && (platform === 'INSTAGRAM' || platform === 'FACEBOOK');

    if (platform === 'TWITTER' && firstImageUrl) {
      const oauth1Ready =
        Boolean(creds?.twitterOAuth1AccessToken && creds?.twitterOAuth1AccessTokenSecret) &&
        Boolean(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
      if (!oauth1Ready) {
        const gs = typeof creds?.grantedScope === 'string' ? creds.grantedScope.trim() : '';
        if (gs && !/\bmedia\.write\b/i.test(gs)) {
          const errLong =
            'X (Twitter): this connection was authorized without the media.write scope, so image upload is blocked. Disconnect X in Dashboard → Accounts and connect again (consent must include media), or use “Enable image upload” for OAuth 1.0a. If you use TWITTER_OAUTH_SCOPES in Vercel, add media.write and redeploy before reconnecting.';
          await prisma.postTarget.update({
            where: { id: target.id },
            data: { status: PostStatus.FAILED, error: errLong.slice(0, 500) },
          });
          return {
            platform,
            ok: false,
            error:
              'X reconnect required for images: your connection lacks media.write. Disconnect X, reconnect, or use Enable image upload.'.slice(0, 200),
          };
        }
      }
    }

    const publishOpts = {
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
      pinterestSandbox: requestBody.pinterestSandbox === true,
      ...(tiktokDirectPost ? { tiktokDirectPost } : {}),
      ...(platform === 'TIKTOK'
        ? { tiktokPostMediaKind: (isTiktokPhoto ? 'photo' : 'video') as 'photo' | 'video' }
        : {}),
      ...(isStory ? { isStory: true } : {}),
      ...(platform === 'LINKEDIN' &&
      typeof creds?.linkedinRestPersonUrn === 'string' &&
      creds.linkedinRestPersonUrn.startsWith('urn:li:')
        ? { linkedInAuthorUrn: creds.linkedinRestPersonUrn }
        : {}),
    };
    const publishDeps = { fetch, axios };
    const targetTimeoutLabel = `${platform} publish timed out after ${publishTargetTimeoutMs(platform) / 1000}s`;
    let result = await promiseWithTimeout(
      publishTarget(publishOpts, publishDeps),
      publishTargetTimeoutMs(platform),
      targetTimeoutLabel
    );

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
        result = await promiseWithTimeout(
          publishTarget({ ...publishOpts, token }, publishDeps),
          publishTargetTimeoutMs(platform),
          targetTimeoutLabel
        );
      } catch (refreshErr) {
        result = {
          ok: false,
          error: `Token refresh failed: ${(refreshErr as Error).message}. Reconnect the Twitter account in Accounts.`,
        };
      }
    }

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
        result = await promiseWithTimeout(
          publishTarget(publishOpts, publishDeps),
          publishTargetTimeoutMs(platform),
          targetTimeoutLabel
        );
      }
    }

    if (result.ok) {
      const inboxNote = result.sentToInbox
        ? 'TikTok queued this in your app Inbox instead of publishing directly. Open the TikTok app to finish posting.'
        : undefined;
      await withPrismaPoolRetry('publish-target-posted', () =>
        prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: PostStatus.POSTED,
            ...(result.platformPostId ? { platformPostId: result.platformPostId } : {}),
            ...(inboxNote ? { error: inboxNote } : {}),
          },
        })
      );
      return { platform, ok: true, ...(result.mediaSkipped ? { mediaSkipped: true } : {}), ...(result.sentToInbox ? { sentToInbox: true } : {}) };
    }
    if (platform === 'INSTAGRAM') {
      console.error('[Instagram publish failed]', { postId, error: result.error, mediaUrl: firstImageUrl || firstMediaUrl });
    }
    if (platform === 'TIKTOK') {
      console.error('[TikTok publish failed]', { postId, error: result.error });
    }
    // Do not overwrite POSTED: overlapping publishes (double submit / retry) can succeed on
    // the platform first, then a slower duplicate attempt returns an error and would wrongly
    // mark the target FAILED and hide it from dashboard Content History.
    await withPrismaPoolRetry('publish-target-failed', () =>
      prisma.postTarget.updateMany({
        where: { id: target.id, status: { not: PostStatus.POSTED } },
        data: { status: PostStatus.FAILED, error: result.error?.slice(0, 500) },
      })
    );
    if (isDebug && debugInfo?.fullErrors && result.error) {
      debugInfo.fullErrors[platform] = result.error;
    }
    return { platform, ok: false, error: result.error?.slice(0, 200) };
    } catch (targetErr) {
      const platform = target.socialAccount.platform;
      const err = (targetErr as Error)?.message ?? String(targetErr);
      try {
        await withPrismaPoolRetry('publish-target-exception', () =>
          prisma.postTarget.updateMany({
            where: { id: target.id, status: { not: PostStatus.POSTED } },
            data: { status: PostStatus.FAILED, error: err.slice(0, 500) },
          })
        );
      } catch {
        /* pool */
      }
      return { platform, ok: false, error: err.slice(0, 200) };
    }
  })
  );

  const anyFailed = results.some((r) => !r.ok);
  const targetsNow = await prisma.postTarget.findMany({
    where: { postId },
    select: { status: true },
  });
  const totalTargets = targetsNow.length;
  const postedCount = targetsNow.filter((t) => t.status === PostStatus.POSTED).length;
  const allTargetsPosted = totalTargets > 0 && postedCount === totalTargets;
  const nextPostStatus =
    totalTargets === 0
      ? anyFailed
        ? PostStatus.FAILED
        : PostStatus.POSTED
      : allTargetsPosted
        ? PostStatus.POSTED
        : postedCount > 0
          ? PostStatus.POSTED
          : PostStatus.FAILED;
  const bodyOk = totalTargets === 0 ? !anyFailed : allTargetsPosted;

  await withPrismaPoolRetry('publish-finalize-post', () =>
    prisma.post.update({
      where: { id: postId },
      data: {
        status: nextPostStatus,
        ...(postedCount > 0 ? { postedAt: new Date() } : {}),
      },
      select: { id: true },
    })
  );

  const body: Record<string, unknown> = { ok: bodyOk, results };
  if (isDebug && debugInfo) body.debugInfo = debugInfo;
  return { status: 200, body };
  } catch (e) {
    console.error('[publish-post-workflow]', postId, e instanceof Error ? e.message : e);
    throw e;
  } finally {
    try {
      await finalizePostPublishState(postId);
    } catch (finalizeErr) {
      console.error('[publish-post-workflow] finalize', postId, finalizeErr);
    }
  }
}
