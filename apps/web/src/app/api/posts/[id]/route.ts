import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus, Platform, Prisma } from '@prisma/client';
import { isTikTokDirectPostPayload } from '@/lib/tiktok/tiktok-publish-compliance';
import { friendlyMessageIfPrismaSchemaDrift } from '@/lib/prisma-db-hints';

/**
 * GET /api/posts/[id] - Fetch a single post for viewing/editing in composer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: { select: { id: true, platform: true, username: true } },
        },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }
  return NextResponse.json(post);
}

/**
 * PATCH /api/posts/[id] - Update a post (e.g. from composer when editing).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.post.findFirst({
    where: { id, userId },
    include: { targets: true },
  });
  if (!existing) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }
  let body: {
    title?: string;
    content?: string;
    contentByPlatform?: Record<string, string>;
    media?: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string; useVideoDefaultForPublish?: boolean }[];
    mediaByPlatform?: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
    targets?: { platform: string; socialAccountId: string }[];
    scheduledAt?: string | null;
    scheduleDelivery?: 'auto' | 'email_links' | null;
    commentAutomation?: { keywords: string[]; replyTemplate?: string; replyTemplateByPlatform?: Record<string, string>; replyOnComment?: boolean; usePrivateReply?: boolean } | null;
    tiktokPublishByAccountId?: Record<string, unknown> | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const {
    title,
    content,
    contentByPlatform,
    media = [],
    mediaByPlatform,
    targets,
    scheduledAt,
    scheduleDelivery,
    commentAutomation,
    tiktokPublishByAccountId: bodyTiktok,
  } = body;
  const validTargets = (targets || []).filter(
    (t): t is { platform: string; socialAccountId: string } => Boolean(t?.platform && t?.socialAccountId)
  );
  const accountIds = validTargets.length ? [...new Set(validTargets.map((t) => t.socialAccountId))] : [];
  if (accountIds.length) {
    const validPlatforms = Object.values(Platform) as string[];
    const invalid = validTargets.find((t) => !validPlatforms.includes(t.platform));
    if (invalid) {
      return NextResponse.json({ message: `Invalid platform: ${invalid.platform}` }, { status: 400 });
    }
    const accountsForUser = await prisma.socialAccount.findMany({
      where: { id: { in: accountIds }, userId },
      select: { id: true },
    });
    const foundIds = new Set(accountsForUser.map((a) => a.id));
    const missing = accountIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      return NextResponse.json({ message: 'One or more selected accounts are invalid.' }, { status: 400 });
    }
  }
  if (scheduledAt) {
    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ message: 'Invalid scheduled date/time' }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json({ message: 'Scheduled date/time must be in the future' }, { status: 400 });
    }
  }
  const status: PostStatus = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;
  try {
    if (validTargets.length > 0) {
      await prisma.postTarget.deleteMany({ where: { postId: id } });
      await prisma.postTarget.createMany({
        data: validTargets.map((t) => ({
          postId: id,
          platform: t.platform as Platform,
          socialAccountId: t.socialAccountId,
          status,
        })),
      });
    }
    if (media.length > 0) {
      await prisma.mediaAsset.deleteMany({ where: { postId: id } });
      await prisma.mediaAsset.createMany({
        data: media.map((m) => ({
          postId: id,
          fileUrl: m.fileUrl,
          type: m.type,
          metadata: (() => {
            const meta = m as { thumbnailUrl?: string; useVideoDefaultForPublish?: boolean };
            const obj: Record<string, unknown> = {};
            if (meta.thumbnailUrl) obj.thumbnailUrl = meta.thumbnailUrl;
            if (meta.useVideoDefaultForPublish) obj.useVideoDefaultForPublish = true;
            return (Object.keys(obj).length ? obj : undefined) as Prisma.InputJsonValue | undefined;
          })(),
        })),
      });
    }
    const updateData: Record<string, unknown> = {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(contentByPlatform !== undefined ? { contentByPlatform } : {}),
      ...(mediaByPlatform !== undefined ? { mediaByPlatform } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
      ...(scheduleDelivery !== undefined ? { scheduleDelivery: scheduledAt && (scheduleDelivery === 'auto' || scheduleDelivery === 'email_links') ? scheduleDelivery : null } : {}),
      status,
      ...(validTargets.length > 0 ? { targetPlatforms: validTargets.map((t) => t.platform) } : {}),
    };
    if (commentAutomation !== undefined) {
      const ca = commentAutomation as { keywords?: string[]; replyTemplate?: string; replyTemplateByPlatform?: Record<string, string>; usePrivateReply?: boolean } | null;
      const hasReply = ca && Array.isArray(ca.keywords) && ca.keywords.length > 0 && (
        ((ca.replyTemplate ?? '').trim()) ||
        (ca.replyTemplateByPlatform && typeof ca.replyTemplateByPlatform === 'object' && Object.values(ca.replyTemplateByPlatform).some((s: unknown) => typeof s === 'string' && s.trim()))
      );
      updateData.commentAutomation = hasReply ? ca : null;
    }
    if (bodyTiktok !== undefined) {
      if (bodyTiktok === null) {
        updateData.tiktokPublishByAccountId = Prisma.JsonNull;
      } else if (typeof bodyTiktok === 'object' && !Array.isArray(bodyTiktok)) {
        const prev =
          existing.tiktokPublishByAccountId && typeof existing.tiktokPublishByAccountId === 'object' && !Array.isArray(existing.tiktokPublishByAccountId)
            ? { ...(existing.tiktokPublishByAccountId as Record<string, unknown>) }
            : {};
        const merged = { ...prev, ...bodyTiktok };
        const allowedIds = new Set(
          (validTargets.length > 0 ? validTargets : existing.targets).map((t) => t.socialAccountId)
        );
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(merged)) {
          if (!allowedIds.has(k)) {
            return NextResponse.json({ message: 'tiktokPublishByAccountId contains an unknown account id.' }, { status: 400 });
          }
          if (!isTikTokDirectPostPayload(v)) {
            return NextResponse.json({ message: 'Invalid TikTok publish settings.' }, { status: 400 });
          }
          cleaned[k] = v;
        }
        updateData.tiktokPublishByAccountId =
          Object.keys(cleaned).length > 0 ? (cleaned as Prisma.InputJsonValue) : Prisma.JsonNull;
      } else {
        return NextResponse.json({ message: 'tiktokPublishByAccountId must be an object or null.' }, { status: 400 });
      }
    }
    const post = await prisma.post.update({
      where: { id },
      data: updateData as never,
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
  } catch (e) {
    const drift = friendlyMessageIfPrismaSchemaDrift(e);
    if (drift) {
      console.error('[PATCH /api/posts/:id] schema drift (apply migration or ensure-*.sql):', e);
      return NextResponse.json({ message: drift }, { status: 503 });
    }
    console.error('[PATCH /api/posts/:id]', e);
    return NextResponse.json({ message: e instanceof Error ? e.message : 'Update failed' }, { status: 500 });
  }
}
