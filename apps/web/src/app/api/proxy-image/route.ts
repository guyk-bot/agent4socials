import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/proxy-image?url=<encoded-url>
 * Fetches an image server-side and streams it back to the client.
 * This bypasses browser CORS/referrer restrictions on CDN URLs (e.g. Instagram, Facebook).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
    const parsed = new URL(decoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new NextResponse('Invalid URL protocol', { status: 400 });
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  try {
    const response = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Agent4Socials/1.0)',
        'Accept': 'image/*,*/*',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return new NextResponse(`Upstream error: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const contentLength = response.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    };
    if (contentLength) headers['Content-Length'] = contentLength;

    return new NextResponse(response.body, { status: 200, headers });
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 });
  }
}
