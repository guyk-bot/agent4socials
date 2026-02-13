import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus, Platform } from '@prisma/client';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Posts require DATABASE_URL' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const posts = await prisma.post.findMany({
    where: { userId },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: { select: { username: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(posts);
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Posts require DATABASE_URL' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: {
    title?: string;
    content?: string;
    contentByPlatform?: Record<string, string>;
    media?: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
    mediaByPlatform?: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
    targets?: { platform: string; socialAccountId: string }[];
    scheduledAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { title, content, contentByPlatform, media = [], mediaByPlatform, targets = [], scheduledAt } = body;
  const validTargets = (targets || []).filter(
    (t): t is { platform: string; socialAccountId: string } =>
      Boolean(t?.platform && t?.socialAccountId)
  );
  if (!validTargets.length) {
    return NextResponse.json(
      { message: 'At least one target with a connected account (platform + socialAccountId) is required' },
      { status: 400 }
    );
  }
  const status: PostStatus = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;
  const post = await prisma.post.create({
    data: {
      userId,
      title: title ?? null,
      content: content ?? null,
      ...(contentByPlatform && Object.keys(contentByPlatform).length > 0 ? { contentByPlatform } : {}),
      ...(mediaByPlatform && Object.keys(mediaByPlatform).length > 0 ? { mediaByPlatform } : {}),
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      media: {
        create: media.map((m) => ({
          fileUrl: m.fileUrl,
          type: m.type as 'IMAGE' | 'VIDEO',
        })),
      },
      targets: {
        create: validTargets.map((t) => ({
          platform: t.platform as Platform,
          socialAccountId: t.socialAccountId,
          status,
        })),
      },
    },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: { select: { username: true } },
        },
      },
    },
  });
  return NextResponse.json(post);
}
