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
  dmNewFollowerEnabledByPlatform: Record<string, boolean>;
  dmNewFollowerMessagesByPlatform: Record<string, string | null>;
  /** Optional keyword automation steps (stored in same JSON blob). */
  keywordAutomationSteps?: unknown[];
};

const emptySettings = (): AutomationSettingsStored => ({
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null,
  dmWelcomeEnabledByPlatform: {},
  dmWelcomeMessagesByPlatform: {},
  dmWelcomeAttachmentsByPlatform: {},
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
  dmNewFollowerEnabledByPlatform: {},
  dmNewFollowerMessagesByPlatform: {},
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

  let newFollowerEnabledBy = safeRecordStrings(s.dmNewFollowerEnabledByPlatform);
  let newFollowerMessagesBy = safeRecordNullableStrings(s.dmNewFollowerMessagesByPlatform);
  const legacyNewFollowerEnabled = s.dmNewFollowerEnabled === true;
  const legacyNewFollowerMsg =
    typeof s.dmNewFollowerMessage === 'string' && s.dmNewFollowerMessage.trim() ? s.dmNewFollowerMessage.trim() : null;
  if (Object.keys(newFollowerEnabledBy).length === 0 && legacyNewFollowerEnabled && legacyNewFollowerMsg) {
    newFollowerEnabledBy = { 'X (Twitter)': true };
    newFollowerMessagesBy = { 'X (Twitter)': legacyNewFollowerMsg };
  }

  const anyNewFollowerEnabled =
    Object.values(newFollowerEnabledBy).some(Boolean) || legacyNewFollowerEnabled;

  const out: AutomationSettingsStored = {
    dmWelcomeEnabled: anyEnabled,
    dmWelcomeMessage: typeof s.dmWelcomeMessage === 'string' || s.dmWelcomeMessage === null ? (s.dmWelcomeMessage as string | null) : null,
    dmWelcomeEnabledByPlatform: enabledBy,
    dmWelcomeMessagesByPlatform: messagesBy,
    dmWelcomeAttachmentsByPlatform: attachments,
    dmNewFollowerEnabled: anyNewFollowerEnabled,
    dmNewFollowerMessage:
      typeof s.dmNewFollowerMessage === 'string' || s.dmNewFollowerMessage === null
        ? (s.dmNewFollowerMessage as string | null)
        : null,
    dmNewFollowerEnabledByPlatform: newFollowerEnabledBy,
    dmNewFollowerMessagesByPlatform: newFollowerMessagesBy,
  };
  if (Array.isArray(s.keywordAutomationSteps)) {
    out.keywordAutomationSteps = s.keywordAutomationSteps as unknown[];
  }
  return out;
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
  let body: Partial<AutomationSettingsStored> & { keywordAutomationSteps?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { automationSettings: true } });
  const existingRaw =
    user?.automationSettings && typeof user.automationSettings === 'object' && !Array.isArray(user.automationSettings)
      ? ({ ...(user.automationSettings as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const merged = normalizeFromDb(existingRaw);

  const patchEnabled = body.dmWelcomeEnabledByPlatform !== undefined ? safeRecordStrings(body.dmWelcomeEnabledByPlatform) : undefined;
  const nextEnabledBy =
    patchEnabled !== undefined ? { ...merged.dmWelcomeEnabledByPlatform, ...patchEnabled } : merged.dmWelcomeEnabledByPlatform;

  const patchMessages = body.dmWelcomeMessagesByPlatform !== undefined ? safeRecordNullableStrings(body.dmWelcomeMessagesByPlatform) : undefined;
  const nextMessagesBy =
    patchMessages !== undefined ? { ...merged.dmWelcomeMessagesByPlatform, ...patchMessages } : merged.dmWelcomeMessagesByPlatform;

  const patchAttachments = body.dmWelcomeAttachmentsByPlatform !== undefined ? safeAttachmentsMap(body.dmWelcomeAttachmentsByPlatform) : undefined;
  const nextAttachments =
    patchAttachments !== undefined ? { ...merged.dmWelcomeAttachmentsByPlatform, ...patchAttachments } : merged.dmWelcomeAttachmentsByPlatform;

  const patchNewFollowerEnabled =
    body.dmNewFollowerEnabledByPlatform !== undefined ? safeRecordStrings(body.dmNewFollowerEnabledByPlatform) : undefined;
  const nextNewFollowerEnabledBy =
    patchNewFollowerEnabled !== undefined
      ? { ...merged.dmNewFollowerEnabledByPlatform, ...patchNewFollowerEnabled }
      : merged.dmNewFollowerEnabledByPlatform;

  const patchNewFollowerMessages =
    body.dmNewFollowerMessagesByPlatform !== undefined ? safeRecordNullableStrings(body.dmNewFollowerMessagesByPlatform) : undefined;
  const nextNewFollowerMessagesBy =
    patchNewFollowerMessages !== undefined
      ? { ...merged.dmNewFollowerMessagesByPlatform, ...patchNewFollowerMessages }
      : merged.dmNewFollowerMessagesByPlatform;

  const nextDm: AutomationSettingsStored = {
    dmWelcomeEnabled:
      typeof body.dmWelcomeEnabled === 'boolean' ? body.dmWelcomeEnabled : Object.values(nextEnabledBy).some(Boolean),
    dmWelcomeMessage: body.dmWelcomeMessage !== undefined ? body.dmWelcomeMessage : merged.dmWelcomeMessage,
    dmWelcomeEnabledByPlatform: nextEnabledBy,
    dmWelcomeMessagesByPlatform: nextMessagesBy,
    dmWelcomeAttachmentsByPlatform: nextAttachments,
    dmNewFollowerEnabled:
      typeof body.dmNewFollowerEnabled === 'boolean'
        ? body.dmNewFollowerEnabled
        : Object.values(nextNewFollowerEnabledBy).some(Boolean),
    dmNewFollowerMessage:
      body.dmNewFollowerMessage !== undefined ? body.dmNewFollowerMessage : merged.dmNewFollowerMessage,
    dmNewFollowerEnabledByPlatform: nextNewFollowerEnabledBy,
    dmNewFollowerMessagesByPlatform: nextNewFollowerMessagesBy,
  };

  const nextStored: Record<string, unknown> = {
    ...existingRaw,
    ...nextDm,
  };
  if (body.keywordAutomationSteps !== undefined) {
    nextStored.keywordAutomationSteps = body.keywordAutomationSteps;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { automationSettings: nextStored as object },
  });
  return NextResponse.json(normalizeFromDb(nextStored));
}
