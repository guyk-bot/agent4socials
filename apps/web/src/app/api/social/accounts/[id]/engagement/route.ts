import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

/**
 * GET /api/social/accounts/[id]/engagement
 * Returns likes and comments counts per post for the Inbox Engagement tab (Instagram, Facebook).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ engagement: [], error: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ engagement: [], error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });
  if (!account) {
    return NextResponse.json({ engagement: [], error: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform as string;
  if (
    platform !== 'INSTAGRAM' &&
    platform !== 'FACEBOOK' &&
    platform !== 'YOUTUBE'
  ) {
    return NextResponse.json({
      engagement: [],
      error: 'Engagement is only available for Instagram, Facebook, and YouTube.',
    });
  }

  // YouTube: pull engagement directly from stored importedPost stats (no extra API calls needed)
  if (platform === 'YOUTUBE') {
    const ytPosts = await prisma.importedPost.findMany({
      where: { socialAccountId: account.id },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    const ytEngagement = ytPosts.map((p) => ({
      platformPostId: p.platformPostId,
      postPreview: (p.content ?? '').slice(0, 80) || 'Video',
      platform: 'YOUTUBE',
      likeCount: 0,
      commentCount: p.interactions ?? 0,
      mediaUrl: p.thumbnailUrl ?? null,
      permalink: p.permalinkUrl ?? null,
      viewCount: p.impressions ?? 0,
    }));
    ytEngagement.sort((a, b) => (b.viewCount + b.commentCount) - (a.viewCount + a.commentCount));
    return NextResponse.json({ engagement: ytEngagement });
  }

  const targets = await prisma.postTarget.findMany({
    where: {
      socialAccountId: account.id,
      platformPostId: { not: null },
      status: PostStatus.POSTED,
    },
    include: { post: { select: { id: true, content: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const targetPostIds = new Set(targets.map((t) => t.platformPostId!));
  const imported = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 30,
  });
  const importedToFetch = imported.filter((p) => !targetPostIds.has(p.platformPostId));

  type Source = { platformPostId: string; postPreview: string };
  const sources: Source[] = [
    ...targets.map((t) => ({
      platformPostId: t.platformPostId!,
      postPreview: (t.post?.content ?? '').slice(0, 80) || 'Post',
    })),
    ...importedToFetch.map((p) => ({
      platformPostId: p.platformPostId,
      postPreview: (p.content ?? '').slice(0, 80) || 'Post',
    })),
  ];

  const token = account.accessToken;
  const engagement: Array<{
    platformPostId: string;
    postPreview: string;
    platform: string;
    likeCount: number;
    commentCount: number;
    mediaUrl?: string | null;
    permalink?: string | null;
  }> = [];

  for (const source of sources) {
    const { platformPostId, postPreview } = source;
    try {
      if (platform === 'INSTAGRAM') {
        const res = await axios.get<{
          id?: string;
          like_count?: number;
          comments_count?: number;
          media_url?: string;
          permalink?: string;
        }>(`${facebookGraphBaseUrl}/${platformPostId}`, {
          params: {
            fields: 'like_count,comments_count,media_url,permalink',
            access_token: token,
          },
          timeout: 10_000,
        });
        engagement.push({
          platformPostId,
          postPreview,
          platform: 'INSTAGRAM',
          likeCount: res.data?.like_count ?? 0,
          commentCount: res.data?.comments_count ?? 0,
          mediaUrl: res.data?.media_url ?? null,
          permalink: res.data?.permalink ?? null,
        });
      } else {
        const res = await axios.get<{
          id?: string;
          reactions?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          message?: string;
          full_picture?: string;
          permalink_url?: string;
        }>(`${facebookGraphBaseUrl}/${platformPostId}`, {
          params: {
            fields: 'reactions.summary(1),comments.summary(1),message,full_picture,permalink_url',
            access_token: token,
          },
          timeout: 10_000,
        });
        const likeCount = res.data?.reactions?.summary?.total_count ?? 0;
        const commentCount = res.data?.comments?.summary?.total_count ?? 0;
        engagement.push({
          platformPostId,
          postPreview,
          platform: 'FACEBOOK',
          likeCount,
          commentCount,
          mediaUrl: res.data?.full_picture ?? null,
          permalink: res.data?.permalink_url ?? null,
        });
      }
    } catch (_) {
      engagement.push({
        platformPostId,
        postPreview,
        platform,
        likeCount: 0,
        commentCount: 0,
        mediaUrl: null,
        permalink: null,
      });
    }
  }

  engagement.sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
  return NextResponse.json({ engagement });
}
