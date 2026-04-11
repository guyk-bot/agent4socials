import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import { linkedInAuthorUrnForUgc } from '@/lib/linkedin/sync-ugc-posts';

/**
 * POST /api/social/accounts/[id]/comments/reply
 * Reply to a comment on Instagram, Facebook, YouTube, X, or LinkedIn.
 * Body: { commentId: string; message: string; linkedInObjectUrn?: string } (LinkedIn needs linkedInObjectUrn from GET /comments.)
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
  const body = await request.json() as { commentId?: string; message?: string; linkedInObjectUrn?: string };
  const { commentId, message, linkedInObjectUrn } = body;

  if (!commentId || !message?.trim()) {
    return NextResponse.json({ message: 'commentId and message are required' }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      credentialsJson: true,
      refreshToken: true,
      expiresAt: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (
    platform !== 'INSTAGRAM' &&
    platform !== 'FACEBOOK' &&
    platform !== 'YOUTUBE' &&
    platform !== 'TWITTER' &&
    platform !== 'LINKEDIN'
  ) {
    return NextResponse.json({
      message: 'Comment replies are only supported for Instagram, Facebook, YouTube, X (Twitter), and LinkedIn.',
    }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };

  const isInstagramBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const accessToken = account.accessToken ?? '';

  try {
    if (platform === 'LINKEDIN') {
      const parentUrn = commentId.trim();
      const objectUrn = typeof linkedInObjectUrn === 'string' ? linkedInObjectUrn.trim() : '';
      if (!parentUrn.startsWith('urn:li:comment:')) {
        return NextResponse.json({
          message:
            'LinkedIn reply: refresh comments in the inbox, then try again. Expected a comment URN (urn:li:comment:...).',
        }, { status: 400 });
      }
      if (!objectUrn.startsWith('urn:li:')) {
        return NextResponse.json({
          message:
            'LinkedIn reply requires linkedInObjectUrn from the comments list (thread URN). Open Comments again to refresh.',
        }, { status: 400 });
      }
      const actor = linkedInAuthorUrnForUgc(account.platformUserId ?? '');
      await axios.post(
        `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(parentUrn)}/comments`,
        {
          actor,
          message: { text: message.trim() },
          object: objectUrn,
          parentComment: parentUrn,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'Linkedin-Version': '202602',
          },
          timeout: 20_000,
        }
      );
      return NextResponse.json({ ok: true });
    }

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
          `${facebookGraphBaseUrl}/${commentId}/replies`,
          null,
          { params: { message: message.trim(), access_token: accessToken }, timeout: 15_000 }
        );
      }
    } else {
      // Facebook page comment: reply as nested comment
      await axios.post(
        `${facebookGraphBaseUrl}/${commentId}/comments`,
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
      const platformLabel =
        platform === 'INSTAGRAM'
          ? 'Instagram'
          : platform === 'FACEBOOK'
            ? 'Facebook'
            : platform === 'YOUTUBE'
              ? 'YouTube'
              : platform === 'LINKEDIN'
                ? 'LinkedIn'
                : 'X (Twitter)';
      msg = `Reply failed: API permission error. Try reconnecting your account from the sidebar, or reply directly on ${platformLabel}.`;
    }
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
