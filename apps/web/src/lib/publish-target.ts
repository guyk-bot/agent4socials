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
  /** When set, Twitter v1.1 media upload uses OAuth 1.0a (avoids 403). Tweet creation still uses token (OAuth 2.0). */
  twitterOAuth1?: { accessToken: string; accessTokenSecret: string };
};

export type PublishTargetResult = {
  ok: boolean;
  platformPostId?: string;
  error?: string;
  /** True when the post was published but media (e.g. image) was skipped (e.g. Twitter 403 on upload). */
  mediaSkipped?: boolean;
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
  const { platform, token, platformUserId, caption, firstImageUrl, firstMediaUrl, twitterOAuth1 } = options;
  const { fetch: fetchFn, axios: axiosInstance } = deps;

  try {
    if (platform === 'INSTAGRAM') {
      if (!firstImageUrl) {
        return { ok: false, error: 'Instagram requires at least one image' };
      }
      const containerRes = await axiosInstance.post(
        `https://graph.facebook.com/v18.0/${platformUserId}/media`,
        null,
        {
          params: {
            image_url: firstImageUrl,
            caption: caption || undefined,
            access_token: token,
          },
        }
      );
      const creationId = (containerRes.data as { id?: string })?.id;
      if (!creationId) throw new Error(JSON.stringify(containerRes.data));
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
      const feedParams: Record<string, string> = {
        message: caption || ' ',
        access_token: pageToken,
      };
      if (firstMediaUrl) feedParams.link = firstMediaUrl;
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
        content?: { media: { id: string; altText?: string } };
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
        const initRes = await axiosInstance.post<{ value?: { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(
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
        const val = initRes.data?.value;
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
        postBody.content = { media: { id: videoUrn, altText: caption.slice(0, 120) || undefined } };
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

          const initRes = await axiosInstance.post(v1Url, initForm, {
            headers: { ...getUploadHeaders('POST'), ...initForm.getHeaders() },
            timeout: 30_000,
            validateStatus: () => true,
          });
          if (initRes.status !== 200) {
            throw new Error(`Twitter video INIT failed: ${initRes.status} ${JSON.stringify(initRes.data)}`);
          }
          const mediaId = (initRes.data as { media_id_string?: string })?.media_id_string;
          if (!mediaId) throw new Error('Twitter INIT did not return media_id_string');

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

    return { ok: false, error: `Publish not implemented for ${platform}` };
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: unknown }; message?: string })?.response?.data != null
        ? JSON.stringify((err as { response: { data: unknown } }).response.data)
        : (err as Error)?.message || 'Unknown error';
    return { ok: false, error: message.slice(0, 500) };
  }
}
