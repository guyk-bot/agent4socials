import { NextRequest, NextResponse } from 'next/server';
import { verifyMediaServeToken } from '@/lib/media-serve-token';

// Same MIME and fetch behavior as proxy; short URL for Meta (no long query string).

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function contentTypeFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lower = pathname.toLowerCase();
    for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
      if (lower.endsWith(ext)) return mime;
    }
  } catch (_) {}
  return 'application/octet-stream';
}

export async function GET(request: NextRequest) {
  const tokenParam = request.nextUrl.searchParams.get('t');
  if (!tokenParam || typeof tokenParam !== 'string') {
    return NextResponse.json({ message: 't (token) required' }, { status: 400 });
  }

  const decoded = verifyMediaServeToken(tokenParam);
  if (!decoded) {
    return NextResponse.json({ message: 'Invalid or expired token' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(decoded.url);
  } catch {
    return NextResponse.json({ message: 'Invalid url in token' }, { status: 400 });
  }

  const publicBase = process.env.S3_PUBLIC_URL?.trim();
  if (!publicBase) {
    return NextResponse.json({ message: 'Media serve not configured' }, { status: 503 });
  }
  const allowedOrigin = new URL(publicBase.replace(/\/$/, '')).origin;
  if (targetUrl.origin !== allowedOrigin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const rangeHeader = request.headers.get('range');
  const fetchHeaders: HeadersInit = {
    Accept: '*/*',
    'User-Agent': 'Mozilla/5.0 (compatible; InstagramBot/1.0; +https://www.instagram.com)',
  };
  if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

  try {
    let res = await fetch(targetUrl.href, {
      method: 'GET',
      headers: fetchHeaders,
      cache: 'no-store',
    });
    if (res.status === 404 && targetUrl.pathname.includes('/') && publicBase.includes('r2.dev')) {
      const pathParts = targetUrl.pathname.replace(/^\/+/, '').split('/');
      if (pathParts.length >= 2) {
        const keyOnly = pathParts.slice(1).join('/');
        const fallbackUrl = `${allowedOrigin}/${keyOnly}`;
        res = await fetch(fallbackUrl, { method: 'GET', headers: fetchHeaders, cache: 'no-store' });
      }
    }
    if (!res.ok) {
      return NextResponse.json({ message: 'Upstream error' }, { status: res.status === 404 ? 404 : 502 });
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim()
      || contentTypeFromUrl(targetUrl.href);
    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    };
    const contentLength = res.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (res.status === 206) {
      const contentRange = res.headers.get('Content-Range');
      const acceptRanges = res.headers.get('Accept-Ranges');
      if (contentRange) responseHeaders['Content-Range'] = contentRange;
      if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;
    } else if (!rangeHeader && res.headers.get('Accept-Ranges')) {
      responseHeaders['Accept-Ranges'] = res.headers.get('Accept-Ranges')!;
    }
    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('[Media serve] fetch error:', err);
    return NextResponse.json({ message: 'Serve failed' }, { status: 502 });
  }
}
