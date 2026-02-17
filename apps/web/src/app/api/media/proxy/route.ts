import { NextRequest, NextResponse } from 'next/server';

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
  if (!targetUrl.href.startsWith(allowedBase)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    let res = await fetch(targetUrl.href, {
      method: 'GET',
      headers: { Accept: '*/*' },
      cache: 'no-store',
    });
    // R2 dev URL: path may have been built as /bucket/key but R2 expects /key only; retry with key only
    if (res.status === 404 && targetUrl.pathname.includes('/') && publicBase.includes('r2.dev')) {
      const pathParts = targetUrl.pathname.replace(/^\/+/, '').split('/');
      if (pathParts.length >= 2) {
        const keyOnly = pathParts.slice(1).join('/');
        const fallbackUrl = `${allowedBase}/${keyOnly}`;
        res = await fetch(fallbackUrl, { method: 'GET', headers: { Accept: '*/*' }, cache: 'no-store' });
      }
    }
    if (!res.ok) {
      return NextResponse.json({ message: 'Upstream error' }, { status: res.status === 404 ? 404 : 502 });
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim()
      || contentTypeFromUrl(targetUrl.href);
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Media proxy fetch error:', err);
    return NextResponse.json({ message: 'Proxy failed' }, { status: 502 });
  }
}
