import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { trackUsage } from '@/lib/usage-tracking';
import { generateInboxReply, type InboxReplyBrandContext } from '@/lib/ai/generate-inbox-reply-core';

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      {
        message:
          'AI replies are not enabled on the server. Add OPENAI_API_KEY in your hosting settings (e.g. Vercel Environment Variables), redeploy, then try again.',
      },
      { status: 503 }
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  trackUsage(userId, 'ai_generation');

  let body: { type?: string; text?: string; context?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const type = body.type === 'comment' || body.type === 'message' ? body.type : 'comment';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim().toUpperCase() : '';

  if (!text) {
    return NextResponse.json({ message: 'text is required (the message or comment to reply to)' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const brand = (user?.brandContext ?? null) as InboxReplyBrandContext | null;

  try {
    const reply = await generateInboxReply({ type, text, context, platform, brand });
    return NextResponse.json({ reply });
  } catch (e) {
    console.error('[OpenAI] generate-inbox-reply', e instanceof Error ? e.message : e);
    return NextResponse.json({ message: 'AI service error. Try again later.' }, { status: 502 });
  }
}
