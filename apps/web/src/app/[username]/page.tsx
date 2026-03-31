import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import type { LinkPageDesign } from '@/components/smart-links/themes';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = Promise<{ username: string }>;

function normalizeSlug(raw: string): string {
  return decodeURIComponent(raw).replace(/^@/, '').trim().toLowerCase();
}

function compactSlug(raw: string): string {
  return normalizeSlug(raw).replace(/[^a-z0-9_]/g, '');
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { username } = await params;
    const slug = normalizeSlug(username);
    const slugCompact = compactSlug(username);
    const linkPage = await prisma.linkPage.findFirst({
      where: {
        OR: [
          { slug },
          { slug: { equals: slug, mode: Prisma.QueryMode.insensitive } },
          ...(slugCompact && slugCompact !== slug ? [{ slug: slugCompact }, { slug: { equals: slugCompact, mode: Prisma.QueryMode.insensitive } }] : []),
        ],
      },
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
    'animation', 'avatarScale', 'carouselAutoplay', 'buttonTextBold',
  ];
  for (const k of keys) {
    if (d[k] !== undefined && d[k] !== null) {
      if (k === 'bgGradientColors' && Array.isArray(d[k])) {
        out[k] = (d[k] as unknown[]).filter((x) => typeof x === 'string') as [string, string, string?];
      } else if (typeof d[k] === 'string' || typeof d[k] === 'number' || typeof d[k] === 'boolean' || Array.isArray(d[k])) {
        out[k] = d[k];
      }
    }
  }
  return out as LinkPageDesign;
}

export default async function SmartLinkPublicPage({ params }: { params: Params }) {
  try {
    const { username } = await params;
    const slug = normalizeSlug(username);
    const slugCompact = compactSlug(username);

    let linkPage = null;
    try {
      linkPage = await prisma.linkPage.findFirst({
        where: {
          OR: [
            { slug },
            { slug: { equals: slug, mode: Prisma.QueryMode.insensitive } },
            ...(slugCompact && slugCompact !== slug ? [{ slug: slugCompact }, { slug: { equals: slugCompact, mode: Prisma.QueryMode.insensitive } }] : []),
          ],
        },
        include: {
          links: {
            where: { isVisible: true },
            orderBy: { order: 'asc' },
          },
        },
      });
    } catch (dbErr) {
      console.error(`[SmartLinks] DB error for slug "${slug}":`, dbErr);
      notFound();
    }

    if (!linkPage) {
      console.error(`[SmartLinks] No row found for slug: "${slug}"`);
      notFound();
    }
    if (!linkPage.isPublished) {
      console.error(`[SmartLinks] Row found but isPublished=false for slug: "${slug}"`);
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
