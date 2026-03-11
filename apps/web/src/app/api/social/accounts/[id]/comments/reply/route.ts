import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';

/**
 * POST /api/social/accounts/[id]/comments/reply
 * Reply to a comment on Instagram, Facebook, or YouTube.
 * Body: { commentId: string; message: string }
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
  const body = await request.json() as { commentId?: string; message?: string };
  const { commentId, message } = body;

  if (!commentId || !message?.trim()) {
    return NextResponse.json({ message: 'commentId and message are required' }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true, refreshToken: true, expiresAt: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK' && platform !== 'YOUTUBE' && platform !== 'TWITTER') {
    return NextResponse.json({ message: 'Comment replies are only supported for Instagram, Facebook, YouTube, and X (Twitter).' }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };

  const isInstagramBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const accessToken = account.accessToken ?? '';

  try {
    if (platform === 'TWITTER') {
      await axios.post<{ data?: { id?: string } }>(
        'https://api.twitter.com/2/tweets',
        { text: message.trim(), reply: { in_reply_to_tweet_id: commentId } },
        { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15_000 }
      );
      return NextResponse.json({ ok: true });
    }

    if (platform === 'YOUTUBE') {
      const token = await getValidYoutubeToken({
        id: account.id,
        accessToken: account.accessToken ?? '',
        refreshToken: account.refreshToken ?? null,
        expiresAt: account.expiresAt ?? null,
      });
      await axios.post<{ id?: string }>(
        'https://www.googleapis.com/youtube/v3/comments',
        { snippet: { parentId: commentId, textOriginal: message.trim() } },
        { params: { part: 'snippet' }, headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
      );
      return NextResponse.json({ ok: true });
    }

    if (platform === 'INSTAGRAM') {
      if (isInstagramBusinessLogin) {
        // Instagram Business Login: reply via graph.instagram.com
        await axios.post(
          `https://graph.instagram.com/v25.0/${commentId}/replies`,
          null,
          { params: { message: message.trim(), access_token: accessToken }, timeout: 15_000 }
        );
      } else {
        // Instagram via Facebook Login: use replies endpoint on graph.facebook.com
        await axios.post(
          `https://graph.facebook.com/v18.0/${commentId}/replies`,
          null,
          { params: { message: message.trim(), access_token: accessToken }, timeout: 15_000 }
        );
      }
    } else {
      // Facebook page comment: reply as nested comment
      await axios.post(
        `https://graph.facebook.com/v18.0/${commentId}/comments`,
        null,
        { params: { message: message.trim(), access_token: accessToken }, timeout: 15_000 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const axErr = err as { response?: { data?: unknown; status?: number }; message?: string };
    const rawData = axErr?.response?.data;
    const errData = (rawData as { error?: { message?: string; code?: number } })?.error;
    let msg = errData?.message ?? (rawData as { message?: string })?.message ?? axErr?.message ?? 'Failed to send reply';
    console.error('[reply] error:', JSON.stringify(rawData ?? err));
    // Provide a clearer message for permission errors
    if (errData?.code === 200 || errData?.code === 10 || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('does not support') || msg.toLowerCase().includes('not exist')) {
      const platformLabel = platform === 'INSTAGRAM' ? 'Instagram' : platform === 'FACEBOOK' ? 'Facebook' : platform === 'YOUTUBE' ? 'YouTube' : 'X (Twitter)';
      msg = `Reply failed: API permission error. Try reconnecting your account from the sidebar, or reply directly on ${platformLabel}.`;
    }
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
