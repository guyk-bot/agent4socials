/**
 * Verifies that when we publish to LinkedIn or Twitter with an image URL,
 * we actually: fetch the image, upload it, and create the post with media attached.
 */
import { publishTarget } from '../publish-target';

const fakeImageUrl = 'https://example.com/image.jpg';
const smallImageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // minimal jpeg bytes

describe('publishTarget', () => {
  describe('LinkedIn with image', () => {
    it('fetches image, calls initializeUpload, PUTs image to uploadUrl, then creates post with content.media.id', async () => {
      const fetchCalls: { url: string; init?: RequestInit }[] = [];
      const fetchMock = async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        if (url === fakeImageUrl) {
          return new Response(smallImageBuffer, {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      };

      const axiosPostCalls: { url: string; data?: unknown }[] = [];
      const axiosPutCalls: { url: string; data?: unknown }[] = [];
      const axiosMock = {
        get: async () => ({ data: {} }),
        post: async (url: string, data?: unknown) => {
          axiosPostCalls.push({ url, data });
          if (url.includes('initializeUpload')) {
            return {
              data: {
                value: {
                  uploadUrl: 'https://linkedin.com/upload/123',
                  image: 'urn:li:image:abc',
                },
              },
            };
          }
          if (url.includes('rest/posts')) {
            return { data: { id: 'post-1' }, headers: { 'x-restli-id': 'urn:li:share:1' } };
          }
          return { data: {} };
        },
        put: async (url: string, data?: unknown) => {
          axiosPutCalls.push({ url, data });
          return undefined;
        },
      };

      const result = await publishTarget(
        {
          platform: 'LINKEDIN',
          token: 'token',
          platformUserId: 'user123',
          caption: 'Hello',
          firstImageUrl: fakeImageUrl,
        },
        { fetch: fetchMock, axios: axiosMock }
      );

      expect(result.ok).toBe(true);

      // 1) Fetched the image
      const imageFetch = fetchCalls.find((c) => c.url === fakeImageUrl);
      expect(imageFetch).toBeDefined();

      // 2) Called initializeUpload with owner
      const initCall = axiosPostCalls.find((c) => c.url.includes('initializeUpload'));
      expect(initCall).toBeDefined();
      expect((initCall!.data as { initializeUploadRequest?: { owner: string } })?.initializeUploadRequest?.owner).toBe('urn:li:person:user123');

      // 3) PUT image bytes to uploadUrl
      expect(axiosPutCalls.length).toBe(1);
      expect(axiosPutCalls[0].url).toBe('https://linkedin.com/upload/123');
      expect(Buffer.isBuffer(axiosPutCalls[0].data)).toBe(true);
      expect((axiosPutCalls[0].data as Buffer).length).toBe(smallImageBuffer.length);

      // 4) Created post with content.media.id
      const postCall = axiosPostCalls.find((c) => c.url.includes('rest/posts'));
      expect(postCall).toBeDefined();
      const body = postCall!.data as { content?: { media: { id: string } } };
      expect(body?.content?.media?.id).toBe('urn:li:image:abc');
    });
  });

  describe('Twitter with image', () => {
    it('fetches image, uploads to upload.twitter.com, then creates tweet with media.media_ids', async () => {
      const fetchCalls: { url: string; init?: RequestInit }[] = [];
      const fetchMock = async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        if (url === fakeImageUrl) {
          return new Response(smallImageBuffer, {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
        if (url.includes('upload.twitter.com')) {
          return new Response(JSON.stringify({ media_id_string: '12345' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      };

      const axiosPostCalls: { url: string; data?: unknown }[] = [];
      const axiosMock = {
        get: async () => ({ data: {} }),
        post: async (url: string, data?: unknown) => {
          axiosPostCalls.push({ url, data });
          if (url.includes('upload.twitter.com') || url.includes('api.twitter.com/2/media')) {
            return { status: 200, data: { media_id_string: '12345' } };
          }
          if (url.includes('api.twitter.com/2/tweets')) {
            return { data: { data: { id: 'tweet-1' } } };
          }
          return { status: 200, data: {} };
        },
        put: async () => undefined,
      };

      const result = await publishTarget(
        {
          platform: 'TWITTER',
          token: 'token',
          platformUserId: 'user',
          caption: 'Hello',
          firstImageUrl: fakeImageUrl,
        },
        { fetch: fetchMock, axios: axiosMock }
      );

      expect(result.ok).toBe(true);

      // 1) Fetched the image
      expect(fetchCalls.some((c) => c.url === fakeImageUrl)).toBe(true);

      // 2) Uploaded to Twitter media endpoint via axios (v2 or v1.1)
      const uploadCall = axiosPostCalls.find((c) => c.url.includes('upload.twitter.com') || c.url.includes('api.twitter.com/2/media'));
      expect(uploadCall).toBeDefined();

      // 3) Created tweet with media_ids
      const tweetCall = axiosPostCalls.find((c) => c.url.includes('2/tweets'));
      expect(tweetCall).toBeDefined();
      const body = tweetCall!.data as { text?: string; media?: { media_ids: string[] } };
      expect(body?.media?.media_ids).toEqual(['12345']);
    });
  });
});
