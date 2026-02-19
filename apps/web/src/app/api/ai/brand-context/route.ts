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
    targetAudience: body.targetAudience ?? null,
    toneOfVoice: body.toneOfVoice ?? null,
    toneExamples: body.toneExamples ?? null,
    productDescription: body.productDescription ?? null,
    additionalContext: body.additionalContext ?? null,
  };
  try {
    const brandContext = await prisma.brandContext.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return NextResponse.json(brandContext);
  } catch (e) {
    console.error('[Brand context PUT]', e);
    return NextResponse.json({ message: 'Failed to save brand context' }, { status: 500 });
  }
}
