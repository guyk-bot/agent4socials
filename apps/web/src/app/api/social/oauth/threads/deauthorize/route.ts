import { NextRequest, NextResponse } from 'next/server';
import { disconnectThreadsByPlatformUserId } from '@/lib/meta/disconnect-threads-account';
import { metaSignedRequestUserId, parseMetaSignedRequest } from '@/lib/meta/parse-signed-request';
import { threadsAppSecret } from '@/lib/threads/threads-api';

export const dynamic = 'force-dynamic';

/** Meta Threads uninstall / deauthorize callback (POST with signed_request). */
export async function POST(request: NextRequest) {
  const secret = threadsAppSecret();
  if (!secret) {
    console.error('[Threads deauthorize] Missing THREADS_APP_SECRET / META_APP_SECRET');
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
    console.warn('[Threads deauthorize] Invalid signed_request');
    return NextResponse.json({ error: 'Invalid signed_request' }, { status: 400 });
  }

  try {
    const removed = await disconnectThreadsByPlatformUserId(userId);
    console.info('[Threads deauthorize] disconnected', { userId, removed });
  } catch (e) {
    console.error('[Threads deauthorize] DB error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return new NextResponse('OK', { status: 200 });
}
