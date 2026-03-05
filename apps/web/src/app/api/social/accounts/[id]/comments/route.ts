import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';

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
    select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, expiresAt: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ comments: [], error: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK' && platform !== 'TWITTER' && platform !== 'YOUTUBE') {
    return NextResponse.json({ comments: [], error: 'Comments are only available for Instagram, Facebook, X, and YouTube.' });
  }

  // Auto-refresh YouTube tokens
  if (platform === 'YOUTUBE') {
    account.accessToken = await getValidYoutubeToken(account);
  }

  // Posts we published through the app
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
  const targetPostIds = new Set(targets.map((t) => t.platformPostId!));

  // Synced (imported) posts from the platform so we can show comments on all posts, not only app-published
  const imported = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 25,
  });
  const importedPostsToFetch = imported.filter((p) => !targetPostIds.has(p.platformPostId));

  type PostSource = { platformPostId: string; postPreview: string; postTargetId: string };
  const sources: PostSource[] = [
    ...targets.map((t) => ({
      platformPostId: t.platformPostId!,
      postPreview: (t.post?.content ?? '').slice(0, 80) || 'Post',
      postTargetId: t.id,
    })),
    ...importedPostsToFetch.map((p) => ({
      platformPostId: p.platformPostId,
      postPreview: (p.content ?? '').slice(0, 80) || 'Post',
      postTargetId: `imported-${p.id}`,
    })),
  ];
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; igUserToken?: string };

  // Instagram Business Login: account.accessToken IS the long-lived Instagram User token.
  const isInstagramBusinessLogin =
    platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const igUserToken = isInstagramBusinessLogin ? account.accessToken : null;

  const token = account.accessToken;
  const comments: Array<{
    commentId: string;
    postTargetId: string;
    platformPostId: string;
    postPreview: string;
    postImageUrl?: string | null;
    text: string;
    authorName: string;
    authorPictureUrl?: string | null;
    createdAt: string;
    platform: string;
  }> = [];
  let firstError: string | null = null;

  const accountId = account.id;

  async function getPostImageUrl(postId: string, plat: string, accessToken: string): Promise<string | null> {
    try {
      if (plat === 'FACEBOOK') {
        const r = await axios.get<{ full_picture?: string; picture?: string }>(
          `https://graph.facebook.com/v18.0/${postId}`,
          { params: { fields: 'full_picture,picture', access_token: accessToken } }
        );
        return r.data?.full_picture ?? r.data?.picture ?? null;
      }
      if (plat === 'INSTAGRAM') {
        const r = await axios.get<{ media_url?: string }>(
          `https://graph.facebook.com/v18.0/${postId}`,
          { params: { fields: 'media_url', access_token: accessToken } }
        );
        return r.data?.media_url ?? null;
      }
      if (plat === 'YOUTUBE') {
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? `https://i.ytimg.com/vi/${postId}/mqdefault.jpg`;
      }
    } catch (_) {}
    return null;
  }

  for (const source of sources) {
    const { platformPostId, postPreview, postTargetId } = source;
    const postImageUrl = await getPostImageUrl(platformPostId, platform, token);

    if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
      try {
        if (isInstagramBusinessLogin && igUserToken) {
          // Instagram Business Login: use graph.instagram.com with the Instagram User token.
          // Requires instagram_business_manage_comments permission.
          const res = await axios.get<{
            data?: Array<{
              id: string;
              from?: { id?: string; username?: string };
              text?: string;
              timestamp?: string;
            }>;
          }>(`https://graph.instagram.com/v25.0/${platformPostId}/comments`, {
            params: {
              fields: 'id,from{id,username},text,timestamp',
              access_token: igUserToken,
            },
            timeout: 15_000,
          });
          const list = res.data?.data ?? [];
          for (const c of list) {
            comments.push({
              commentId: c.id,
              postTargetId,
              platformPostId,
              postPreview,
              postImageUrl,
              text: c.text ?? '',
              authorName: c.from?.username ?? 'Unknown',
              authorPictureUrl: null,
              createdAt: c.timestamp ?? new Date().toISOString(),
              platform,
            });
          }
        } else {
          // Facebook Login flow: use graph.facebook.com with the Page token.
          const fields =
            platform === 'INSTAGRAM'
              ? 'id,from{id,username,profile_picture_url},text,created_time'
              : 'id,from{id,name,picture},message,created_time';
          const res = await axios.get<{
            data?: Array<{
              id: string;
              from?: { id?: string; username?: string; name?: string; profile_picture_url?: string; picture?: { data?: { url?: string } } };
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
            const authorName = (platform === 'INSTAGRAM' ? from?.username : from?.name) ?? 'Unknown';
            const authorPictureUrl =
              platform === 'INSTAGRAM'
                ? (from as { profile_picture_url?: string })?.profile_picture_url ?? null
                : (from as { picture?: { data?: { url?: string } } })?.picture?.data?.url ?? null;
            const text = (platform === 'INSTAGRAM' ? c.text : c.message) ?? '';
            comments.push({
              commentId: c.id,
              postTargetId,
              platformPostId,
              postPreview,
              postImageUrl,
              text,
              authorName,
              authorPictureUrl: authorPictureUrl || null,
              createdAt: c.created_time ?? new Date().toISOString(),
              platform,
            });
          }
        }
      } catch (err) {
        if (!firstError) {
          const axErr = err as { response?: { data?: { error?: { message?: string; code?: number } } } };
          const msg = axErr?.response?.data?.error?.message ?? String(err);
          firstError = msg;
        }
      }
      continue;
    }

    if (platform === 'YOUTUBE') {
      try {
        const ytRes = await axios.get<{
          items?: Array<{
            id?: string;
            snippet?: {
              topLevelComment?: {
                id?: string;
                snippet?: {
                  authorDisplayName?: string;
                  authorProfileImageUrl?: string;
                  textOriginal?: string;
                  publishedAt?: string;
                };
              };
            };
          }>;
        }>('https://www.googleapis.com/youtube/v3/commentThreads', {
          params: { part: 'snippet', videoId: platformPostId, maxResults: 20 },
          headers: { Authorization: `Bearer ${token}` },
        });
        const items = ytRes.data?.items ?? [];
        for (const item of items) {
          const top = item.snippet?.topLevelComment?.snippet;
          if (!top) continue;
          comments.push({
            commentId: item.snippet?.topLevelComment?.id ?? item.id ?? String(Math.random()),
            postTargetId,
            platformPostId,
            postPreview,
            postImageUrl,
            text: top.textOriginal ?? '',
            authorName: top.authorDisplayName ?? 'Unknown',
            authorPictureUrl: top.authorProfileImageUrl ?? null,
            createdAt: top.publishedAt ?? new Date().toISOString(),
            platform: 'YOUTUBE',
          });
        }
      } catch (_) {
        // skip on API error
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
        const users = (searchRes.data?.includes?.users ?? []) as Array<{ id: string; username?: string; name?: string; profile_image_url?: string }>;
        const userMap = new Map(users.map((u) => [u.id, u]));
        for (const t of tweets) {
          const u = userMap.get(t.author_id ?? '');
          const authorName = u?.username ?? u?.name ?? 'Unknown';
          const authorPictureUrl = u?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null;
          comments.push({
            commentId: t.id,
            postTargetId,
            platformPostId,
            postPreview,
            postImageUrl: null,
            text: t.text ?? '',
            authorName,
            authorPictureUrl,
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

  let error: string | undefined;
  if (comments.length === 0 && firstError) {
    const msg = firstError.toLowerCase();
    if (msg.includes('permission') || msg.includes('oauth') || msg.includes('scope') || msg.includes('capability') || msg.includes('code 10') || msg.includes('code 200') || msg.includes('#10') || msg.includes('#200')) {
      error = 'Instagram comment permission required. Reconnect your Instagram account from the sidebar to grant the comments permission.';
    } else if (msg.includes('token') || msg.includes('expired') || msg.includes('session')) {
      error = 'Your Instagram session has expired. Reconnect from the sidebar.';
    } else {
      error = firstError;
    }
  }

  return NextResponse.json({ comments: comments.slice(0, 50), ...(error ? { error } : {}) });
}
