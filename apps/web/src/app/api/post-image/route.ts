import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * GET /api/post-image?accountId=xxx&postId=yyy
 * Fetches a fresh image URL from the platform API (bypassing cached/expired CDN URLs)
 * then proxies the image bytes to the client.
 * No user auth required — img tags can't send auth headers, and post images are public.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get('accountId');
  const postId = searchParams.get('postId');

  if (!accountId || !postId) {
    return new NextResponse('Missing accountId or postId', { status: 400 });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { platform: true, accessToken: true, platformUserId: true, credentialsJson: true },
  });
  if (!account) {
    return new NextResponse('Account not found', { status: 404 });
  }

  const platform = account.platform;
  const token = account.accessToken ?? '';
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson : {}) as { loginMethod?: string };
  const isBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';

  let freshImageUrl: string | null = null;

  try {
    if (platform === 'INSTAGRAM') {
      // Fetch fresh media URL directly for this specific post
      const apiBase = isBusinessLogin
        ? `https://graph.instagram.com/v25.0/${postId}`
        : `https://graph.facebook.com/v18.0/${postId}`;
      const res = await axios.get<{ media_url?: string; thumbnail_url?: string }>(apiBase, {
        params: { fields: 'media_url,thumbnail_url', access_token: token },
        timeout: 10_000,
      });
      freshImageUrl = res.data?.media_url ?? res.data?.thumbnail_url ?? null;
    } else if (platform === 'FACEBOOK') {
      const res = await axios.get<{ full_picture?: string; picture?: string }>(
        `https://graph.facebook.com/v18.0/${postId}`,
        { params: { fields: 'full_picture,picture', access_token: token }, timeout: 10_000 }
      );
      freshImageUrl = res.data?.full_picture ?? res.data?.picture ?? null;
    } else if (platform === 'YOUTUBE') {
      freshImageUrl = `https://i.ytimg.com/vi/${postId}/mqdefault.jpg`;
    }
  } catch {
    // Fall through to DB fallback
  }

  // Fallback: check ImportedPost in DB
  if (!freshImageUrl) {
    const imp = await prisma.importedPost.findFirst({
      where: { platformPostId: postId, socialAccountId: accountId },
      select: { thumbnailUrl: true },
    });
    freshImageUrl = imp?.thumbnailUrl ?? null;
  }

  if (!freshImageUrl) {
    return new NextResponse('No image available', { status: 404 });
  }

  // Proxy the image bytes
  try {
    const imgRes = await fetch(freshImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Agent4Socials/1.0)',
        Accept: 'image/*,*/*',
      },
      cache: 'no-store',
    });
    if (!imgRes.ok) {
      return new NextResponse(`Image fetch failed: ${imgRes.status}`, { status: 502 });
    }
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache for 30 minutes - fresh enough, reduces API calls
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 });
  }
}
