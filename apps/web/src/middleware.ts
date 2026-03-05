import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rewrite /@username to /link/username for Smart Links
  if (pathname.startsWith('/@')) {
    const username = pathname.slice(2);
    if (username && /^[a-z0-9_]+$/i.test(username)) {
      const url = request.nextUrl.clone();
      url.pathname = `/link/${username.toLowerCase()}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/@:path*',
  ],
};
