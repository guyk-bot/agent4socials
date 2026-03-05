import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'signup', 'settings',
  'help', 'support', 'about', 'terms', 'privacy', 'pricing', 'blog', 'docs',
  'static', 'assets', 'images', 'css', 'js', 'fonts', 'favicon', 'robots',
  'sitemap', 'manifest', 'sw', 'service-worker', 'null', 'undefined', 'true', 'false',
]);

export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug')?.toLowerCase().trim();
  if (!slug) {
    return NextResponse.json({ available: false, message: 'Slug is required' });
  }

  if (slug.length < 3 || slug.length > 30) {
    return NextResponse.json({ available: false, message: 'Must be 3-30 characters' });
  }

  if (!/^[a-z0-9_]+$/.test(slug)) {
    return NextResponse.json({ available: false, message: 'Only lowercase letters, numbers, and underscores' });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ available: false, message: 'This username is reserved' });
  }

  const existing = await prisma.linkPage.findUnique({ where: { slug } });
  if (existing && existing.userId !== userId) {
    return NextResponse.json({ available: false, message: 'Already taken' });
  }

  return NextResponse.json({ available: true });
}
