import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export type DmWelcomeAttachment = {
  fileUrl: string;
  fileName?: string;
  contentType?: string;
  kind: 'image' | 'video' | 'file';
};

const defaultSettings = {
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null as string | null,
  dmWelcomeAttachmentsByPlatform: {} as Record<string, DmWelcomeAttachment[]>,
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null as string | null,
};

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(defaultSettings);
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { automationSettings: true },
    });
    const s = user?.automationSettings as {
      dmWelcomeEnabled?: boolean;
      dmWelcomeMessage?: string | null;
      dmWelcomeAttachmentsByPlatform?: Record<string, DmWelcomeAttachment[]>;
      dmNewFollowerEnabled?: boolean;
      dmNewFollowerMessage?: string | null;
    } | null;
    const attachments = s?.dmWelcomeAttachmentsByPlatform;
    const safeAttachments =
      attachments && typeof attachments === 'object' && !Array.isArray(attachments)
        ? (attachments as Record<string, DmWelcomeAttachment[]>)
        : {};
    return NextResponse.json(
      s
        ? {
            dmWelcomeEnabled: s.dmWelcomeEnabled ?? false,
            dmWelcomeMessage: s.dmWelcomeMessage ?? null,
            dmWelcomeAttachmentsByPlatform: safeAttachments,
            dmNewFollowerEnabled: s.dmNewFollowerEnabled ?? false,
            dmNewFollowerMessage: s.dmNewFollowerMessage ?? null,
          }
        : defaultSettings
    );
  } catch (e) {
    console.error('[Automation GET]', e);
    return NextResponse.json(defaultSettings);
  }
}

export async function PATCH(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: {
    dmWelcomeEnabled?: boolean;
    dmWelcomeMessage?: string | null;
    dmWelcomeAttachmentsByPlatform?: Record<string, DmWelcomeAttachment[]>;
    dmNewFollowerEnabled?: boolean;
    dmNewFollowerMessage?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { automationSettings: true } });
  const current = (user?.automationSettings as Record<string, unknown> | null) ?? {};
  const merged = { ...defaultSettings, ...(current as Partial<typeof defaultSettings>) };
  const prevAttachments = merged.dmWelcomeAttachmentsByPlatform;
  const safePrev =
    prevAttachments && typeof prevAttachments === 'object' && !Array.isArray(prevAttachments)
      ? (prevAttachments as Record<string, DmWelcomeAttachment[]>)
      : {};
  const nextSettings = {
    dmWelcomeEnabled:
      typeof body.dmWelcomeEnabled === 'boolean' ? body.dmWelcomeEnabled : (merged.dmWelcomeEnabled as boolean) ?? false,
    dmWelcomeMessage:
      body.dmWelcomeMessage !== undefined ? (body.dmWelcomeMessage || null) : (merged.dmWelcomeMessage as string | null) ?? null,
    dmWelcomeAttachmentsByPlatform:
      body.dmWelcomeAttachmentsByPlatform !== undefined
        ? (body.dmWelcomeAttachmentsByPlatform && typeof body.dmWelcomeAttachmentsByPlatform === 'object'
            ? body.dmWelcomeAttachmentsByPlatform
            : {})
        : safePrev,
    dmNewFollowerEnabled:
      typeof body.dmNewFollowerEnabled === 'boolean'
        ? body.dmNewFollowerEnabled
        : (merged.dmNewFollowerEnabled as boolean) ?? false,
    dmNewFollowerMessage:
      body.dmNewFollowerMessage !== undefined
        ? (body.dmNewFollowerMessage || null)
        : (merged.dmNewFollowerMessage as string | null) ?? null,
  };
  await prisma.user.update({
    where: { id: userId },
    data: { automationSettings: nextSettings as object },
  });
  return NextResponse.json(nextSettings);
}
