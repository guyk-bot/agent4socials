import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';

/**
 * GET /api/social/notifications
 * Returns counts for nav and inbox-tab badges.
 * inbox = total for header; byPlatform = per-platform counts for Messages/Comments badges.
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0, byPlatform: {} }, { status: 200 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0, byPlatform: {} }, { status: 200 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true },
  });
  let commentsTotal = 0;
  let messagesTotal = 0;
  const byPlatform: Record<string, { comments: number; messages: number }> = {};

  for (const account of accounts) {
    if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
      let commentsCount = 0;
      const targets = await prisma.postTarget.findMany({
        where: {
          socialAccountId: account.id,
          platformPostId: { not: null },
          status: PostStatus.POSTED,
        },
        take: 50,
      });
      const token = account.accessToken;
      for (const target of targets) {
        const pid = target.platformPostId!;
        try {
          const res = await axios.get<{ data?: unknown[] }>(
            `https://graph.facebook.com/v18.0/${pid}/comments`,
            { params: { fields: 'id', access_token: token }, timeout: 8000 }
          );
          const n = (res.data?.data ?? []).length;
          commentsCount += n;
        } catch (_) {
          // skip
        }
      }
      let messagesCount = 0;
      try {
        if (account.platform === 'INSTAGRAM') {
          let linkedPageId: string | null = account.credentialsJson && typeof account.credentialsJson === 'object'
            ? (account.credentialsJson as { linkedPageId?: string }).linkedPageId ?? null
            : null;
          if (!linkedPageId && token) {
            const fb = await prisma.socialAccount.findFirst({
              where: { userId, platform: 'FACEBOOK', accessToken: token },
              select: { platformUserId: true },
            });
            if (fb?.platformUserId) linkedPageId = fb.platformUserId;
          }
          const convPath = linkedPageId
            ? `https://graph.facebook.com/v18.0/${linkedPageId}/conversations`
            : 'https://graph.instagram.com/v18.0/me/conversations';
          const convParams: Record<string, string> = { fields: 'id', access_token: token };
          if (linkedPageId) convParams.platform = 'instagram';
          const convRes = await axios.get<{ data?: unknown[] }>(convPath, { params: convParams, timeout: 5000 });
          messagesCount = (convRes.data?.data ?? []).length;
        } else {
          const convRes = await axios.get<{ data?: unknown[] }>(
            `https://graph.facebook.com/v18.0/${account.platformUserId}/conversations`,
            { params: { fields: 'id', access_token: token }, timeout: 5000 }
          );
          messagesCount = (convRes.data?.data ?? []).length;
        }
      } catch (_) {
        // skip
      }
      commentsTotal += commentsCount;
      messagesTotal += messagesCount;
      if (!byPlatform[account.platform]) byPlatform[account.platform] = { comments: 0, messages: 0 };
      byPlatform[account.platform].comments += commentsCount;
      byPlatform[account.platform].messages += messagesCount;
    } else if (account.platform === 'TWITTER') {
      let commentsCount = 0;
      const targets = await prisma.postTarget.findMany({
        where: {
          socialAccountId: account.id,
          platformPostId: { not: null },
          status: PostStatus.POSTED,
        },
        take: 50,
      });
      const token = account.accessToken;
      for (const target of targets) {
        const pid = target.platformPostId!;
        try {
          const res = await axios.get<{ data?: unknown[] }>(
            'https://api.twitter.com/2/tweets/search/recent',
            {
              params: {
                query: `conversation_id:${pid} is:reply`,
                'tweet.fields': 'id',
                max_results: 25,
              },
              headers: { Authorization: `Bearer ${token}` },
              timeout: 8000,
            }
          );
          commentsCount += (res.data?.data ?? []).length;
        } catch (_) {
          // skip
        }
      }
      commentsTotal += commentsCount;
      if (!byPlatform['TWITTER']) byPlatform['TWITTER'] = { comments: 0, messages: 0 };
      byPlatform['TWITTER'].comments += commentsCount;
    }
  }
  const inbox = Math.min(commentsTotal + messagesTotal, 99);
  const res = NextResponse.json({
    inbox,
    comments: Math.min(commentsTotal, 99),
    messages: Math.min(messagesTotal, 99),
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).map(([p, v]) => [p, { comments: Math.min(v.comments, 99), messages: Math.min(v.messages, 99) }])
    ),
  });
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
