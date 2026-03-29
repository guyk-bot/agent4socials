import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

const defaultSettings = {
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null as string | null,
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
    const s = user?.automationSettings as { dmWelcomeEnabled?: boolean; dmWelcomeMessage?: string | null; dmNewFollowerEnabled?: boolean; dmNewFollowerMessage?: string | null } | null;
    return NextResponse.json(s ? {
      dmWelcomeEnabled: s.dmWelcomeEnabled ?? false,
      dmWelcomeMessage: s.dmWelcomeMessage ?? null,
      dmNewFollowerEnabled: s.dmNewFollowerEnabled ?? false,
      dmNewFollowerMessage: s.dmNewFollowerMessage ?? null,
    } : defaultSettings);
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
  const nextSettings = {
    dmWelcomeEnabled: typeof body.dmWelcomeEnabled === 'boolean' ? body.dmWelcomeEnabled : (current.dmWelcomeEnabled as boolean) ?? false,
    dmWelcomeMessage: body.dmWelcomeMessage !== undefined ? (body.dmWelcomeMessage || null) : (current.dmWelcomeMessage as string | null) ?? null,
    dmNewFollowerEnabled: typeof body.dmNewFollowerEnabled === 'boolean' ? body.dmNewFollowerEnabled : (current.dmNewFollowerEnabled as boolean) ?? false,
    dmNewFollowerMessage: body.dmNewFollowerMessage !== undefined ? (body.dmNewFollowerMessage || null) : (current.dmNewFollowerMessage as string | null) ?? null,
  };
  await prisma.user.update({
    where: { id: userId },
    data: { automationSettings: nextSettings as object },
  });
  return NextResponse.json(nextSettings);
}
