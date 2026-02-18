import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/posts/[id]/open?t=TOKEN
 * Returns post content (for "email me links" flow) if token is valid. No auth.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Not configured' }, { status: 503 });
  }
  const { id: postId } = await params;
  const t = request.nextUrl.searchParams.get('t');
  if (!t?.trim()) {
    return NextResponse.json({ message: 'Token required' }, { status: 400 });
  }
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      emailOpenToken: t.trim(),
      emailOpenTokenExpiresAt: { gte: new Date() },
    },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: { select: { platform: true, username: true } },
        },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ message: 'Invalid or expired link' }, { status: 404 });
  }
  const contentByPlatform = (post as { contentByPlatform?: Record<string, string> | null }).contentByPlatform ?? null;
  const mediaByPlatform = (post as { mediaByPlatform?: Record<string, { fileUrl: string; type: string }[] } | null }).mediaByPlatform ?? null;
  const defaultMedia = post.media.map((m) => ({ fileUrl: m.fileUrl, type: m.type }));
  const platforms = post.targets.map((t) => ({
    platform: t.socialAccount.platform,
    username: t.socialAccount.username,
    caption: (contentByPlatform?.[t.socialAccount.platform] ?? post.content ?? '').trim(),
    media: (mediaByPlatform?.[t.socialAccount.platform]?.length ? mediaByPlatform[t.socialAccount.platform] : defaultMedia) as { fileUrl: string; type: string }[],
  }));
  return NextResponse.json({
    content: post.content,
    contentByPlatform: contentByPlatform ?? undefined,
    platforms,
    media: defaultMedia,
  });
}
