import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolvePostMediaForInbox } from '@/lib/inbox/post-media-resolver';

/**
 * GET /api/post-media?accountId=xxx&postId=yyy
 * Returns fresh post media (image, video, or carousel) for inbox comment previews.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get('accountId');
  const postId = searchParams.get('postId');

  if (!accountId || !postId) {
    return NextResponse.json({ message: 'Missing accountId or postId' }, { status: 400 });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      expiresAt: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  const payload = await resolvePostMediaForInbox(account, postId);
  const res = NextResponse.json(payload);
  res.headers.set('Cache-Control', 'private, max-age=300');
  return res;
}
