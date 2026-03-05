import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cleanSlug = slug.replace(/^@/, '').toLowerCase();

  const page = await prisma.linkPage.findUnique({
    where: { slug: cleanSlug },
    select: { title: true, bio: true, avatarUrl: true },
  });

  if (!page) {
    return { title: 'Not Found' };
  }

  return {
    title: page.title ? `${page.title} | Agent4Socials` : 'Agent4Socials',
    description: page.bio ?? 'Link page powered by Agent4Socials',
    openGraph: {
      title: page.title ?? 'Agent4Socials',
      description: page.bio ?? 'Link page powered by Agent4Socials',
      images: page.avatarUrl ? [{ url: page.avatarUrl }] : [],
    },
    twitter: {
      card: 'summary',
      title: page.title ?? 'Agent4Socials',
      description: page.bio ?? 'Link page powered by Agent4Socials',
      images: page.avatarUrl ? [page.avatarUrl] : [],
    },
  };
}

export default async function LinkPage({ params }: Props) {
  const { slug } = await params;
  const cleanSlug = slug.replace(/^@/, '').toLowerCase();

  const page = await prisma.linkPage.findUnique({
    where: { slug: cleanSlug, isPublished: true },
    include: {
      links: {
        where: { isVisible: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!page) {
    notFound();
  }

  return (
    <LinkPageRenderer
      page={{
        slug: page.slug,
        title: page.title,
        bio: page.bio,
        avatarUrl: page.avatarUrl,
        design: page.design as Record<string, unknown> | null,
        links: page.links.map((l) => ({
          id: l.id,
          type: l.type,
          label: l.label,
          url: l.url,
          icon: l.icon,
          order: l.order,
          isVisible: l.isVisible,
        })),
      }}
    />
  );
}
