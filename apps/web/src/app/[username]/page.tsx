import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import type { LinkPageDesign } from '@/components/smart-links/themes';
import type { Metadata } from 'next';

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { username } = await params;
    const slug = username.replace(/^@/, '').toLowerCase();
    const linkPage = await prisma.linkPage.findUnique({
      where: { slug },
      select: { title: true, bio: true, avatarUrl: true },
    });
    if (!linkPage) return { title: 'Not Found' };
    return {
      title: linkPage.title || `@${slug}`,
      description: linkPage.bio || undefined,
      openGraph: {
        title: linkPage.title || `@${slug}`,
        description: linkPage.bio || undefined,
        images: linkPage.avatarUrl ? [linkPage.avatarUrl] : undefined,
      },
    };
  } catch {
    return { title: 'Not Found' };
  }
}

/** Ensure design is a plain serializable object for Client Component */
function sanitizeDesign(design: unknown): LinkPageDesign | null {
  if (design == null || typeof design !== 'object') return null;
  const d = design as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = [
    'theme', 'bgType', 'bgColor', 'bgGradient', 'bgGradientColors', 'bgImageUrl', 'bgVideoUrl',
    'fontFamily', 'buttonStyle', 'buttonColor', 'buttonTextColor', 'buttonSize', 'textColor',
    'animation', 'avatarScale',
  ];
  for (const k of keys) {
    if (d[k] !== undefined && d[k] !== null) {
      if (k === 'bgGradientColors' && Array.isArray(d[k])) {
        out[k] = (d[k] as unknown[]).filter((x) => typeof x === 'string') as [string, string, string?];
      } else if (typeof d[k] === 'string' || typeof d[k] === 'number' || Array.isArray(d[k])) {
        out[k] = d[k];
      }
    }
  }
  return out as LinkPageDesign;
}

export default async function SmartLinkPublicPage({ params }: { params: Params }) {
  try {
    const { username } = await params;
    const slug = username.replace(/^@/, '').toLowerCase();

    const linkPage = await prisma.linkPage.findUnique({
      where: { slug },
      include: {
        links: {
          where: { isVisible: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!linkPage || !linkPage.isPublished) {
      notFound();
    }

    const data = {
      slug: linkPage.slug,
      title: linkPage.title ?? null,
      bio: linkPage.bio ?? null,
      avatarUrl: linkPage.avatarUrl ?? null,
      design: sanitizeDesign(linkPage.design),
      links: linkPage.links.map((l) => ({
        id: l.id,
        type: l.type ?? 'link',
        label: l.label ?? null,
        url: l.url ?? null,
        icon: l.icon ?? null,
        order: Number(l.order),
        isVisible: l.isVisible,
      })),
    };

    return <LinkPageRenderer data={data} />;
  } catch (e) {
    console.error('Smart link page error:', e);
    notFound();
  }
}
