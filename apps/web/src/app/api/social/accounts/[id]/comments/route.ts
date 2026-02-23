import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';

/**
 * GET /api/social/accounts/[id]/comments
 * Returns recent comments on this account's posts (Instagram, Facebook, or X).
 */
export async function GET(
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ comments: [], error: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK' && platform !== 'TWITTER') {
    return NextResponse.json({ comments: [], error: 'Comments are only available for Instagram, Facebook, and X.' });
  }

  const targets = await prisma.postTarget.findMany({
    where: {
      socialAccountId: account.id,
      platformPostId: { not: null },
      status: PostStatus.POSTED,
    },
    include: { post: { select: { id: true, content: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 15,
  });
  const token = account.accessToken;
  const comments: Array<{
    commentId: string;
    postTargetId: string;
    platformPostId: string;
    postPreview: string;
    text: string;
    authorName: string;
    createdAt: string;
    platform: string;
  }> = [];

  for (const target of targets) {
    const platformPostId = target.platformPostId!;
    const postPreview = (target.post?.content ?? '').slice(0, 80) || 'Post';

    if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
      const fields = platform === 'INSTAGRAM' ? 'id,from,text,created_time' : 'id,from,message,created_time';
      try {
        const res = await axios.get<{
          data?: Array<{
            id: string;
            from?: { username?: string; name?: string };
            text?: string;
            message?: string;
            created_time?: string;
          }>;
        }>(`https://graph.facebook.com/v18.0/${platformPostId}/comments`, {
          params: { fields, access_token: token },
        });
        const list = res.data?.data ?? [];
        for (const c of list) {
          const from = c.from;
          const authorName = from?.username ?? from?.name ?? 'Unknown';
          const text = (platform === 'INSTAGRAM' ? c.text : c.message) ?? '';
          comments.push({
            commentId: c.id,
            postTargetId: target.id,
            platformPostId,
            postPreview,
            text,
            authorName,
            createdAt: c.created_time ?? new Date().toISOString(),
            platform,
          });
        }
      } catch (_) {
        // skip this post on API error
      }
      continue;
    }

    if (platform === 'TWITTER') {
      try {
        const searchRes = await axios.get<{
          data?: Array<{ id: string; text?: string; author_id?: string; created_at?: string }>;
          includes?: { users?: Array<{ id: string; username?: string; name?: string }> };
          errors?: Array<{ message?: string }>;
        }>('https://api.twitter.com/2/tweets/search/recent', {
          params: {
            query: `conversation_id:${platformPostId} is:reply`,
            'tweet.fields': 'text,author_id,created_at',
            'user.fields': 'username,name',
            expansions: 'author_id',
            max_results: 25,
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        const errs = searchRes.data?.errors;
        if (errs?.length) continue;
        const tweets = searchRes.data?.data ?? [];
        const users = (searchRes.data?.includes?.users ?? []) as Array<{ id: string; username?: string; name?: string }>;
        const userMap = new Map(users.map((u) => [u.id, u]));
        for (const t of tweets) {
          const u = userMap.get(t.author_id ?? '');
          const authorName = u?.username ?? u?.name ?? 'Unknown';
          comments.push({
            commentId: t.id,
            postTargetId: target.id,
            platformPostId,
            postPreview,
            text: t.text ?? '',
            authorName,
            createdAt: t.created_at ?? new Date().toISOString(),
            platform: 'TWITTER',
          });
        }
      } catch (_) {
        // skip
      }
    }
  }

  comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ comments: comments.slice(0, 50) });
}
