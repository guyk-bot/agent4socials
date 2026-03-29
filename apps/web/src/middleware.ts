import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Decode in case browser sent %40 instead of @
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/@:path*',
    '/%40:path*',
  ],
};
