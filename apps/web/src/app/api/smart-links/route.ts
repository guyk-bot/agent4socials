import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'signup', 'settings',
  'help', 'support', 'about', 'terms', 'privacy', 'pricing', 'blog', 'docs',
  'static', 'assets', 'images', 'css', 'js', 'fonts', 'favicon', 'robots',
  'sitemap', 'manifest', 'sw', 'service-worker', 'null', 'undefined', 'true', 'false',
]);

function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 30) return false;
  if (!/^[a-z0-9_]+$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}

function generateSlugFromEmail(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return base.slice(0, 20) || 'user';
}

export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const linkPage = await prisma.linkPage.findUnique({
    where: { userId },
    include: { links: { orderBy: { order: 'asc' } } },
  });

  return NextResponse.json({ linkPage });
}

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    slug?: string;
    title?: string;
    bio?: string;
    avatarUrl?: string;
    design?: Record<string, unknown>;
    isPublished?: boolean;
    links?: Array<{
      id?: string;
      type?: string;
      label?: string;
      url?: string;
      icon?: string;
      order?: number;
      isVisible?: boolean;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  const existing = await prisma.linkPage.findUnique({ where: { userId } });

  let slug = body.slug?.toLowerCase().trim();
  if (slug && !isValidSlug(slug)) {
    return NextResponse.json({ message: 'Invalid slug. Use 3-30 lowercase letters, numbers, or underscores.' }, { status: 400 });
  }

  if (!slug && !existing) {
    const baseSlug = user.name
      ? user.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
      : generateSlugFromEmail(user.email);
    slug = baseSlug || 'user';
    let counter = 0;
    while (true) {
      const candidate = counter === 0 ? slug : `${slug}${counter}`;
      const taken = await prisma.linkPage.findUnique({ where: { slug: candidate } });
      if (!taken && isValidSlug(candidate)) {
        slug = candidate;
        break;
      }
      counter++;
      if (counter > 100) {
        slug = `user${Date.now().toString(36)}`;
        break;
      }
    }
  }

  if (slug && slug !== existing?.slug) {
    const taken = await prisma.linkPage.findUnique({ where: { slug } });
    if (taken && taken.userId !== userId) {
      return NextResponse.json({ message: 'This username is already taken.' }, { status: 409 });
    }
  }

  const linkPageData = {
    slug: slug || existing?.slug || 'user',
    title: body.title ?? existing?.title ?? user.name ?? null,
    bio: body.bio ?? existing?.bio ?? null,
    avatarUrl: body.avatarUrl ?? existing?.avatarUrl ?? null,
    design: body.design ?? existing?.design ?? null,
    isPublished: body.isPublished ?? existing?.isPublished ?? true,
  };

  let linkPage;
  if (existing) {
    linkPage = await prisma.linkPage.update({
      where: { id: existing.id },
      data: linkPageData,
    });
  } else {
    linkPage = await prisma.linkPage.create({
      data: { userId, ...linkPageData },
    });
  }

  if (body.links !== undefined) {
    await prisma.linkItem.deleteMany({ where: { linkPageId: linkPage.id } });
    if (body.links.length > 0) {
      await prisma.linkItem.createMany({
        data: body.links.map((link, idx) => ({
          linkPageId: linkPage.id,
          type: link.type ?? 'link',
          label: link.label ?? null,
          url: link.url ?? null,
          icon: link.icon ?? null,
          order: link.order ?? idx,
          isVisible: link.isVisible ?? true,
        })),
      });
    }
  }

  const result = await prisma.linkPage.findUnique({
    where: { id: linkPage.id },
    include: { links: { orderBy: { order: 'asc' } } },
  });

  return NextResponse.json({ linkPage: result });
}

export async function DELETE(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const existing = await prisma.linkPage.findUnique({ where: { userId } });
  if (!existing) {
    return NextResponse.json({ message: 'No link page found' }, { status: 404 });
  }

  await prisma.linkPage.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
