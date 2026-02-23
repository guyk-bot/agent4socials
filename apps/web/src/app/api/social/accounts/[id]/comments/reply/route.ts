import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * POST /api/social/accounts/[id]/comments/reply
 * Body: { commentId: string, message: string }
 * Replies to a comment (Instagram, Facebook, or X).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  let body: { commentId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const commentId = typeof body.commentId === 'string' ? body.commentId.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!commentId || !message) {
    return NextResponse.json({ message: 'commentId and message are required' }, { status: 400 });
  }

  const platform = account.platform;
  const token = account.accessToken;

  try {
    if (platform === 'INSTAGRAM') {
      await axios.post(
        `https://graph.facebook.com/v18.0/${commentId}/replies`,
        new URLSearchParams({ message: message.slice(0, 1000) }),
        { params: { access_token: token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return NextResponse.json({ ok: true });
    }
    if (platform === 'FACEBOOK') {
      await axios.post(
        `https://graph.facebook.com/v18.0/${commentId}/comments`,
        new URLSearchParams({ message: message.slice(0, 8000) }),
        { params: { access_token: token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return NextResponse.json({ ok: true });
    }
    if (platform === 'TWITTER') {
      await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: message.slice(0, 280), reply: { in_reply_to_tweet_id: commentId } },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ message: 'Replies only supported for Instagram, Facebook, and X' }, { status: 400 });
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    const msg = err.response?.data != null ? JSON.stringify(err.response.data) : err.message ?? 'Reply failed';
    return NextResponse.json({ message: msg.slice(0, 300) }, { status: err.response?.status ?? 500 });
  }
}
