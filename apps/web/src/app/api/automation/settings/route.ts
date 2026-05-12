import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export type DmWelcomeAttachment = {
  fileUrl: string;
  fileName?: string;
  contentType?: string;
  kind: 'image' | 'video' | 'file';
};

type AutomationSettingsStored = {
  dmWelcomeEnabled: boolean;
  dmWelcomeMessage: string | null;
  dmWelcomeEnabledByPlatform: Record<string, boolean>;
  dmWelcomeMessagesByPlatform: Record<string, string | null>;
  dmWelcomeAttachmentsByPlatform: Record<string, DmWelcomeAttachment[]>;
  dmNewFollowerEnabled: boolean;
  dmNewFollowerMessage: string | null;
};

const emptySettings = (): AutomationSettingsStored => ({
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null,
  dmWelcomeEnabledByPlatform: {},
  dmWelcomeMessagesByPlatform: {},
  dmWelcomeAttachmentsByPlatform: {},
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
});

function safeRecordStrings(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

function safeRecordNullableStrings(v: unknown): Record<string, string | null> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string | null> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === null || val === undefined) out[k] = null;
    else if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function safeAttachmentsMap(v: unknown): Record<string, DmWelcomeAttachment[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, DmWelcomeAttachment[]>;
}

/** Normalize DB JSON including legacy single-platform flags. */
function normalizeFromDb(raw: unknown): AutomationSettingsStored {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let enabledBy = safeRecordStrings(s.dmWelcomeEnabledByPlatform);
  let messagesBy = safeRecordNullableStrings(s.dmWelcomeMessagesByPlatform);
  const attachments = safeAttachmentsMap(s.dmWelcomeAttachmentsByPlatform);

  const legacyEnabled = s.dmWelcomeEnabled === true;
  const legacyMsg = typeof s.dmWelcomeMessage === 'string' ? s.dmWelcomeMessage : null;
  if (Object.keys(enabledBy).length === 0 && legacyEnabled && legacyMsg?.trim()) {
    enabledBy = { Instagram: true };
    messagesBy = { Instagram: legacyMsg };
  }

  const anyEnabled = Object.values(enabledBy).some(Boolean) || legacyEnabled;
  return {
    dmWelcomeEnabled: anyEnabled,
    dmWelcomeMessage: typeof s.dmWelcomeMessage === 'string' || s.dmWelcomeMessage === null ? (s.dmWelcomeMessage as string | null) : null,
    dmWelcomeEnabledByPlatform: enabledBy,
    dmWelcomeMessagesByPlatform: messagesBy,
    dmWelcomeAttachmentsByPlatform: attachments,
    dmNewFollowerEnabled: s.dmNewFollowerEnabled === true,
    dmNewFollowerMessage: typeof s.dmNewFollowerMessage === 'string' || s.dmNewFollowerMessage === null ? (s.dmNewFollowerMessage as string | null) : null,
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(emptySettings());
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
    return NextResponse.json(normalizeFromDb(user?.automationSettings ?? null));
  } catch (e) {
    console.error('[Automation GET]', e);
    return NextResponse.json(emptySettings());
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
  let body: Partial<AutomationSettingsStored>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { automationSettings: true } });
  const merged = normalizeFromDb(user?.automationSettings ?? null);

  const nextEnabledBy =
    body.dmWelcomeEnabledByPlatform !== undefined ? safeRecordStrings(body.dmWelcomeEnabledByPlatform) : merged.dmWelcomeEnabledByPlatform;
  const nextMessagesBy =
    body.dmWelcomeMessagesByPlatform !== undefined
      ? safeRecordNullableStrings(body.dmWelcomeMessagesByPlatform)
      : merged.dmWelcomeMessagesByPlatform;
  const nextAttachments =
    body.dmWelcomeAttachmentsByPlatform !== undefined
      ? safeAttachmentsMap(body.dmWelcomeAttachmentsByPlatform)
      : merged.dmWelcomeAttachmentsByPlatform;

  const nextSettings: AutomationSettingsStored = {
    dmWelcomeEnabled:
      typeof body.dmWelcomeEnabled === 'boolean' ? body.dmWelcomeEnabled : Object.values(nextEnabledBy).some(Boolean),
    dmWelcomeMessage: body.dmWelcomeMessage !== undefined ? body.dmWelcomeMessage : merged.dmWelcomeMessage,
    dmWelcomeEnabledByPlatform: nextEnabledBy,
    dmWelcomeMessagesByPlatform: nextMessagesBy,
    dmWelcomeAttachmentsByPlatform: nextAttachments,
    dmNewFollowerEnabled:
      typeof body.dmNewFollowerEnabled === 'boolean' ? body.dmNewFollowerEnabled : merged.dmNewFollowerEnabled,
    dmNewFollowerMessage:
      body.dmNewFollowerMessage !== undefined ? body.dmNewFollowerMessage : merged.dmNewFollowerMessage,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { automationSettings: nextSettings as object },
  });
  return NextResponse.json(nextSettings);
}
