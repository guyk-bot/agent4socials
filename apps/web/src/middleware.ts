import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const WWW_HOST = 'www.izop.ai';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const decoded = decodeURIComponent(pathname);

  // Rewrite /@username (or /%40username) to /username for Smart Links
  if (decoded.startsWith('/@')) {
    const username = decoded.slice(2);
    if (username && /^[a-z0-9_]+$/i.test(username)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${username.toLowerCase()}`;
      return NextResponse.rewrite(url);
    }
  }

  // Naked izop.ai → www for the marketing site, but keep OAuth callbacks on izop.ai
  // so they match Meta/Google strict redirect URI whitelist.
  const host = request.headers.get('host')?.split(':')[0] ?? '';
  if (host === 'izop.ai' && !pathname.startsWith('/api/social/oauth/')) {
    const url = request.nextUrl.clone();
    url.host = WWW_HOST;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/@:path*',
    '/%40:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
