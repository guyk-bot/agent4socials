import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { disconnectThreadsByPlatformUserId } from '@/lib/meta/disconnect-threads-account';
import { metaSignedRequestUserId, parseMetaSignedRequest } from '@/lib/meta/parse-signed-request';
import { resolveAppBaseUrl, threadsAppSecret } from '@/lib/threads/threads-api';

export const dynamic = 'force-dynamic';

function confirmationCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Meta Threads data-deletion callback (POST with signed_request). */
export async function POST(request: NextRequest) {
  const secret = threadsAppSecret();
  if (!secret) {
    console.error('[Threads data-deletion] Missing THREADS_APP_SECRET / META_APP_SECRET');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const signedRequest =
    form?.get('signed_request')?.toString() ??
    (await request.text().then((t) => {
      const params = new URLSearchParams(t);
      return params.get('signed_request');
    }));

  if (!signedRequest) {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
  }

  const data = parseMetaSignedRequest(signedRequest, secret);
  const userId = metaSignedRequestUserId(data);
  if (!userId) {
    console.warn('[Threads data-deletion] Invalid signed_request');
    return NextResponse.json({ error: 'Invalid signed_request' }, { status: 400 });
  }

  const code = confirmationCode();
  const base = resolveAppBaseUrl();
  const statusUrl = `${base}/data-deletion?confirmation_code=${encodeURIComponent(code)}&platform=threads`;

  try {
    const removed = await disconnectThreadsByPlatformUserId(userId);
    console.info('[Threads data-deletion] processed', { userId, removed, code });
  } catch (e) {
    console.error('[Threads data-deletion] DB error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: code,
  });
}

/** Optional status check for a deletion confirmation code (human-readable). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('confirmation_code')?.trim();
  if (!code) {
    return NextResponse.json({ error: 'Missing confirmation_code' }, { status: 400 });
  }
  return NextResponse.json({
    confirmation_code: code,
    status: 'completed',
    message:
      'Your Threads connection data in Agent4Socials has been removed. For full account deletion, use Account settings in the app or email support@agent4socials.com.',
  });
}
