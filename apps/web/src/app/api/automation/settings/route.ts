import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const settings = await prisma.automationSettings.findUnique({
    where: { userId },
  });
  return NextResponse.json(
    settings ?? {
      dmWelcomeEnabled: false,
      dmWelcomeMessage: null,
      dmNewFollowerEnabled: false,
      dmNewFollowerMessage: null,
    }
  );
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
  const settings = await prisma.automationSettings.upsert({
    where: { userId },
    create: {
      userId,
      dmWelcomeEnabled: body.dmWelcomeEnabled ?? false,
      dmWelcomeMessage: body.dmWelcomeMessage ?? null,
      dmNewFollowerEnabled: body.dmNewFollowerEnabled ?? false,
      dmNewFollowerMessage: body.dmNewFollowerMessage ?? null,
    },
    update: {
      ...(typeof body.dmWelcomeEnabled === 'boolean' && { dmWelcomeEnabled: body.dmWelcomeEnabled }),
      ...(body.dmWelcomeMessage !== undefined && { dmWelcomeMessage: body.dmWelcomeMessage || null }),
      ...(typeof body.dmNewFollowerEnabled === 'boolean' && { dmNewFollowerEnabled: body.dmNewFollowerEnabled }),
      ...(body.dmNewFollowerMessage !== undefined && { dmNewFollowerMessage: body.dmNewFollowerMessage || null }),
    },
  });
  return NextResponse.json(settings);
}
