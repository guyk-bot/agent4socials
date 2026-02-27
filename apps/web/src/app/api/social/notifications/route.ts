import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';

/**
 * GET /api/social/notifications
 * Returns counts for nav and inbox-tab badges: { inbox, comments, messages }.
 * inbox = total for header; comments = comment count; messages = conversation count (IG/FB).
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0 }, { status: 200 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0 }, { status: 200 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  let commentsTotal = 0;
  let messagesTotal = 0;
  for (const account of accounts) {
    if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
      const targets = await prisma.postTarget.findMany({
        where: {
          socialAccountId: account.id,
          platformPostId: { not: null },
          status: PostStatus.POSTED,
        },
        take: 10,
      });
      const token = account.accessToken;
      for (const target of targets) {
        const pid = target.platformPostId!;
        try {
          const res = await axios.get<{ data?: unknown[] }>(
            `https://graph.facebook.com/v18.0/${pid}/comments`,
            { params: { fields: 'id', access_token: token }, timeout: 8000 }
          );
          commentsTotal += (res.data?.data ?? []).length;
        } catch (_) {
          // skip
        }
      }
      try {
        const convRes = await axios.get<{ data?: unknown[] }>(
          `https://graph.facebook.com/v18.0/${account.platformUserId}/conversations`,
          { params: { fields: 'id', access_token: token }, timeout: 5000 }
        );
        messagesTotal += (convRes.data?.data ?? []).length;
      } catch (_) {
        // skip
      }
    } else if (account.platform === 'TWITTER') {
      const targets = await prisma.postTarget.findMany({
        where: {
          socialAccountId: account.id,
          platformPostId: { not: null },
          status: PostStatus.POSTED,
        },
        take: 10,
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
          commentsTotal += (res.data?.data ?? []).length;
        } catch (_) {
          // skip
        }
      }
    }
  }
  const inbox = Math.min(commentsTotal + messagesTotal, 99);
  return NextResponse.json({
    inbox,
    comments: Math.min(commentsTotal, 99),
    messages: Math.min(messagesTotal, 99),
  });
}
