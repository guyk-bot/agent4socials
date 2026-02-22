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
      if (firstImageUrl) {
        try {
          const { buffer, contentType } = await fetchImageBuffer(firstImageUrl, fetchFn);
          const mediaCategory = 'tweet_image';
          const filename = contentType.includes('png') ? 'image.png' : 'image.jpg';
          const form = new FormData();
          form.append('media', buffer, { filename, contentType });
          form.append('media_category', mediaCategory);

          const doUpload = (url: string, headers: Record<string, string>) =>
            axiosInstance.post(url, form, {
              headers: { ...headers, ...form.getHeaders() },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              validateStatus: () => true,
            });

          let uploadRes: { status: number; data: unknown };
          const useOAuth1 = twitterOAuth1 && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;
          const v2Url = 'https://api.twitter.com/2/media/upload';

          if (useOAuth1) {
            uploadRes = await doUpload('https://upload.twitter.com/1.1/media/upload.json', signTwitterRequest('POST', 'https://upload.twitter.com/1.1/media/upload.json', { key: twitterOAuth1!.accessToken, secret: twitterOAuth1!.accessTokenSecret }));
          } else {
            uploadRes = await doUpload(v2Url, { Authorization: `Bearer ${token}` });
            if (uploadRes.status !== 200) {
              const v1Res = await doUpload('https://upload.twitter.com/1.1/media/upload.json', { Authorization: `Bearer ${token}` });
              if (v1Res.status === 200) uploadRes = v1Res;
            }
          }

          if (uploadRes.status !== 200) {
            const errData = uploadRes.data as unknown;
            const errText =
              errData === undefined || errData === null
                ? (uploadRes as { statusText?: string }).statusText || 'No response body'
                : typeof errData === 'object'
                  ? JSON.stringify(errData)
                  : String(errData);
            if (uploadRes.status === 403) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('[Twitter media upload] 403 body:', errText.slice(0, 500));
              }
              mediaSkipped = true;
            } else {
              throw new Error(`Twitter media upload failed: ${uploadRes.status} ${errText}`.slice(0, 300));
            }
          } else {
            const data = uploadRes.data as { media_id_string?: string; media_id?: string } | undefined;
            const mediaId = data?.media_id_string ?? (data?.media_id != null ? String(data.media_id) : undefined);
            if (mediaId) mediaIds = [mediaId];
          }
        } catch (err) {
          throw err;
        }
      }
      const tweetBody = mediaIds.length > 0 ? { text, media: { media_ids: mediaIds } } : { text };
      const tweetRes = await axiosInstance.post(
        'https://api.twitter.com/2/tweets',
        tweetBody,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
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
