import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import type { LinkPageDesign } from '@/components/smart-links/themes';
import type { Metadata } from 'next';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const linkPage = await prisma.linkPage.findUnique({
    where: { slug: params.slug.toLowerCase() },
    select: { title: true, bio: true, avatarUrl: true },
  });

  if (!linkPage) {
    return { title: 'Not Found' };
  }

  return {
    title: linkPage.title || `@${params.slug}`,
    description: linkPage.bio || `Check out ${linkPage.title || params.slug}'s links`,
    openGraph: {
      title: linkPage.title || `@${params.slug}`,
      description: linkPage.bio || undefined,
      images: linkPage.avatarUrl ? [linkPage.avatarUrl] : undefined,
    },
  };
}

export default async function SmartLinkPublicPage({ params }: { params: Params }) {
  const linkPage = await prisma.linkPage.findUnique({
    where: { slug: params.slug.toLowerCase() },
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
    title: linkPage.title,
    bio: linkPage.bio,
    avatarUrl: linkPage.avatarUrl,
    design: linkPage.design as LinkPageDesign | null,
    links: linkPage.links.map((l) => ({
      id: l.id,
      type: l.type,
      label: l.label,
      url: l.url,
      icon: l.icon,
      order: l.order,
      isVisible: l.isVisible,
    })),
  };

  return <LinkPageRenderer data={data} />;
}
