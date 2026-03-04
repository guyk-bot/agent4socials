import { NextRequest, NextResponse } from 'next/server';
import { convertToJpegIfNeeded } from '@/lib/media-to-jpeg';

// No auth required: <img>/<video> don't send Authorization. We only allow URLs under S3_PUBLIC_URL.

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
  const urlParam = request.nextUrl.searchParams.get('url');
  const formatJpeg = request.nextUrl.searchParams.get('format') === 'jpeg';
  if (!urlParam || typeof urlParam !== 'string') {
    return NextResponse.json({ message: 'url is required' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(decodeURIComponent(urlParam));
  } catch {
    return NextResponse.json({ message: 'Invalid url' }, { status: 400 });
  }

  const publicBase = process.env.S3_PUBLIC_URL?.trim();
  if (!publicBase) {
    return NextResponse.json({ message: 'Media proxy not configured' }, { status: 503 });
  }
  const allowedBase = publicBase.replace(/\/$/, '');
  const allowedOrigin = new URL(allowedBase.startsWith('http') ? allowedBase : `https://${allowedBase}`).origin;
  if (targetUrl.origin !== allowedOrigin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const isVideoUrl = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(targetUrl.pathname);
  const rangeHeader = request.headers.get('range');

  // For images: do NOT forward Range (Meta/Instagram sends Range and R2 returning 206 causes corrupt uploads).
  // For videos: forward Range so the browser can seek (required for the frame-picker canvas feature).
  const fetchHeaders: HeadersInit = {
    Accept: '*/*',
    'User-Agent': 'Mozilla/5.0 (compatible; Meta-Instagram/1.0; +https://www.instagram.com)',
    ...(isVideoUrl && rangeHeader ? { Range: rangeHeader } : {}),
  };

  try {
    let res = await fetch(targetUrl.href, {
      method: 'GET',
      headers: fetchHeaders,
      cache: 'no-store',
    });
    // R2 dev URL: path may have been built as /bucket/key but R2 expects /key only; retry with key only
    if ((res.status === 404 || res.status === 403) && targetUrl.pathname.includes('/') && publicBase.includes('r2.dev')) {
      const pathParts = targetUrl.pathname.replace(/^\/+/, '').split('/');
      if (pathParts.length >= 2) {
        const keyOnly = pathParts.slice(1).join('/');
        const fallbackUrl = `${allowedBase}/${keyOnly}`;
        res = await fetch(fallbackUrl, { method: 'GET', headers: fetchHeaders, cache: 'no-store' });
      }
    }
    if (!res.ok && res.status !== 206) {
      return NextResponse.json({ message: 'Upstream error' }, { status: res.status === 404 ? 404 : 502 });
    }
    let contentType = res.headers.get('content-type')?.split(';')[0]?.trim()
      || contentTypeFromUrl(targetUrl.href);
    let body: Buffer | ReadableStream<Uint8Array> = res.body as ReadableStream<Uint8Array>;
    const isImageLike = /^image\//i.test(contentType) || contentType === 'application/octet-stream'
      || /\.(png|webp|gif|jpe?g)$/i.test(targetUrl.pathname);
    if (formatJpeg && isImageLike) {
      const buf = Buffer.from(await res.arrayBuffer());
      const converted = await convertToJpegIfNeeded(buf, contentType);
      body = converted.buffer;
      contentType = converted.contentType;
    }
    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    };
    if (body instanceof Buffer) {
      responseHeaders['Content-Length'] = String(body.length);
    } else {
      const contentLength = res.headers.get('content-length');
      if (contentLength) responseHeaders['Content-Length'] = contentLength;
    }
    // Forward range-related headers from upstream
    const acceptRanges = res.headers.get('Accept-Ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;
    const contentRange = res.headers.get('Content-Range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    const statusCode = res.status === 206 ? 206 : 200;
    return new NextResponse(body as BodyInit, {
      status: statusCode,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Media proxy fetch error:', err);
    return NextResponse.json({ message: 'Proxy failed' }, { status: 502 });
  }
}
