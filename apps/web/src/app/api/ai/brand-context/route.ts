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
  try {
    const brandContext = await prisma.brandContext.findUnique({
      where: { userId },
    });
    return NextResponse.json(brandContext ?? null);
  } catch (e) {
    console.error('[Brand context GET]', e);
    return NextResponse.json({ message: 'Failed to load brand context' }, { status: 500 });
  }
}

const MAX_LENGTH = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
} as const;

function truncate(s: string | null | undefined, max: number): string | null {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim().slice(0, max);
  return t || null;
}

const bodySchema = {
  targetAudience: undefined as string | null | undefined,
  toneOfVoice: undefined as string | null | undefined,
  toneExamples: undefined as string | null | undefined,
  productDescription: undefined as string | null | undefined,
  additionalContext: undefined as string | null | undefined,
};

export async function PUT(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: typeof bodySchema;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const data = {
    targetAudience: truncate(body.targetAudience, MAX_LENGTH.targetAudience),
    toneOfVoice: truncate(body.toneOfVoice, MAX_LENGTH.toneOfVoice),
    toneExamples: truncate(body.toneExamples, MAX_LENGTH.toneExamples),
    productDescription: truncate(body.productDescription, MAX_LENGTH.productDescription),
    additionalContext: truncate(body.additionalContext, MAX_LENGTH.additionalContext),
  };
  try {
    const existing = await prisma.brandContext.findUnique({ where: { userId } });
    const brandContext = existing
      ? await prisma.brandContext.update({ where: { userId }, data })
      : await prisma.brandContext.create({ data: { userId, ...data } });
    return NextResponse.json(brandContext);
  } catch (e) {
    console.error('[Brand context PUT]', e);
    const prismaError = e as { code?: string; message?: string };
    let msg = 'Failed to save. Try again in a moment or log out and back in.';
    if (prismaError?.code === 'P2002') msg = 'This profile is already in use. Try refreshing the page.';
    else if (prismaError?.code === 'P2025' || prismaError?.message?.includes('Record to update not found')) msg = 'Session may have changed. Please refresh the page and try again.';
    else if (prismaError?.message?.includes('connect') || prismaError?.message?.includes('timeout')) msg = 'Database temporarily unavailable. Please try again in a moment.';
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
