/**
 * Publish a single target to a platform (external API calls only).
 * Used by the publish route and by tests to verify image upload + post flow.
 */

import FormData from 'form-data';
import { signTwitterRequest } from './twitter-oauth1';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import { facebookGraphBaseUrl, META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';
import {
  buildTikTokPostInfoFromPayload,
  parseTikTokCreatorInfoResponse,
  type TikTokDirectPostPayload,
} from '@/lib/tiktok/tiktok-publish-compliance';

const graphVideoFacebook = `https://graph-video.facebook.com/${META_GRAPH_FACEBOOK_API_VERSION}`;

export type PublishTargetOptions = {
  platform: string;
  token: string;
  platformUserId: string;
  caption: string;
  firstImageUrl?: string;
  firstMediaUrl?: string;
  /** For Instagram carousel: 2-10 image URLs (all must be JPEG for Meta). */
  imageUrls?: string[];
  /** Optional cover/thumbnail URL for video (e.g. Instagram Reels cover_url). */
  videoThumbnailUrl?: string;
  /** When set, Twitter image upload uses v1.1 simple multipart + OAuth 1.0a. Without it, images use X API v2 resumable upload with the OAuth 2.0 user token. */
  twitterOAuth1?: { accessToken: string; accessTokenSecret: string };
  /** Pinterest Pin target board (from account credentials after connect). */
  pinterestBoardId?: string | null;
  /** Use Pinterest sandbox API host (trial/demo mode). */
  pinterestSandbox?: boolean;
  /** TikTok video: required for Direct Post (composer modal + scheduled JSON on Post). */
  tiktokDirectPost?: TikTokDirectPostPayload;
  /** Instagram/Facebook: publish as a Story instead of a feed post. */
  isStory?: boolean;
};

export type PublishTargetResult = {
  ok: boolean;
  platformPostId?: string;
  error?: string;
  /** True when the post was published but media (e.g. image) was skipped (e.g. Twitter 403 on upload). */
  mediaSkipped?: boolean;
  /** True when TikTok accepted the video but sent it to the creator's inbox instead of publishing directly (unaudited app). */
  sentToInbox?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PublishDeps = { fetch: typeof globalThis.fetch; axios: any };

/** Human-readable Pinterest API error for publish failures and support. */
function pinterestApiErrorDetail(status: number | undefined, data: unknown): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const parts: string[] = [];
    if (o.message != null) parts.push(String(o.message));
    if (o.code != null) parts.push(`code ${String(o.code)}`);
    if (o.details != null) {
      parts.push(typeof o.details === 'string' ? o.details : JSON.stringify(o.details));
    }
    if (o.reason != null) parts.push(String(o.reason));
    if (parts.length) return parts.join(' · ');
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  try {
    const s = JSON.stringify(data);
    if (s && s !== '{}') return s;
  } catch (_) {}
  return status != null ? `HTTP ${status}` : 'Unknown error';
}

/** Max raw bytes for Pinterest video cover when sending Base64 (avoid huge JSON bodies). */
const PINTEREST_COVER_MAX_BYTES = 2 * 1024 * 1024;

/** TikTok FILE_UPLOAD init: see https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide */
const TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const TIKTOK_MAX_SINGLE_UPLOAD_BYTES = 64 * 1024 * 1024;
/** When video exceeds 64MB, split into 10MB parts (matches TikTok docs example). */
const TIKTOK_MULTIPART_CHUNK_BYTES = 10 * 1024 * 1024;

function tiktokFileUploadChunkPlan(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  const n = Math.max(0, Math.floor(videoSize));
  if (n <= 0) return { chunkSize: 1, totalChunkCount: 1 };
  if (n < TIKTOK_MIN_CHUNK_BYTES) {
    return { chunkSize: n, totalChunkCount: 1 };
  }
  if (n <= TIKTOK_MAX_SINGLE_UPLOAD_BYTES) {
    return { chunkSize: n, totalChunkCount: 1 };
  }
  const chunkSize = TIKTOK_MULTIPART_CHUNK_BYTES;
  const totalChunkCount = Math.ceil(n / chunkSize);
  return { chunkSize, totalChunkCount };
}

function pinterestCoverContentTypeFromBuffer(contentType: string): 'image/jpeg' | 'image/png' {
  const c = contentType.toLowerCase();
  if (c.includes('png')) return 'image/png';
  return 'image/jpeg';
}

async function fetchImageBuffer(
  url: string,
  fetchFn: typeof globalThis.fetch
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { buffer, contentType };
}

/** Fetch any media (image or video) as buffer; used for video uploads to LinkedIn and Twitter. */
async function fetchMediaBuffer(
  url: string,
  fetchFn: typeof globalThis.fetch
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'video/mp4';
  return { buffer, contentType };
}

/**
 * X API v2 media upload (OAuth 2.0 user Bearer).
 * - v1.1 `upload.twitter.com` + Bearer is rejected as application-only for many apps.
 * - The legacy single `POST …/2/media/upload` with multipart `command=INIT` is deprecated; use split endpoints instead.
 * - OAuth 2.0 user tokens must include **media.write** for v2 media upload; without it, X may return “Application-Only” / unsupported auth.
 * - Try **api.twitter.com** first, then **api.x.com**—some tokens succeed on one host only.
 * @see https://devcommunity.x.com/t/media-upload-endpoints-update-and-extended-migration-deadline/241818
 */
const TWITTER_V2_MEDIA_HOSTS = ['https://api.twitter.com/2/media/upload', 'https://api.x.com/2/media/upload'] as const;

function twitterInitMediaTypeFromImageContentType(contentType: string): { mediaType: string; filename: string } {
  const c = contentType.toLowerCase();
  if (c.includes('png')) return { mediaType: 'image/png', filename: 'image.png' };
  if (c.includes('webp')) return { mediaType: 'image/webp', filename: 'image.webp' };
  if (c.includes('gif')) return { mediaType: 'image/gif', filename: 'image.gif' };
  return { mediaType: 'image/jpeg', filename: 'image.jpg' };
}

function twitterV2MediaProcessingInfo(data: unknown): { state?: string; check_after_secs?: number } | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const top = o.processing_info;
  if (top && typeof top === 'object') return top as { state?: string; check_after_secs?: number };
  const inner = o.data;
  if (inner && typeof inner === 'object') {
    const pi = (inner as Record<string, unknown>).processing_info;
    if (pi && typeof pi === 'object') return pi as { state?: string; check_after_secs?: number };
  }
  return undefined;
}

function parseTwitterMediaUploadId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const o = body as Record<string, unknown>;
  const data = o.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.id === 'string' && d.id.trim()) return d.id.trim();
    if (typeof d.media_id_string === 'string' && d.media_id_string.trim()) return d.media_id_string.trim();
  }
  if (typeof o.media_id_string === 'string' && o.media_id_string.trim()) return o.media_id_string.trim();
  return undefined;
}

/**
 * OAuth 2.0 user-context media upload using X v2 split endpoints (initialize → append → finalize).
 * @see https://docs.x.com/x-api/media/media-upload-initialize
 */
function twitterMediaAuthHint(): string {
  return ' Reconnect X from Dashboard → Accounts so the app requests the **media.write** scope (or use “Enable image upload” for OAuth 1.0a media). If you set TWITTER_OAUTH_SCOPES in Vercel, include media.write.';
}

