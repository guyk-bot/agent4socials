/**
 * Verifies that /api/media/proxy does NOT forward the Range header to R2.
 * When Meta/Instagram fetches with Range, we must return 200 with full content, not 206.
 */
import { NextRequest } from 'next/server';
import { GET } from '../proxy/route';

const mockFetch = jest.fn();

function mockRequest(r2Url: string, rangeHeader?: string): NextRequest {
  const url = new URL('http://localhost/api/media/proxy');
  url.searchParams.set('url', r2Url);
  const headers: Record<string, string> = {};
  if (rangeHeader) headers['Range'] = rangeHeader;
  return new NextRequest(url.toString(), { method: 'GET', headers });
}

describe('media proxy', () => {
  const r2Origin = 'https://pub-xxx.r2.dev';
  const r2Url = `${r2Origin}/uploads/test.jpg`;
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = mockFetch;
    process.env = { ...originalEnv, S3_PUBLIC_URL: r2Origin };
    mockFetch.mockResolvedValue(
      new Response(new Blob(['fake-image-bytes']), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '18' },
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('does NOT forward Range header to R2 (prevents 206 -> 2207076)', async () => {
    const req = mockRequest(r2Url, 'bytes=0-999');
    await GET(req);

    expect(mockFetch).toHaveBeenCalled();
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0];
    expect(fetchUrl).toBe(r2Url);
    expect(fetchOpts?.headers).toBeDefined();
    const headers = fetchOpts.headers as Headers | Record<string, string>;
    const range = headers instanceof Headers ? headers.get('Range') : headers?.['Range'] ?? headers?.['range'];
    expect(range).toBeUndefined();
  });

  it('returns 200 when R2 returns 200', async () => {
    const req = mockRequest(r2Url);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
