import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus, Platform, Prisma } from '@prisma/client';
import { isTikTokDirectPostPayload } from '@/lib/tiktok/tiktok-publish-compliance';
import { sendScheduleConfirmationEmail } from '@/lib/resend';
import { friendlyMessageIfPrismaSchemaDrift } from '@/lib/prisma-db-hints';

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
    title?: string | null;
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
    targets = [],
    scheduledAt,
    scheduleDelivery,
    commentAutomation,
    tiktokPublishByAccountId: bodyTiktok,
  } = body;
  const validTargets = (targets || []).filter(
    (t): t is { platform: string; socialAccountId: string } => Boolean(t?.platform && t?.socialAccountId)
  );
  if (!validTargets.length) {
    return NextResponse.json(
      { message: 'At least one target with a connected account (platform + socialAccountId) is required' },
      { status: 400 }
    );
  }
  const validPlatforms = Object.values(Platform) as string[];
  const invalidPlatform = validTargets.find((t) => !validPlatforms.includes(t.platform));
  if (invalidPlatform) {
    return NextResponse.json(
      { message: `Invalid platform: ${invalidPlatform.platform}. Use one of: ${validPlatforms.join(', ')}` },
      { status: 400 }
    );
  }
  const accountIds = [...new Set(validTargets.map((t) => t.socialAccountId))];
  const accountsForUser = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, userId },
    select: { id: true },
  });
  const foundIds = new Set(accountsForUser.map((a) => a.id));
  const missing = accountIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    return NextResponse.json(
      { message: 'One or more selected accounts are invalid or do not belong to you. Please reconnect from Accounts.' },
      { status: 400 }
    );
  }
  let tiktokJson: Prisma.InputJsonValue | undefined;
  if (bodyTiktok != null) {
    if (typeof bodyTiktok !== 'object' || Array.isArray(bodyTiktok)) {
      return NextResponse.json({ message: 'tiktokPublishByAccountId must be an object.' }, { status: 400 });
    }
    const allowedIds = new Set(accountIds);
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bodyTiktok)) {
      if (!allowedIds.has(k)) {
        return NextResponse.json({ message: 'tiktokPublishByAccountId contains an unknown account id.' }, { status: 400 });
      }
      if (!isTikTokDirectPostPayload(v)) {
        return NextResponse.json({ message: 'Invalid TikTok publish settings. Complete the Post to TikTok step in the composer.' }, { status: 400 });
      }
      cleaned[k] = v;
    }
    if (Object.keys(cleaned).length > 0) tiktokJson = cleaned as Prisma.InputJsonValue;
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
  const post = await prisma.post.create({
    data: {
      userId,
      ...(title !== undefined && title !== null && String(title).trim() ? { title: String(title).trim().slice(0, 300) } : {}),
      content: content ?? null,
      ...(contentByPlatform && Object.keys(contentByPlatform).length > 0 ? { contentByPlatform } : {}),
      ...(mediaByPlatform && Object.keys(mediaByPlatform).length > 0 ? { mediaByPlatform } : {}),
      ...(commentAutomation && Array.isArray(commentAutomation.keywords) && commentAutomation.keywords.length > 0 && (
        (commentAutomation.replyTemplate ?? '').trim() ||
        (commentAutomation.replyTemplateByPlatform && typeof commentAutomation.replyTemplateByPlatform === 'object' && Object.values(commentAutomation.replyTemplateByPlatform).some((s: unknown) => (typeof s === 'string' && s.trim())))
      )
        ? { commentAutomation: commentAutomation as object }
        : {}),
      status,
      targetPlatforms: validTargets.map((t) => t.platform),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      scheduleDelivery: scheduledAt && (scheduleDelivery === 'auto' || scheduleDelivery === 'email_links') ? scheduleDelivery : null,
      ...(tiktokJson ? { tiktokPublishByAccountId: tiktokJson } : {}),
      media: {
        create: media.map((m) => ({
          fileUrl: m.fileUrl,
          type: m.type as 'IMAGE' | 'VIDEO',
          metadata: (() => {
            const meta = m as { thumbnailUrl?: string; useVideoDefaultForPublish?: boolean };
            const obj: Record<string, unknown> = {};
            if (meta.thumbnailUrl) obj.thumbnailUrl = meta.thumbnailUrl;
            if (meta.useVideoDefaultForPublish) obj.useVideoDefaultForPublish = true;
            return (Object.keys(obj).length ? obj : undefined) as Prisma.InputJsonValue | undefined;
          })(),
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
  if (scheduledAt) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user?.email) {
        const delivery = scheduledAt && (scheduleDelivery === 'email_links' || scheduleDelivery === 'auto')
          ? scheduleDelivery
          : 'auto';
        await sendScheduleConfirmationEmail(user.email, scheduledAt, delivery);
      }
    } catch (emailErr) {
      console.error('[POST /api/posts] schedule confirmation email failed:', emailErr);
    }
  }
  return NextResponse.json(post);
  } catch (e) {
    const drift = friendlyMessageIfPrismaSchemaDrift(e);
    if (drift) {
      console.error('[POST /api/posts] schema drift (apply migration or ensure-*.sql):', e);
      return NextResponse.json({ message: drift }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'Failed to create post';
    console.error('[POST /api/posts]', e);
    return NextResponse.json({ message }, { status: 500 });
  }
}
