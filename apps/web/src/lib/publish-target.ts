/**
 * Publish a single target to a platform (external API calls only).
 * Used by the publish route and by tests to verify image upload + post flow.
 */

import FormData from 'form-data';
import { signTwitterRequest } from './twitter-oauth1';

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
  /** When set, Twitter v1.1 media upload uses OAuth 1.0a (avoids 403). Tweet creation still uses token (OAuth 2.0). */
  twitterOAuth1?: { accessToken: string; accessTokenSecret: string };
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

export async function publishTarget(
  options: PublishTargetOptions,
  deps: PublishDeps
): Promise<PublishTargetResult> {
  const { platform, token, platformUserId, caption, firstImageUrl, firstMediaUrl, imageUrls, videoThumbnailUrl, twitterOAuth1 } = options;
  const { fetch: fetchFn, axios: axiosInstance } = deps;

  /** Poll Instagram container until status_code is FINISHED or ERROR. Required before media_publish. */
  async function waitForInstagramContainer(containerId: string, token: string, maxWaitMs = 90_000): Promise<{ ok: boolean; error?: string }> {
    const intervalMs = 2000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const statusRes = await axiosInstance.get(
          `https://graph.facebook.com/v18.0/${containerId}`,
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
      if (firstMediaUrl) {
        // Reel: Resumable upload (more reliable than video_url; video_url often fails with 2207076)
        const containerRes = await axiosInstance.post(
          `https://graph.facebook.com/v18.0/${platformUserId}/media`,
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
          `https://graph.facebook.com/v18.0/${platformUserId}/media_publish`,
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
            `https://graph.facebook.com/v18.0/${platformUserId}/media`,
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
          `https://graph.facebook.com/v18.0/${platformUserId}/media`,
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
          `https://graph.facebook.com/v18.0/${platformUserId}/media_publish`,
          null,
          { params: { creation_id: creationId, access_token: token } }
        );
        const mediaId = (publishRes.data as { id?: string })?.id;
        return { ok: true, platformPostId: mediaId };
      }
      const containerRes = await axiosInstance.post(
        `https://graph.facebook.com/v18.0/${platformUserId}/media`,
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
        `https://graph.facebook.com/v18.0/${platformUserId}/media_publish`,
        null,
        { params: { creation_id: creationId, access_token: token } }
      );
      const mediaId = (publishRes.data as { id?: string })?.id;
      return { ok: true, platformPostId: mediaId };
    }

    if (platform === 'FACEBOOK') {
      let pageToken = token;
      try {
        const pagesRes = await axiosInstance.get(
          'https://graph.facebook.com/v18.0/me/accounts',
          { params: { fields: 'id,access_token', access_token: token } }
        );
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
          `https://graph.facebook.com/v18.0/${platformUserId}/photos`,
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
            `https://graph-video.facebook.com/v18.0/${platformUserId}/videos`,
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
                `https://graph-video.facebook.com/v18.0/${platformUserId}/videos`,
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
        `https://graph.facebook.com/v18.0/${platformUserId}/feed`,
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
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'Linkedin-Version': '202602',
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
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'Linkedin-Version': '202602',
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
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'Linkedin-Version': '202602',
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
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'Linkedin-Version': '202602',
          },
        }
      );
      const headers = (postRes.headers ?? {}) as Record<string, string>;
      const postUrn = headers['x-restli-id'] ?? (postRes.data as { id?: string })?.id;
      return { ok: true, platformPostId: typeof postUrn === 'string' ? postUrn : undefined };
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
        } catch (err) {
          throw err;
        }
      } else if (firstMediaUrl) {
        // Chunked video upload: INIT -> APPEND (per chunk) -> FINALIZE -> STATUS until processing complete
        try {
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
              mediaSkipped = true;
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

      // 1) Creator info to get allowed privacy_level.
      //    This call is optional — if it times out or fails we continue with a safe default.
      let privacyLevel = 'PUBLIC_TO_EVERYONE';
      try {
        const creatorRes = await axiosInstance.post(
          `${tiktokBase}/v2/post/publish/creator_info/query/`,
          {},
          { headers, timeout: 10_000, validateStatus: () => true }
        ) as { data?: { data?: { privacy_level_options?: string[] }; error?: { code?: string; message?: string } } };
        const body = creatorRes.data ?? {};
        const options = body.data?.privacy_level_options;
        if (Array.isArray(options) && options.length > 0) {
          privacyLevel = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0];
        }
      } catch {
        // creator_info timed out or errored; continue with default privacy level
      }

      // 2) Try PULL_FROM_URL first (TikTok fetches video from our serve URL — fastest path).
      //    Falls back to FILE_UPLOAD (chunked PUT) if URL ownership is not verified.
      let useInbox = false;
      let publishId: string | undefined;

      const pullInitRes = await axiosInstance.post(
        `${tiktokBase}/v2/post/publish/video/init/`,
        {
          post_info: {
            title: caption.slice(0, 2200) || undefined,
            privacy_level: privacyLevel,
            brand_content_toggle: false,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
        },
        { headers, timeout: 30_000, validateStatus: () => true }
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

      if (!pullErr || pullErr.code === 'ok') {
        // PULL_FROM_URL succeeded
        publishId = pullBody.data?.publish_id;
      } else if (scopeError) {
        // video.publish scope missing — try inbox via PULL_FROM_URL
        useInbox = true;
        const inboxPullRes = await axiosInstance.post(
          `${tiktokBase}/v2/post/publish/inbox/video/init/`,
          { source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } },
          { headers, timeout: 30_000, validateStatus: () => true }
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
        // TikTok's pending-post limit hit from previous failed attempts — do not retry.
        return { ok: false, error: 'TikTok: spam_risk_too_many_pending_share' };
      } else if (!urlOwnershipError) {
        // Some other error from TikTok
        return { ok: false, error: `TikTok: ${pullErr.message || pullErr.code || 'Init failed'}`.slice(0, 300) };
      }

      // 3) FILE_UPLOAD fallback when PULL_FROM_URL is blocked by URL ownership verification.
      //    Uses native fetch (not axios) to reliably send raw binary.
      if (!publishId) {
        const { buffer, contentType: videoContentType } = await fetchMediaBuffer(videoUrl, fetchFn);
        const videoSize = buffer.length;
        const MAX_CHUNK = 10 * 1024 * 1024;
        const CHUNK_SIZE = Math.min(MAX_CHUNK, videoSize);
        const totalChunkCount = Math.ceil(videoSize / CHUNK_SIZE);
        const mimeType = videoContentType && /video\/(mp4|webm|quicktime)/i.test(videoContentType) ? videoContentType : 'video/mp4';

        const fileInitRes = await axiosInstance.post(
          `${tiktokBase}/v2/post/publish/video/init/`,
          {
            post_info: {
              title: caption.slice(0, 2200) || undefined,
              privacy_level: privacyLevel,
              brand_content_toggle: false,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
            },
            source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: CHUNK_SIZE, total_chunk_count: totalChunkCount },
          },
          { headers, timeout: 30_000, validateStatus: () => true }
        ) as { data?: { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } } };
        let fileInitBody = fileInitRes.data ?? {};
        let fileInitErr = fileInitBody.error;

        if (fileInitErr && (fileInitErr.code === 'scope_not_authorized' || fileInitErr.code === 'access_token_invalid' || fileInitErr.code === 'unaudited_client_can_only_post_to_private_accounts')) {
          useInbox = true;
          const inboxFileRes = await axiosInstance.post(
            `${tiktokBase}/v2/post/publish/inbox/video/init/`,
            { source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: CHUNK_SIZE, total_chunk_count: totalChunkCount } },
            { headers, timeout: 30_000, validateStatus: () => true }
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
      const isPullFromUrl = !useInbox && !publishId.startsWith('inbox'); // rough heuristic
      const maxWait = isPullFromUrl ? 6_000 : 60_000;   // 6s for pull, 60s for upload
      const pollInterval = isPullFromUrl ? 1_500 : 3_000;
      let platformPostId: string | undefined;
      for (let elapsed = 0; elapsed < maxWait; elapsed += pollInterval) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const statusRes = await axiosInstance.post(
          `${tiktokBase}/v2/post/publish/status/fetch/`,
          { publish_id: publishId },
          { headers, timeout: 10_000, validateStatus: () => true }
        ) as { data?: { data?: { status?: string; fail_reason?: string; publicly_available_post_id?: string }; error?: { code?: string; message?: string } } };
        const statusBody = statusRes.data ?? {};
        const statusErr = statusBody.error;
        if (statusErr && statusErr.code !== 'ok') {
          return { ok: false, error: `TikTok status: ${statusErr.message || statusErr.code}`.slice(0, 300) };
        }
        const status = statusBody.data?.status;
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
          return { ok: false, error: `TikTok: ${reason}`.slice(0, 300) };
        }
        // status === 'PROCESSING_UPLOAD' or 'PROCESSING_DOWNLOAD' — keep polling
      }
      if (!platformPostId) {
        // Still processing after poll window — TikTok will complete async; check TikTok app
        return { ok: true, platformPostId: publishId, sentToInbox: true };
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
