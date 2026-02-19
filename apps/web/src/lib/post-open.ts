import { prisma } from '@/lib/db';

export type PostOpenData = {
  content: string;
  platforms: {
    platform: string;
    username: string;
    caption: string;
    media: { fileUrl: string; type: string }[];
  }[];
  firstImageUrl?: string;
  /** All image URLs for og:images (carousel preview) */
  allImageUrls: string[];
  /** Best description for og:metadata (LinkedIn caption if available, else first platform, else content) */
  bestDescription: string;
};

export async function getPostForOpen(postId: string, token: string): Promise<PostOpenData | null> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      emailOpenToken: token.trim(),
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
  if (!post) return null;

  type PostWithJson = {
    contentByPlatform?: Record<string, string> | null;
    mediaByPlatform?: Record<string, { fileUrl: string; type: string }[]> | null;
  };
  const contentByPlatform = (post as PostWithJson).contentByPlatform ?? null;
  const mediaByPlatform = (post as PostWithJson).mediaByPlatform ?? null;
  const defaultMedia = post.media.map((m) => ({ fileUrl: m.fileUrl, type: m.type }));
  const platforms = post.targets.map((t) => ({
    platform: t.socialAccount.platform,
    username: t.socialAccount.username,
    caption: (contentByPlatform?.[t.socialAccount.platform] ?? post.content ?? '').trim(),
    media: (mediaByPlatform?.[t.socialAccount.platform]?.length ? mediaByPlatform[t.socialAccount.platform] : defaultMedia) as { fileUrl: string; type: string }[],
  }));

  const allImageUrls = [
    ...post.media.filter((m) => m.type === 'IMAGE').map((m) => m.fileUrl),
    ...platforms.flatMap((p) => p.media.filter((m) => m.type === 'IMAGE').map((m) => m.fileUrl)),
  ].filter((url, i, arr) => arr.indexOf(url) === i);
  const firstImageUrl = allImageUrls[0];
  const linkedInCaption = platforms.find((p) => p.platform === 'LINKEDIN')?.caption;
  const bestDescription = (linkedInCaption || platforms[0]?.caption || post.content || '').trim();
  return {
    content: post.content ?? '',
    platforms,
    firstImageUrl,
    allImageUrls,
    bestDescription: bestDescription.slice(0, 200),
  };
}
