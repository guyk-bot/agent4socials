import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';
import { hasComposerBrandContext } from '@/lib/brand-context-utils';

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ message: 'AI is not configured (OPENAI_API_KEY)' }, { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { instructions?: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = user?.brandContext as Record<string, unknown> | null;
  if (!hasComposerBrandContext(ctx)) {
    return NextResponse.json(
      { message: 'Set up your brand context in Dashboard → AI Assistant first.' },
      { status: 400 }
    );
  }
  const saved = ctx as Record<string, unknown>;
  const brandBits = [
    saved.targetAudience,
    saved.toneOfVoice,
    saved.productDescription,
    saved.additionalContext,
  ]
    .filter((x) => typeof x === 'string' && x.trim())
    .join('\n');

  trackUsage(userId, 'ai_generation', 1);
  try {
    const result = await openAiChat(
      [
        {
          role: 'system',
          content:
            'You write short Instagram DM messages for comment automation. Plain text only, no hashtags, under 200 characters. Friendly and on-brand.',
        },
        {
          role: 'user',
          content: [
            brandBits && `Brand:\n${brandBits}`,
            context && `Context:\n${context}`,
            instructions && `Instructions:\n${instructions}`,
            'Write one DM message only.',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      { max_tokens: 120 }
    );
    const content = result.content.trim().slice(0, 200);
    if (!content) {
      return NextResponse.json({ message: 'AI returned an empty message. Try again.' }, { status: 502 });
    }
    return NextResponse.json({ content });
  } catch (e) {
    console.error('[OpenAI] generate-composer-dm', e instanceof Error ? e.message : e);
    return NextResponse.json({ message: 'AI service error. Try again later.' }, { status: 502 });
  }
}