async function twitterOAuth2ResumableMediaUpload(
  axiosInstance: PublishDeps['axios'],
  userAccessToken: string,
  buffer: Buffer,
  mediaType: string,
  mediaCategory: string,
  appendFilename: string
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const auth = { Authorization: `Bearer ${userAccessToken}` };

  let mediaBase = '';
  let initPayload: unknown = null;
  let lastInitErr = '';

  for (const host of TWITTER_V2_MEDIA_HOSTS) {
    const initRes = await axiosInstance.post(
      `${host}/initialize`,
      {
        media_type: mediaType,
        total_bytes: buffer.length,
        media_category: mediaCategory,
      },
      {
        headers: { ...auth, 'Content-Type': 'application/json' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60_000,
        validateStatus: () => true,
      }
    );
    const errStr =
      typeof initRes.data === 'object' ? JSON.stringify(initRes.data) : String(initRes.data ?? initRes.status);
    if (initRes.status === 200) {
      const id = parseTwitterMediaUploadId(initRes.data);
      if (id) {
        mediaBase = host;
        initPayload = initRes.data;
        break;
      }
      lastInitErr = `Twitter media initialize (v2) did not return a media id: ${JSON.stringify(initRes.data)}`.slice(0, 500);
      return { ok: false, error: lastInitErr };
    }
    lastInitErr = `Twitter media initialize (v2) failed: ${initRes.status} ${errStr}`.slice(0, 500);
    const isAuthShape = /Application-Only|Unsupported Authentication/i.test(errStr);
    if (!isAuthShape) {
      return { ok: false, error: lastInitErr };
    }
  }

  if (!mediaBase || !initPayload) {
    let msg = lastInitErr || 'Twitter media initialize (v2) failed on all hosts.';
    if (/Application-Only|Unsupported Authentication/i.test(msg)) msg += twitterMediaAuthHint();
    return { ok: false, error: msg };
  }

  const mediaId = parseTwitterMediaUploadId(initPayload);
  if (!mediaId) {
    return {
      ok: false,
      error: `Twitter media initialize (v2) did not return a media id: ${JSON.stringify(initPayload)}`.slice(0, 500),
    };
  }

  const appendForm = new FormData();
  appendForm.append('segment_index', '0');
  appendForm.append('media', buffer, { filename: appendFilename, contentType: mediaType });
  const appendRes = await axiosInstance.post(`${mediaBase}/${encodeURIComponent(mediaId)}/append`, appendForm, {
    headers: { ...auth, ...appendForm.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60_000,
    validateStatus: () => true,
  });
  if (appendRes.status < 200 || appendRes.status >= 300) {
    const err =
      typeof appendRes.data === 'object' ? JSON.stringify(appendRes.data) : String(appendRes.data ?? appendRes.status);
    return { ok: false, error: `Twitter media append (v2) failed: ${appendRes.status} ${err}`.slice(0, 500) };
  }

  const finalizeRes = await axiosInstance.post(
    `${mediaBase}/${encodeURIComponent(mediaId)}/finalize`,
    {},
    {
      headers: { ...auth, 'Content-Type': 'application/json' },
      timeout: 60_000,
      validateStatus: () => true,
    }
  );
  if (finalizeRes.status !== 200) {
    const err =
      typeof finalizeRes.data === 'object'
        ? JSON.stringify(finalizeRes.data)
        : String(finalizeRes.data ?? finalizeRes.status);
    return { ok: false, error: `Twitter media finalize (v2) failed: ${finalizeRes.status} ${err}`.slice(0, 500) };
  }

  const finPi = twitterV2MediaProcessingInfo(finalizeRes.data);
  const state = finPi?.state;
  if (state && state !== 'succeeded') {
    const statusUrl = `${mediaBase}?command=STATUS&media_id=${encodeURIComponent(mediaId)}`;
    // Images usually finish quickly; avoid sleeping 2s before the first STATUS poll.
    const maxWaitMs = mediaCategory === 'tweet_image' ? 22_000 : 90_000;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const statusRes = await axiosInstance.get(statusUrl, {
        headers: auth,
        timeout: 12_000,
        validateStatus: () => true,
      });
      const proc = twitterV2MediaProcessingInfo(statusRes.data);
      const st = proc?.state;
      if (st === 'succeeded') break;
      if (st === 'failed') {
        return { ok: false, error: 'Twitter media processing failed (v2 STATUS)' };
      }
      const secs =
        typeof proc?.check_after_secs === 'number'
          ? proc.check_after_secs
          : typeof finPi?.check_after_secs === 'number'
            ? finPi.check_after_secs
            : mediaCategory === 'tweet_image'
              ? 0.35
              : 1.5;
      const waitMs = Math.min(12_000, Math.max(250, Math.round(secs * 1000)));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return { ok: true, mediaId };
}

export async function publishTarget(
  options: PublishTargetOptions,
  deps: PublishDeps
): Promise<PublishTargetResult> {
  const {
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
    pinterestSandbox,
    isStory,
  } = options;
  const { fetch: fetchFn, axios: axiosInstance } = deps;
  const pinterestApiBase = pinterestSandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';

  /** Poll Instagram container until status_code is FINISHED or ERROR. Required before media_publish. */
  async function waitForInstagramContainer(containerId: string, token: string, maxWaitMs = 90_000): Promise<{ ok: boolean; error?: string }> {
    const intervalMs = 2000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const statusRes = await axiosInstance.get(
          `${facebookGraphBaseUrl}/${containerId}`,
          { params: { fields: 'status_code,status', access_token: token } }
        );
        const data = statusRes.data as { status_code?: string; status?: string };
        const code = data?.status_code;
        if (code === 'FINISHED') return { ok: true };
        if (code === 'ERROR') {
          const msg = data?.status ?? 'Container processing failed';
          return { ok: false, error: msg };
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        return { ok: false, error: msg };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { ok: false, error: 'Container did not finish processing in time' };
  }

  try {
    if (platform === 'INSTAGRAM') {
      // Story (image or video): published as media_product_type=STORY (no caption supported)
      if (isStory) {
        if (firstMediaUrl) {
          // Video story: resumable upload
          const containerRes = await axiosInstance.post(
            `${facebookGraphBaseUrl}/${platformUserId}/media`,
            null,
            {
              params: {
                media_type: 'VIDEO',
                media_product_type: 'STORY',
                upload_type: 'resumable',
                access_token: token,
              },
            }
          );
          const creationId = (containerRes.data as { id?: string })?.id;
          const uploadUri = (containerRes.data as { uri?: string })?.uri;
          if (!creationId || !uploadUri) throw new Error(JSON.stringify(containerRes.data));
          const uploadRes = await axiosInstance.post(uploadUri, null, {
            headers: { Authorization: `OAuth ${token}`, file_url: firstMediaUrl },
            validateStatus: (s: number) => s === 200 || s === 201,
          });
          if (uploadRes.status !== 200 && uploadRes.status !== 201) {
            throw new Error(uploadRes.data?.debug_info?.message ?? JSON.stringify(uploadRes.data));
          }
          const wait = await waitForInstagramContainer(creationId, token, 90_000);
          if (!wait.ok) throw new Error(wait.error ?? 'Story video container not ready');
          const publishRes = await axiosInstance.post(
            `${facebookGraphBaseUrl}/${platformUserId}/media_publish`,
            null,
            { params: { creation_id: creationId, access_token: token } }
          );
          return { ok: true, platformPostId: (publishRes.data as { id?: string })?.id };
        }
        if (firstImageUrl) {
          // Image story
          const containerRes = await axiosInstance.post(
            `${facebookGraphBaseUrl}/${platformUserId}/media`,
            null,
            {
              params: {
                image_url: firstImageUrl,
                media_product_type: 'STORY',
                access_token: token,
              },
            }
          );
          const creationId = (containerRes.data as { id?: string })?.id;
          if (!creationId) throw new Error(JSON.stringify(containerRes.data));
          const wait = await waitForInstagramContainer(creationId, token, 30_000);
          if (!wait.ok) throw new Error(wait.error ?? 'Story image container not ready');
          const publishRes = await axiosInstance.post(
            `${facebookGraphBaseUrl}/${platformUserId}/media_publish`,
            null,
            { params: { creation_id: creationId, access_token: token } }
          );
          return { ok: true, platformPostId: (publishRes.data as { id?: string })?.id };
        }
        return { ok: false, error: 'Instagram Story requires at least one image or video' };
      }
      if (firstMediaUrl) {
        // Reel: Resumable upload (more reliable than video_url; video_url often fails with 2207076)
        const containerRes = await axiosInstance.post(
          `${facebookGraphBaseUrl}/${platformUserId}/media`,
          null,
          {
            params: {
              media_type: 'REELS',
              upload_type: 'resumable',
              ...(caption?.trim() ? { caption: caption.trim() } : {}),
              ...(videoThumbnailUrl ? { cover_url: videoThumbnailUrl } : {}),
              access_token: token,
            },
          }
        );
        const creationId = (containerRes.data as { id?: string })?.id;
        const uploadUri = (containerRes.data as { uri?: string })?.uri;
        if (!creationId || !uploadUri) throw new Error(JSON.stringify(containerRes.data));
        const uploadRes = await axiosInstance.post(
          uploadUri,
          null,
          {
            headers: {
              Authorization: `OAuth ${token}`,
              file_url: firstMediaUrl,
            },
            validateStatus: (s: number) => s === 200 || s === 201,
          }
        );
        if (uploadRes.status !== 200 && uploadRes.status !== 201) {
          const debugMsg = uploadRes.data?.debug_info?.message ?? JSON.stringify(uploadRes.data);
          const hint = (uploadRes.data?.debug_info?.type === 'ProcessingFailedError' || (typeof debugMsg === 'string' && debugMsg.includes('processing failed')))
            ? ' Instagram could not process the media. Ensure the video/image URL is publicly accessible (HTTPS), Reels: 9:16 aspect ratio, 15-90 sec, MP4. See docs/INSTAGRAM_2207076_ANALYSIS.md.'
            : '';
          throw new Error(debugMsg + hint);
        }
        const wait = await waitForInstagramContainer(creationId, token, 90_000);
        if (!wait.ok) throw new Error(wait.error ?? 'Reel container not ready');
        const publishRes = await axiosInstance.post(
          `${facebookGraphBaseUrl}/${platformUserId}/media_publish`,
          null,
          { params: { creation_id: creationId, access_token: token } }
        );
        const mediaId = (publishRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: mediaId };
      }
      if (!firstImageUrl && (!imageUrls || imageUrls.length === 0)) {
        return { ok: false, error: 'Instagram requires at least one image or video' };
      }
      const urls = imageUrls && imageUrls.length >= 2 ? imageUrls : [firstImageUrl!];
      if (urls.length >= 2 && urls.length <= 10) {
        const childIds: string[] = [];
        for (const imageUrl of urls) {
          const itemRes = await axiosInstance.post(
            `${facebookGraphBaseUrl}/${platformUserId}/media`,
            null,
            { params: { image_url: imageUrl, is_carousel_item: 'true', access_token: token } }
          );
          const id = (itemRes.data as { id?: string })?.id;
          if (!id) throw new Error(JSON.stringify(itemRes.data));
          const wait = await waitForInstagramContainer(id, token, 30_000);
          if (!wait.ok) throw new Error(wait.error ?? 'Carousel item not ready');
          childIds.push(id);
        }
        const carouselRes = await axiosInstance.post(
          `${facebookGraphBaseUrl}/${platformUserId}/media`,
          null,
          {
            params: {
              media_type: 'CAROUSEL',
              children: childIds.join(','),
              caption: caption || undefined,
              access_token: token,
            },
          }
        );
        const creationId = (carouselRes.data as { id?: string })?.id;
        if (!creationId) throw new Error(JSON.stringify(carouselRes.data));
        const wait = await waitForInstagramContainer(creationId, token, 60_000);
        if (!wait.ok) throw new Error(wait.error ?? 'Carousel not ready');
        const publishRes = await axiosInstance.post(
          `${facebookGraphBaseUrl}/${platformUserId}/media_publish`,
          null,
          { params: { creation_id: creationId, access_token: token } }
        );
        const mediaId = (publishRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: mediaId };
      }
      const containerRes = await axiosInstance.post(
        `${facebookGraphBaseUrl}/${platformUserId}/media`,
        null,
        {
          params: {
            image_url: firstImageUrl!,
            caption: caption || undefined,
            access_token: token,
          },
        }
      );
      const creationId = (containerRes.data as { id?: string })?.id;
      if (!creationId) throw new Error(JSON.stringify(containerRes.data));
      const wait = await waitForInstagramContainer(creationId, token, 30_000);
      if (!wait.ok) throw new Error(wait.error ?? 'Image container not ready');
      const publishRes = await axiosInstance.post(
        `${facebookGraphBaseUrl}/${platformUserId}/media_publish`,
        null,
        { params: { creation_id: creationId, access_token: token } }
      );
      const mediaId = (publishRes.data as { id?: string })?.id;
      return { ok: true, platformPostId: mediaId };
    }

    if (platform === 'FACEBOOK') {
      let pageToken = token;
      try {
        const pagesRes = await axiosInstance.get(`${facebookGraphBaseUrl}/me/accounts`, {
          params: { fields: 'id,access_token', access_token: token },
        });
        const data = pagesRes.data as { data?: Array<{ id: string; access_token?: string }> } | undefined;
        const page = data?.data?.find((p) => p.id === platformUserId);
        if (page?.access_token) pageToken = page.access_token;
      } catch (_) {}
      // Post image as a Page photo. Video: use native /videos upload (not link).
      if (firstImageUrl) {
        const photoParams: Record<string, string> = {
          url: firstImageUrl,
          access_token: pageToken,
        };
        if (caption?.trim()) photoParams.caption = caption.trim();
        const photoRes = await axiosInstance.post(
          `${facebookGraphBaseUrl}/${platformUserId}/photos`,
          null,
          { params: photoParams }
        );
        const postId = (photoRes.data as { id?: string; post_id?: string })?.post_id ?? (photoRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: postId };
      }
      if (firstMediaUrl) {
        // Native video upload: try file_url first (Facebook fetches). Fallback to multipart if 389 (unable to fetch).
        let videoId: string | undefined;
        try {
          const videoParams: Record<string, string> = {
            file_url: firstMediaUrl,
            access_token: pageToken,
          };
          if (caption?.trim()) videoParams.description = caption.trim();
          const videoRes = await axiosInstance.post(
            `${graphVideoFacebook}/${platformUserId}/videos`,
            null,
            { params: videoParams, timeout: 120_000 }
          );
          videoId = (videoRes.data as { id?: string })?.id;
        } catch (fileUrlErr: unknown) {
          const ax = fileUrlErr as { response?: { data?: { error?: { code?: number; message?: string } } }; message?: string };
          const code = ax?.response?.data?.error?.code;
          const msg = ax?.response?.data?.error?.message ?? ax?.message ?? '';
          const isFetchError = code === 389 || (typeof msg === 'string' && (msg.includes('fetch') || msg.includes('389')));
          if (isFetchError && fetchFn) {
            try {
              const { buffer, contentType } = await fetchMediaBuffer(firstMediaUrl, fetchFn);
              const ext = contentType.includes('quicktime') ? 'mov' : 'mp4';
              const form = new FormData();
              form.append('source', buffer, { filename: `video.${ext}`, contentType: contentType || 'video/mp4' });
              form.append('access_token', pageToken);
              if (caption?.trim()) form.append('description', caption.trim());
              const formRes = await axiosInstance.post(
                `${graphVideoFacebook}/${platformUserId}/videos`,
                form,
                {
                  headers: form.getHeaders(),
                  maxBodyLength: Infinity,
                  maxContentLength: Infinity,
                  timeout: 120_000,
                }
              );
              videoId = (formRes.data as { id?: string })?.id;
            } catch (_) {
              throw fileUrlErr;
            }
          } else {
            throw fileUrlErr;
          }
        }
        return { ok: true, platformPostId: videoId };
      }
      // Text-only post
      const feedParams: Record<string, string> = {
        message: caption || ' ',
        access_token: pageToken,
      };
      const feedRes = await axiosInstance.post(
        `${facebookGraphBaseUrl}/${platformUserId}/feed`,
        null,
        { params: feedParams }
      );
      const postId = (feedRes.data as { id?: string })?.id;
      return { ok: true, platformPostId: postId };
    }

    if (platform === 'LINKEDIN') {
      const author = platformUserId.startsWith('urn:li:') ? platformUserId : `urn:li:person:${platformUserId}`;
      let postBody: {
        author: string;
        commentary: string;
        visibility: string;
        distribution: object;
        lifecycleState: string;
        isReshareDisabledByAuthor: boolean;
        content?: { media: { id: string; altText?: string; title?: string } };
      } = {
        author,
        commentary: caption || ' ',
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };
      if (firstImageUrl) {
        const { buffer, contentType } = await fetchImageBuffer(firstImageUrl, fetchFn);
        const initRes = await axiosInstance.post(
          'https://api.linkedin.com/rest/images?action=initializeUpload',
          { initializeUploadRequest: { owner: author } },
          {
            headers: {
              'Content-Type': 'application/json',
              ...linkedInRestCommunityHeaders(token),
            },
          }
        );
        const val = (initRes.data as { value?: { uploadUrl?: string; image?: string } })?.value;
        const uploadUrl = val?.uploadUrl;
        const imageUrn = val?.image;
        if (uploadUrl && imageUrn) {
          await axiosInstance.put(uploadUrl, buffer, {
            headers: {
              'Content-Type': contentType,
              Authorization: `Bearer ${token}`,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });
          postBody.content = { media: { id: imageUrn, altText: caption.slice(0, 120) || undefined } };
        }
      } else if (firstMediaUrl) {
        // Video upload: initialize -> PUT parts -> finalize -> create post with video URN
        const { buffer } = await fetchMediaBuffer(firstMediaUrl, fetchFn);
        const fileSizeBytes = buffer.length;
        const initRes = await axiosInstance.post(
          'https://api.linkedin.com/rest/videos?action=initializeUpload',
          {
            initializeUploadRequest: {
              owner: author,
              fileSizeBytes,
              uploadCaptions: false,
              uploadThumbnail: false,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...linkedInRestCommunityHeaders(token),
            },
          }
        );
        const val = (initRes.data as { value?: { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] } })?.value;
        const videoUrn = val?.video;
        const uploadToken = val?.uploadToken ?? '';
        const instructions = val?.uploadInstructions ?? [];
        if (!videoUrn || instructions.length === 0) {
          throw new Error(JSON.stringify(initRes.data ?? {}));
        }
        const uploadedPartIds: string[] = [];
        for (const part of instructions) {
          const chunk = buffer.subarray(part.firstByte, part.lastByte + 1);
          const putRes = await axiosInstance.put(part.uploadUrl, chunk, {
            headers: {
              'Content-Type': 'application/octet-stream',
              Authorization: `Bearer ${token}`,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
          });
          const etag = (putRes.headers as Record<string, string>)?.['etag'] ?? (putRes.headers as Record<string, string>)?.['ETag'];
          const partId = typeof etag === 'string' ? etag.replace(/^"|"$/g, '') : undefined;
          if (partId) uploadedPartIds.push(partId);
          if (putRes.status !== 200) {
            throw new Error(`LinkedIn video part upload failed: ${putRes.status}`);
          }
        }
        await axiosInstance.post(
          'https://api.linkedin.com/rest/videos?action=finalizeUpload',
          {
            finalizeUploadRequest: {
              video: videoUrn,
              uploadToken,
              uploadedPartIds,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...linkedInRestCommunityHeaders(token),
            },
          }
        );
        postBody.content = { media: { id: videoUrn, title: (caption || 'Video').slice(0, 200) } };
      }
      const postRes = await axiosInstance.post(
        'https://api.linkedin.com/rest/posts',
        postBody,
        {
          headers: {
            'Content-Type': 'application/json',
            ...linkedInRestCommunityHeaders(token),
          },
        }
      );
      const headers = (postRes.headers ?? {}) as Record<string, string>;
      const postUrn = headers['x-restli-id'] ?? (postRes.data as { id?: string })?.id;
      return { ok: true, platformPostId: typeof postUrn === 'string' ? postUrn : undefined };
    }

    if (platform === 'PINTEREST') {
      let boardId = pinterestBoardId?.trim() || '';
      if (!boardId) {
        // Fallback: fetch boards at publish time and use the first available board.
        try {
          const boardsRes = await axiosInstance.get(
            `${pinterestApiBase}/boards`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { page_size: 25 },
              validateStatus: () => true,
            }
          );
          if (boardsRes.status >= 200 && boardsRes.status < 300) {
            const boardsData = (boardsRes.data as { items?: Array<{ id?: string }> } | undefined);
            boardId = (boardsData?.items ?? []).find((b) => typeof b?.id === 'string')?.id ?? '';
          }
        } catch {
          // keep empty and return user-facing guidance below
        }
      }
      if (!boardId) {
        // If the account has no boards yet, create one and use it.
        try {
          const createBoardRes = await axiosInstance.post(
            `${pinterestApiBase}/boards`,
            { name: 'Agent4Socials Posts' },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              validateStatus: () => true,
            }
          );
          if (createBoardRes.status >= 200 && createBoardRes.status < 300) {
            const created = createBoardRes.data as { id?: string } | undefined;
            boardId = created?.id ?? '';
          }
        } catch {
          // keep empty and return clear error below
        }
      }
      if (!boardId) {
        return {
          ok: false,
          error:
            'No Pinterest board on file. Reconnect Pinterest so we can save a default board, or create a board on Pinterest first.',
        };
      }
      if (firstImageUrl) {
        const pinRes = await axiosInstance.post(
          `${pinterestApiBase}/pins`,
          {
            board_id: boardId,
            ...(caption?.trim() ? { description: caption.trim().slice(0, 800) } : {}),
            media_source: {
              source_type: 'image_url',
              url: firstImageUrl,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            validateStatus: () => true,
          }
        );
        if (pinRes.status < 200 || pinRes.status >= 300) {
          return {
            ok: false,
            error: `Pinterest image Pin failed (${pinRes.status}): ${pinterestApiErrorDetail(pinRes.status, pinRes.data)}`,
          };
        }
        const pinId = (pinRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: pinId };
      }

      if (firstMediaUrl) {
        // Pinterest video pins: register media -> upload binary to provided URL -> create pin from media_id.
        const mediaInitRes = await axiosInstance.post(
          `${pinterestApiBase}/media`,
          { media_type: 'video' },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            validateStatus: () => true,
          }
        );
        if (mediaInitRes.status < 200 || mediaInitRes.status >= 300) {
          return {
            ok: false,
            error: `Pinterest video register failed (${mediaInitRes.status}): ${pinterestApiErrorDetail(mediaInitRes.status, mediaInitRes.data)}`,
          };
        }

        const mediaInit = mediaInitRes.data as {
          media_id?: string;
          id?: string;
          upload_url?: string;
          upload_parameters?: Record<string, string>;
          data?: {
            media_id?: string;
            id?: string;
            upload_url?: string;
            upload_parameters?: Record<string, string>;
          };
        };
        const mediaId = mediaInit.media_id ?? mediaInit.id ?? mediaInit.data?.media_id ?? mediaInit.data?.id;
        const uploadUrl = mediaInit.upload_url ?? mediaInit.data?.upload_url;
        const uploadParams = mediaInit.upload_parameters ?? mediaInit.data?.upload_parameters ?? {};
        if (!mediaId || !uploadUrl) {
          throw new Error(`Pinterest media init did not return media_id/upload_url: ${JSON.stringify(mediaInit).slice(0, 300)}`);
        }

        const { buffer, contentType } = await fetchMediaBuffer(firstMediaUrl, fetchFn);
        const uploadForm = new FormData();
        Object.entries(uploadParams).forEach(([k, v]) => uploadForm.append(k, v));
        uploadForm.append('file', buffer, { filename: 'video.mp4', contentType: contentType || 'video/mp4' });
        const uploadRes = await axiosInstance.post(uploadUrl, uploadForm, {
          headers: uploadForm.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 120_000,
          validateStatus: () => true,
        });
        if (uploadRes.status < 200 || uploadRes.status >= 300) {
          return {
            ok: false,
            error: `Pinterest video binary upload failed (${uploadRes.status}): ${pinterestApiErrorDetail(uploadRes.status, uploadRes.data)}`,
          };
        }

        // Wait for Pinterest to finish processing uploaded media before creating a pin.
        const waitStart = Date.now();
        let mediaStatus: 'registered' | 'processing' | 'succeeded' | 'failed' | undefined;
        while (Date.now() - waitStart < 120_000) {
          const mediaRes = await axiosInstance.get(
            `${pinterestApiBase}/media/${mediaId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              validateStatus: () => true,
            }
          );
          if (mediaRes.status < 200 || mediaRes.status >= 300) {
            return {
              ok: false,
              error: `Pinterest media status HTTP ${mediaRes.status}: ${pinterestApiErrorDetail(mediaRes.status, mediaRes.data)}`,
            };
          }
          const mediaData = mediaRes.data as { status?: 'registered' | 'processing' | 'succeeded' | 'failed' } | undefined;
          mediaStatus = mediaData?.status;
          if (mediaStatus === 'succeeded') break;
          if (mediaStatus === 'failed') {
            return {
              ok: false,
              error: `Pinterest video processing failed: ${pinterestApiErrorDetail(mediaRes.status, mediaRes.data)}`,
            };
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (mediaStatus !== 'succeeded') {
          return { ok: false, error: 'Pinterest video is still processing. Please retry in a moment.' };
        }

        const payloadBase = {
          board_id: boardId,
          ...(caption?.trim() ? { description: caption.trim().slice(0, 800) } : {}),
        };
        // PinCreate.media_source is PinMediaSourceVideoID: cover fields belong INSIDE media_source, not on the pin root.
        const mediaSource: Record<string, unknown> = {
          source_type: 'video_id',
          media_id: mediaId,
        };
        const thumb = videoThumbnailUrl?.trim();
        if (thumb) {
          try {
            const { buffer, contentType } = await fetchImageBuffer(thumb, fetchFn);
            if (buffer.length > 0 && buffer.length <= PINTEREST_COVER_MAX_BYTES) {
              mediaSource.cover_image_data = buffer.toString('base64');
              mediaSource.cover_image_content_type = pinterestCoverContentTypeFromBuffer(contentType);
            } else {
              mediaSource.cover_image_url = thumb;
            }
          } catch {
            mediaSource.cover_image_url = thumb;
          }
        } else {
          mediaSource.cover_image_key_frame_time = 1;
        }
        const pinBody = {
          ...payloadBase,
          media_source: mediaSource,
        };
        const pinRes = await axiosInstance.post(`${pinterestApiBase}/pins`, pinBody, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          validateStatus: () => true,
        });
        if (pinRes.status < 200 || pinRes.status >= 300) {
          const ms = mediaSource as Record<string, unknown>;
          const coverMode = thumb
            ? ms.cover_image_data
              ? 'media_source.cover_image_data (base64)'
              : 'media_source.cover_image_url'
            : 'media_source.cover_image_key_frame_time';
          return {
            ok: false,
            error: `Pinterest video Pin failed (${pinRes.status}). Cover: ${coverMode}. ${pinterestApiErrorDetail(pinRes.status, pinRes.data)}`,
          };
        }
        const pinId = (pinRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: pinId };
      }

      return { ok: false, error: 'Pinterest requires image or video media for a Pin.' };
    }

    if (platform === 'TWITTER') {
      const text = caption.slice(0, 280) || ' ';
      let mediaIds: string[] = [];
      let mediaSkipped = false;
      const v1Url = 'https://upload.twitter.com/1.1/media/upload.json';
      const useOAuth1 = twitterOAuth1 && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;
      const getUploadHeaders = (method: string, requestUrl?: string) =>
        useOAuth1
          ? signTwitterRequest(method, requestUrl ?? v1Url, { key: twitterOAuth1!.accessToken, secret: twitterOAuth1!.accessTokenSecret })
          : { Authorization: `Bearer ${token}` };

      if (firstImageUrl) {
        try {
          const { buffer, contentType } = await fetchImageBuffer(firstImageUrl, fetchFn);
          const mediaCategory = 'tweet_image';
          if (useOAuth1) {
            const filename = contentType.includes('png') ? 'image.png' : 'image.jpg';
            const form = new FormData();
            form.append('media', buffer, { filename, contentType });
            form.append('media_category', mediaCategory);

            const contentLength = await new Promise<number>((resolve, reject) => {
              form.getLength((err: Error | null, length?: number) => (err ? reject(err) : resolve(length ?? 0)));
            });
            const formHeaders = { ...form.getHeaders(), 'Content-Length': String(contentLength) };

            const uploadRes = await axiosInstance.post(v1Url, form, {
              headers: { ...getUploadHeaders('POST'), ...formHeaders },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              timeout: 60_000,
              validateStatus: () => true,
            });

            if (uploadRes.status !== 200) {
              const errData = uploadRes.data as unknown;
              const errText = typeof errData === 'object' ? JSON.stringify(errData) : String(errData ?? uploadRes.status);
              if (uploadRes.status === 403) {
                if (typeof console !== 'undefined' && console.error) console.error('[Twitter media upload] 403:', errText.slice(0, 500));
                mediaSkipped = true;
              } else {
                throw new Error(`Twitter media upload failed: ${uploadRes.status} ${errText}`.slice(0, 300));
              }
            } else {
              const data = uploadRes.data as { media_id_string?: string; media_id?: number } | undefined;
              const mediaId = data?.media_id_string ?? (data?.media_id != null ? String(data.media_id) : undefined);
              if (mediaId) mediaIds = [mediaId];
            }
          } else {
            if (!token || token === 'oauth1') {
              return {
                ok: false,
                error:
                  'Twitter/X image upload needs a valid OAuth 2.0 user token, or reconnect with “Enable image upload” (OAuth 1.0a).',
              };
            }
            const { mediaType, filename } = twitterInitMediaTypeFromImageContentType(contentType);
            const v2Up = await twitterOAuth2ResumableMediaUpload(
              axiosInstance,
              token,
              buffer,
              mediaType,
              mediaCategory,
              filename
            );
            if (!v2Up.ok) {
              return {
                ok: false,
                error: `${v2Up.error} If this persists, add TWITTER_API_KEY / TWITTER_API_SECRET and reconnect X so media can use OAuth 1.0a on v1.1 upload.`,
              };
            }
            mediaIds = [v2Up.mediaId];
          }
        } catch (err) {
          throw err;
        }
      } else if (firstMediaUrl) {
        // Chunked video upload: INIT -> APPEND (per chunk) -> FINALIZE -> STATUS until processing complete
        try {
          if (!useOAuth1) {
            return {
              ok: false,
              error: 'Twitter/X video upload requires OAuth 1.0a media credentials. Reconnect X from Accounts and click "Enable image upload", then try again.',
            };
          }
          const { buffer } = await fetchMediaBuffer(firstMediaUrl, fetchFn);
          const totalBytes = buffer.length;
          const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB max per Twitter chunk
          const initForm = new FormData();
          initForm.append('command', 'INIT');
          initForm.append('total_bytes', String(totalBytes));
          initForm.append('media_type', 'video/mp4');
          initForm.append('media_category', 'tweet_video');

          const initRes = await axiosInstance.post(v1Url, initForm, {
            headers: { ...getUploadHeaders('POST'), ...initForm.getHeaders() },
            timeout: 30_000,
            validateStatus: () => true,
          });
          const initOk = initRes.status === 200 || initRes.status === 202;
          if (!initOk) {
            if (initRes.status === 403) {
              if (typeof console !== 'undefined' && console.error) console.error('[Twitter video INIT] 403:', JSON.stringify(initRes.data).slice(0, 300));
              return {
                ok: false,
                error: 'Twitter/X rejected video upload (403). Enable media upload for this account in Dashboard -> Accounts, then reconnect and retry.',
              };
            } else {
              throw new Error(`Twitter video INIT failed: ${initRes.status} ${JSON.stringify(initRes.data)}`);
            }
          }
          const mediaId = initOk ? (initRes.data as { media_id_string?: string })?.media_id_string : undefined;
          if (!mediaId && !mediaSkipped) throw new Error('Twitter INIT did not return media_id_string');
          if (!mediaId) {
            // 403 or no media_id: post text only
          } else {

          let segmentIndex = 0;
          for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE, segmentIndex++) {
            const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, totalBytes));
            const appendForm = new FormData();
            appendForm.append('command', 'APPEND');
            appendForm.append('media_id', mediaId);
            appendForm.append('segment_index', String(segmentIndex));
            appendForm.append('media', Buffer.from(chunk), { filename: 'video.mp4', contentType: 'video/mp4' });

            const appendRes = await axiosInstance.post(v1Url, appendForm, {
              headers: { ...getUploadHeaders('POST'), ...appendForm.getHeaders() },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: 60_000,
              validateStatus: () => true,
            });
            if (appendRes.status !== 204) {
              throw new Error(`Twitter video APPEND failed: ${appendRes.status}`);
            }
          }

          const finalizeForm = new FormData();
          finalizeForm.append('command', 'FINALIZE');
          finalizeForm.append('media_id', mediaId);
          const finalizeRes = await axiosInstance.post(v1Url, finalizeForm, {
            headers: { ...getUploadHeaders('POST'), ...finalizeForm.getHeaders() },
            timeout: 30_000,
            validateStatus: () => true,
          });
          if (finalizeRes.status !== 200) {
            throw new Error(`Twitter video FINALIZE failed: ${finalizeRes.status}`);
          }

          // Poll STATUS until processing is complete (succeeded or failed)
          const statusUrl = `${v1Url}?command=STATUS&media_id=${mediaId}`;
          for (let wait = 0; wait < 120_000; wait += 3000) {
            await new Promise((r) => setTimeout(r, 3000));
            const statusRes = await axiosInstance.get(statusUrl, {
              headers: getUploadHeaders('GET', statusUrl),
              timeout: 10_000,
              validateStatus: () => true,
            });
            const proc = (statusRes.data as { processing_info?: { state?: string } })?.processing_info;
            const state = proc?.state;
            if (state === 'succeeded') {
              mediaIds = [mediaId];
              break;
            }
            if (state === 'failed') {
              throw new Error('Twitter video processing failed');
            }
          }
          if (mediaIds.length === 0) {
            throw new Error('Twitter video processing timed out');
          }
          }
        } catch (err) {
          throw err;
        }
      }

      const tweetBody = mediaIds.length > 0 ? { text, media: { media_ids: mediaIds } } : { text };
      const tweetRes = await axiosInstance.post(
        'https://api.twitter.com/2/tweets',
        tweetBody,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15_000 }
      );
      const tweetId = (tweetRes.data as { data?: { id?: string } })?.data?.id;
      return { ok: true, platformPostId: tweetId, ...(mediaSkipped ? { mediaSkipped: true } : {}) };
    }

    if (platform === 'YOUTUBE') {
      const videoUrl = firstMediaUrl || firstImageUrl;
      if (!videoUrl) {
        return { ok: false, error: 'YouTube: a video file is required to publish.' };
      }

      // Derive title (first line up to 100 chars) and description from caption
      const lines = caption.split('\n');
      const title = (lines[0] || 'Untitled').slice(0, 100);
      const description = caption.slice(0, 5000);

      // Step 1: Initiate a resumable upload session
      const initRes = await deps.axios.post(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          snippet: {
            title,
            description,
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: 'public',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'video/mp4',
          },
          validateStatus: () => true,
        }
      );

      if (initRes.status !== 200) {
        const errMsg = initRes.data?.error?.message ?? JSON.stringify(initRes.data);
        return { ok: false, error: `YouTube upload init failed (${initRes.status}): ${errMsg}`.slice(0, 500) };
      }

      const uploadUri: string = initRes.headers?.location;
      if (!uploadUri) {
        return { ok: false, error: 'YouTube upload init did not return an upload URI.' };
      }

      // Step 2: Fetch the video buffer and upload it
      const { buffer, contentType } = await fetchMediaBuffer(videoUrl, deps.fetch);

      const uploadRes = await deps.axios.put(uploadUri, buffer, {
        headers: {
          'Content-Type': contentType || 'video/mp4',
          'Content-Length': buffer.length,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300_000, // 5 minutes
        validateStatus: () => true,
      });

      if (uploadRes.status === 200 || uploadRes.status === 201) {
        const videoId = (uploadRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: videoId };
      }

      // 308 Resume Incomplete is unexpected here but handle gracefully
      const uploadErrMsg = (uploadRes.data as { error?: { message?: string } })?.error?.message ?? JSON.stringify(uploadRes.data);
      return { ok: false, error: `YouTube upload failed (${uploadRes.status}): ${uploadErrMsg}`.slice(0, 500) };
    }

    if (platform === 'TIKTOK') {
      const videoUrl = firstMediaUrl;
      if (!videoUrl) {
        return { ok: false, error: 'TikTok requires a video file to publish.' };
      }
      const tiktokBase = 'https://open.tiktokapis.com';
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      };
      const isRetryableTikTokInternal = (err?: { code?: string; message?: string }): boolean => {
        if (!err) return false;
        const code = (err.code ?? '').toLowerCase();
        const msg = (err.message ?? '').toLowerCase();
        return code === 'internal' || code === 'internal_error' || msg.includes('internal');
      };
      const tiktokPostWithRetry = async (
        url: string,
        payload: unknown,
        timeoutMs: number,
        label: string
      ): Promise<{ data?: { data?: Record<string, unknown>; error?: { code?: string; message?: string } } }> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await axiosInstance.post(url, payload, { headers, timeout: timeoutMs, validateStatus: () => true }) as { data?: { data?: Record<string, unknown>; error?: { code?: string; message?: string } } };
          const err = res.data?.error;
          if (!isRetryableTikTokInternal(err) || attempt === 2) return res;
          const waitMs = 1200 * (attempt + 1);
          console.log(`[TikTok] ${label} retrying after internal error`, { attempt: attempt + 1, error: err, waitMs });
          await new Promise((r) => setTimeout(r, waitMs));
        }
        return { data: { error: { code: 'internal', message: 'internal' } } };
      };

      if (!options.tiktokDirectPost) {
        return {
          ok: false,
          error:
            'TikTok requires Post to TikTok settings (visibility, consent, and commercial disclosure). Open the post in the composer, complete the TikTok step, then save or publish again.',
        };
      }

      const creatorRes = await axiosInstance.post(
        `${tiktokBase}/v2/post/publish/creator_info/query/`,
        {},
        { headers, timeout: 12_000, validateStatus: () => true }
      );
      const parsedCi = parseTikTokCreatorInfoResponse(creatorRes.data);
      if (!parsedCi.ok) {
        return { ok: false, error: parsedCi.error.slice(0, 300) };
      }
      const creatorPrivacyOptions = parsedCi.data.privacy_level_options ?? [];

      const payloadForTikTok: TikTokDirectPostPayload = {
        ...options.tiktokDirectPost,
        title: (options.tiktokDirectPost.title || caption || '').trim().slice(0, 2200),
      };
      const builtPi = buildTikTokPostInfoFromPayload(payloadForTikTok, parsedCi.data);
      if ('error' in builtPi) {
        return { ok: false, error: `TikTok: ${builtPi.error}`.slice(0, 350) };
      }
      const tikTokPostInfo: Record<string, unknown> = { ...builtPi.post_info };
      const creatorUsername = parsedCi.data.creator_username;
      const creatorNickname = parsedCi.data.creator_nickname;
      const tiktokIdentity = creatorUsername ? `@${creatorUsername}` : creatorNickname ? creatorNickname : '';

      const tikTokPostInfoSelfOnly = creatorPrivacyOptions.includes('SELF_ONLY')
        ? ({ ...tikTokPostInfo, privacy_level: 'SELF_ONLY' } as Record<string, unknown>)
        : null;

      const inboxFileUploadInit = async (): Promise<{ publishId: string }> => {
        const { buffer, contentType } = await fetchMediaBuffer(videoUrl, fetchFn);
        const videoSize = buffer.length;
        const { chunkSize, totalChunkCount } = tiktokFileUploadChunkPlan(videoSize);
        const mimeType = contentType && /video\/(mp4|webm|quicktime)/i.test(contentType) ? contentType : 'video/mp4';
        const inboxInitRes = await tiktokPostWithRetry(
          `${tiktokBase}/v2/post/publish/inbox/video/init/`,
          {
            post_info: tikTokPostInfo,
            source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
          },
          30_000,
          'internal fallback inbox FILE_UPLOAD init'
        ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
        const inboxInitBody = inboxInitRes.data ?? {};
        const inboxInitErr = inboxInitBody.error;
        console.log('[TikTok] internal fallback inbox FILE_UPLOAD init response', { error: inboxInitErr, publishId: inboxInitBody.data?.publish_id });
        if (inboxInitErr && inboxInitErr.code !== 'ok') {
          throw new Error(`TikTok: ${inboxInitErr.message || inboxInitErr.code || 'Init failed'}`.slice(0, 300));
        }
        const nextPublishId = inboxInitBody.data?.publish_id;
        const uploadUrl = inboxInitBody.data?.upload_url;
        if (!nextPublishId || !uploadUrl) {
          throw new Error('TikTok inbox FILE_UPLOAD init did not return publish_id or upload_url.');
        }
        for (let off = 0; off < videoSize; off += chunkSize) {
          const end = Math.min(off + chunkSize, videoSize);
          const chunk = buffer.subarray(off, end);
          const putRes = await fetchFn(uploadUrl, {
            method: 'PUT',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: chunk as any,
            headers: { 'Content-Type': mimeType, 'Content-Range': `bytes ${off}-${end - 1}/${videoSize}` },
            signal: AbortSignal.timeout(120_000),
          });
          if (putRes.status !== 200 && putRes.status !== 201 && putRes.status !== 206) {
            const errText = await putRes.text().catch(() => `status ${putRes.status}`);
            throw new Error(`TikTok upload: ${putRes.status} ${errText}`.slice(0, 300));
          }
        }
        return { publishId: nextPublishId };
      };

      // 2) Try PULL_FROM_URL first (TikTok fetches video from our serve URL — fastest path).
      //    Falls back to FILE_UPLOAD (chunked PUT) if URL ownership is not verified.
      let useInbox = false;
      let publishId: string | undefined;

      console.log('[TikTok] Starting PULL_FROM_URL init', { videoUrl: videoUrl?.slice(0, 120) });
      const pullInitRes = await tiktokPostWithRetry(
        `${tiktokBase}/v2/post/publish/video/init/`,
        {
          post_info: tikTokPostInfo,
          source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
        },
        30_000,
        'direct PULL_FROM_URL init'
      ) as { data?: { data?: { publish_id?: string }; error?: { code?: string; message?: string } } };
      const pullBody = pullInitRes.data ?? {};
      const pullErr = pullBody.error;

      const urlOwnershipError = pullErr && (
        pullErr.code === 'url_ownership_unverified' ||
        (pullErr.message ?? '').toLowerCase().includes('ownership')
      );
      const scopeError = pullErr && (
        pullErr.code === 'scope_not_authorized' ||
        pullErr.code === 'access_token_invalid' ||
        pullErr.code === 'unaudited_client_can_only_post_to_private_accounts'
      );

      console.log('[TikTok] PULL_FROM_URL init response', { error: pullErr, publishId: pullBody.data?.publish_id });

      if (!pullErr || pullErr.code === 'ok') {
        // PULL_FROM_URL succeeded
        publishId = pullBody.data?.publish_id;
      } else if (pullErr.code === 'unaudited_client_can_only_post_to_private_accounts') {
        // Unaudited apps: prefer inbox endpoints directly.
        useInbox = true;
        console.log('[TikTok] Unaudited app — trying inbox init flow');

        // First try inbox PULL_FROM_URL (no upload required if accepted).
        const uaInboxPullRes = await tiktokPostWithRetry(
          `${tiktokBase}/v2/post/publish/inbox/video/init/`,
          { post_info: tikTokPostInfo, source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } },
          30_000,
          'inbox PULL_FROM_URL init'
        ) as { data?: { data?: { publish_id?: string }; error?: { code?: string; message?: string } } };
        const uaInboxPullBody = uaInboxPullRes.data ?? {};
        const uaInboxPullErr = uaInboxPullBody.error;
        console.log('[TikTok] inbox PULL_FROM_URL init response', { error: uaInboxPullErr, publishId: uaInboxPullBody.data?.publish_id });
        if (!uaInboxPullErr || uaInboxPullErr.code === 'ok') {
          publishId = uaInboxPullBody.data?.publish_id;
        } else if (uaInboxPullErr.code === 'spam_risk_too_many_pending_share') {
          return {
            ok: false,
            error:
              `TikTok sandbox${tiktokIdentity ? ` (${tiktokIdentity})` : ''}: too many pending posts. Open TikTok mobile app on the SAME connected account, check Inbox and Drafts, then accept or delete all pending items and retry.`,
          };
        } else {
          // Fallback to inbox FILE_UPLOAD when URL pull is not allowed/available.
          const { buffer: unauditedBuf, contentType: unauditedCt } = await fetchMediaBuffer(videoUrl, fetchFn);
          const unauditedSize = unauditedBuf.length;
          const { chunkSize: unauditedChunk, totalChunkCount: unauditedChunkCount } = tiktokFileUploadChunkPlan(unauditedSize);
          const unauditedMime = unauditedCt && /video\/(mp4|webm|quicktime)/i.test(unauditedCt) ? unauditedCt : 'video/mp4';

          const uaInboxFileInitRes = await tiktokPostWithRetry(
            `${tiktokBase}/v2/post/publish/inbox/video/init/`,
            {
              post_info: tikTokPostInfo,
              source_info: {
                source: 'FILE_UPLOAD',
                video_size: unauditedSize,
                chunk_size: unauditedChunk,
                total_chunk_count: unauditedChunkCount,
              },
            },
            30_000,
            'inbox FILE_UPLOAD init'
          ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
          const uaInboxFileBody = uaInboxFileInitRes.data ?? {};
          const uaInboxFileErr = uaInboxFileBody.error;
          console.log('[TikTok] inbox FILE_UPLOAD init response', { error: uaInboxFileErr, publishId: uaInboxFileBody.data?.publish_id });
          if (uaInboxFileErr && uaInboxFileErr.code !== 'ok') {
            if (uaInboxFileErr.code === 'spam_risk_too_many_pending_share') {
              return {
                ok: false,
                error:
                  `TikTok sandbox${tiktokIdentity ? ` (${tiktokIdentity})` : ''}: too many pending posts. Open TikTok mobile app on the SAME connected account, check Inbox and Drafts, then accept or delete all pending items and retry.`,
              };
            }
            return { ok: false, error: `TikTok: ${uaInboxFileErr.message || uaInboxFileErr.code || 'Init failed'}`.slice(0, 300) };
          }
          publishId = uaInboxFileBody.data?.publish_id;
          const uaUploadUrl = uaInboxFileBody.data?.upload_url;
          if (!publishId || !uaUploadUrl) {
            return { ok: false, error: 'TikTok inbox init did not return publish_id or upload_url.' };
          }
          for (let off = 0; off < unauditedSize; off += unauditedChunk) {
            const end = Math.min(off + unauditedChunk, unauditedSize);
            const chunk = unauditedBuf.subarray(off, end);
            const putRes = await fetchFn(uaUploadUrl, {
              method: 'PUT',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              body: chunk as any,
              headers: { 'Content-Type': unauditedMime, 'Content-Range': `bytes ${off}-${end - 1}/${unauditedSize}` },
              signal: AbortSignal.timeout(120_000),
            });
            if (putRes.status !== 200 && putRes.status !== 201 && putRes.status !== 206) {
              const errText = await putRes.text().catch(() => `status ${putRes.status}`);
              return { ok: false, error: `TikTok upload: ${putRes.status} ${errText}`.slice(0, 300) };
            }
          }
        }
      } else if (pullErr && (pullErr.code === 'scope_not_authorized' || pullErr.code === 'access_token_invalid')) {
        // video.publish scope missing — try inbox via PULL_FROM_URL
        useInbox = true;
        const inboxPullRes = await tiktokPostWithRetry(
          `${tiktokBase}/v2/post/publish/inbox/video/init/`,
          { post_info: tikTokPostInfo, source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } },
          30_000,
          'scope fallback inbox PULL_FROM_URL init'
        ) as { data?: { data?: { publish_id?: string }; error?: { code?: string; message?: string } } };
        const inboxPullBody = inboxPullRes.data ?? {};
        const inboxPullErr = inboxPullBody.error;
        if (!inboxPullErr || inboxPullErr.code === 'ok') {
          publishId = inboxPullBody.data?.publish_id;
        } else if ((inboxPullErr.message ?? '').toLowerCase().includes('ownership') || inboxPullErr.code === 'url_ownership_unverified') {
          // Fall through to FILE_UPLOAD below
        } else {
          return { ok: false, error: `TikTok: ${inboxPullErr.message || inboxPullErr.code || 'Init failed'}`.slice(0, 300) };
        }
      } else if (pullErr && pullErr.code === 'spam_risk_too_many_pending_share') {
        // TikTok's pending-post limit hit from previous failed attempts.
        // For sandbox: open TikTok app with the test account → Inbox → accept/delete all pending posts, then retry.
        return {
          ok: false,
          error:
            `TikTok sandbox${tiktokIdentity ? ` (${tiktokIdentity})` : ''}: too many pending posts. Open TikTok mobile app on the SAME connected account, check Inbox and Drafts, then accept or delete all pending items and retry.`,
        };
      } else if (!urlOwnershipError) {
        // Some other error from TikTok
        return { ok: false, error: `TikTok: ${pullErr.message || pullErr.code || 'Init failed'}`.slice(0, 300) };
      }

      // 3) FILE_UPLOAD fallback when PULL_FROM_URL is blocked by URL ownership verification.
      //    Uses native fetch (not axios) to reliably send raw binary.
      if (!publishId) {
        const { buffer, contentType: videoContentType } = await fetchMediaBuffer(videoUrl, fetchFn);
        const videoSize = buffer.length;
        const { chunkSize: CHUNK_SIZE, totalChunkCount } = tiktokFileUploadChunkPlan(videoSize);
        const mimeType = videoContentType && /video\/(mp4|webm|quicktime)/i.test(videoContentType) ? videoContentType : 'video/mp4';

        const fileInitRes = await tiktokPostWithRetry(
          `${tiktokBase}/v2/post/publish/video/init/`,
          {
            post_info: tikTokPostInfo,
            source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: CHUNK_SIZE, total_chunk_count: totalChunkCount },
          },
          30_000,
          'direct FILE_UPLOAD init'
        ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
        let fileInitBody = fileInitRes.data ?? {};
        let fileInitErr = fileInitBody.error;

        if (fileInitErr && fileInitErr.code === 'unaudited_client_can_only_post_to_private_accounts') {
          // Retry with SELF_ONLY privacy
          console.log('[TikTok] FILE_UPLOAD fallback: retrying with SELF_ONLY');
          if (!tikTokPostInfoSelfOnly) {
            return {
              ok: false,
              error:
                'TikTok requires private posting for this app, but Only me is not available for this account. Check TikTok settings or reconnect.',
            };
          }
          const selfFileRes = await tiktokPostWithRetry(
            `${tiktokBase}/v2/post/publish/video/init/`,
            {
              post_info: tikTokPostInfoSelfOnly,
              source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: CHUNK_SIZE, total_chunk_count: totalChunkCount },
            },
            30_000,
            'direct FILE_UPLOAD SELF_ONLY init'
          ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
          fileInitBody = selfFileRes.data ?? {};
          fileInitErr = fileInitBody.error;
        } else if (fileInitErr && (fileInitErr.code === 'scope_not_authorized' || fileInitErr.code === 'access_token_invalid')) {
          useInbox = true;
          const inboxFileRes = await tiktokPostWithRetry(
            `${tiktokBase}/v2/post/publish/inbox/video/init/`,
            {
              post_info: tikTokPostInfo,
              source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: CHUNK_SIZE, total_chunk_count: totalChunkCount },
            },
            30_000,
            'scope fallback inbox FILE_UPLOAD init'
          ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
          fileInitBody = inboxFileRes.data ?? {};
          fileInitErr = fileInitBody.error;
        }
        if (fileInitErr && fileInitErr.code !== 'ok') {
          return { ok: false, error: `TikTok: ${fileInitErr.message || fileInitErr.code || 'Init failed'}`.slice(0, 300) };
        }
        publishId = fileInitBody.data?.publish_id;
        const uploadUrl = fileInitBody.data?.upload_url;
        if (!publishId || !uploadUrl) {
          return { ok: false, error: 'TikTok init did not return publish_id or upload_url.' };
        }

        // Upload chunks using native fetch (avoids axios binary-serialisation issues)
        for (let offset = 0; offset < videoSize; offset += CHUNK_SIZE) {
          const end = Math.min(offset + CHUNK_SIZE, videoSize);
          const chunk = buffer.subarray(offset, end);
          const putRes = await fetchFn(uploadUrl, {
            method: 'PUT',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: chunk as any,
            headers: {
              'Content-Type': mimeType,
              'Content-Range': `bytes ${offset}-${end - 1}/${videoSize}`,
            },
            signal: AbortSignal.timeout(120_000),
          });
          // 200, 201, or 206 (partial) are all success
          if (putRes.status !== 200 && putRes.status !== 201 && putRes.status !== 206) {
            const errText = await putRes.text().catch(() => `status ${putRes.status}`);
            return { ok: false, error: `TikTok upload: ${putRes.status} ${errText}`.slice(0, 300) };
          }
        }
      }

      if (!publishId) {
        return { ok: false, error: 'TikTok: could not obtain publish_id.' };
      }

      // 5) Poll status.
      // PULL_FROM_URL is async: TikTok fetches the video in the background — we do a few quick
      // checks to catch immediate failures, then return sentToInbox if still processing.
      // FILE_UPLOAD is synchronous so we poll longer.
      // Poll longer for FILE_UPLOAD (TikTok processes synchronously after upload)
      // and shorter for PULL_FROM_URL (async — TikTok fetches on its own schedule).
      const isPullFromUrl = !useInbox && !publishId.startsWith('v_inbox') && !publishId.startsWith('inbox');
      const maxWait = isPullFromUrl ? 12_000 : 120_000;
      const pollInterval = isPullFromUrl ? 2_000 : 3_000;
      let platformPostId: string | undefined;
      let retriedAfterInternalFailure = false;
      for (let elapsed = 0; elapsed < maxWait; elapsed += pollInterval) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const statusRes = await tiktokPostWithRetry(
          `${tiktokBase}/v2/post/publish/status/fetch/`,
          { publish_id: publishId },
          10_000,
          'status fetch'
        ) as { data?: { data?: { status?: string; fail_reason?: string; publicly_available_post_id?: string }; error?: { code?: string; message?: string } } };
        const statusBody = statusRes.data ?? {};
        const statusErr = statusBody.error;
        if (statusErr && statusErr.code !== 'ok') {
          return { ok: false, error: `TikTok status: ${statusErr.message || statusErr.code}`.slice(0, 300) };
        }
        const status = statusBody.data?.status;
        console.log('[TikTok] status poll', { publishId, status, fail_reason: statusBody.data?.fail_reason, error: statusErr });
        if (status === 'PUBLISH_COMPLETE') {
          platformPostId = statusBody.data?.publicly_available_post_id;
          break;
        }
        // TikTok accepted the video but queued it in the creator's inbox
        // (happens when the app hasn't passed Content Posting API audit)
        if (status === 'SEND_TO_USER_INBOX') {
          return { ok: true, platformPostId: publishId, sentToInbox: true };
        }
        if (status === 'FAILED') {
          const reason = statusBody.data?.fail_reason ?? 'Publish failed';
          if (
            reason.toLowerCase() === 'internal' &&
            !retriedAfterInternalFailure &&
            (publishId.startsWith('v_inbox_url') || publishId.startsWith('inbox'))
          ) {
            try {
              const fallback = await inboxFileUploadInit();
              publishId = fallback.publishId;
              retriedAfterInternalFailure = true;
              elapsed = -pollInterval; // restart polling window for fallback publish_id
              continue;
            } catch (e) {
              return { ok: false, error: (e as Error).message.slice(0, 300) };
            }
          }
          return { ok: false, error: `TikTok: ${reason}`.slice(0, 300) };
        }
        // status === 'PROCESSING_UPLOAD' or 'PROCESSING_DOWNLOAD' — keep polling
      }
      if (!platformPostId) {
        return {
          ok: false,
          error: `TikTok upload is still processing and was not confirmed yet (publish_id: ${publishId}). Open TikTok app -> Inbox/Drafts, then retry in a minute if it is not visible.`,
        };
      }
      return { ok: true, platformPostId };
    }

    return { ok: false, error: `Publish not implemented for ${platform}` };
  } catch (err: unknown) {
    const ax = err as { response?: { data?: unknown; status?: number }; message?: string };
    let message: string;
    if (ax?.response?.data != null && typeof ax.response.data === 'object') {
      const data = ax.response.data as { error?: { message?: string; code?: number; error_user_msg?: string; error_user_title?: string } };
      const metaMsg = data?.error?.message;
      if (typeof metaMsg === 'string' && metaMsg.length > 0) {
        message = metaMsg;
        const code = data.error?.code;
        if (code === 2207082 || code === 2207076 || message.includes('2207082') || message.includes('2207076')) {
          message += ' Try JPEG instead of PNG, under 8MB, or ensure the URL is publicly accessible (HTTPS).';
        }
        if (process.env.NODE_ENV !== 'test') {
          console.error('[Publish] Meta API error:', JSON.stringify(data.error));
        }
      } else {
        message = JSON.stringify(ax.response.data);
      }
    } else {
      message = (err as Error)?.message || 'Unknown error';
    }
    return { ok: false, error: message.slice(0, 500) };
  }
}
