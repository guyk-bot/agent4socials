import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { trackUsage } from '@/lib/usage-tracking';
import { generateInboxReply, type InboxReplyBrandContext } from '@/lib/ai/generate-inbox-reply-core';
import { brandContextForInboxAi, isAiInboxBetaUser } from '@/lib/ai/inbox-ai-beta';
import { hasCommentReplyExamples, hasInboxReplyExamples } from '@/lib/brand-context-utils';

const MAX_BATCH_ITEMS = 25;

type BatchItem = {
  id: string;
  text: string;
  context?: string;
  platform?: string;
};

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

  let body: { type?: string; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const type = body.type === 'comment' || body.type === 'message' ? body.type : 'comment';
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: BatchItem[] = rawItems
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      const text = typeof r.text === 'string' ? r.text.trim() : '';
      if (!id || !text) return null;
      return {
        id,
        text,
        ...(typeof r.context === 'string' && r.context.trim() ? { context: r.context.trim() } : {}),
        ...(typeof r.platform === 'string' && r.platform.trim()
          ? { platform: r.platform.trim().toUpperCase() }
          : {}),
      };
    })
    .filter((x): x is BatchItem => x !== null)
    .slice(0, MAX_BATCH_ITEMS);

  if (items.length === 0) {
    return NextResponse.json({ message: 'items array is required (id + text per comment or message)' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const rawBrand = (user?.brandContext ?? null) as InboxReplyBrandContext | null;
  const isBeta = await isAiInboxBetaUser(userId);
  const hasExamples =
    type === 'comment' ? hasCommentReplyExamples(rawBrand) : hasInboxReplyExamples(rawBrand);
  if (!hasExamples && !isBeta) {
    return NextResponse.json(
      {
        message:
          type === 'comment'
            ? 'Add comment reply examples in Dashboard → AI Assistant before using bulk AI comment replies.'
            : 'Add inbox reply examples in Dashboard → AI Assistant before using bulk AI message replies.',
      },
      { status: 400 }
    );
  }
  const brand = brandContextForInboxAi(rawBrand, isBeta);

  trackUsage(userId, 'ai_generation', items.length);

  try {
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const reply = await generateInboxReply({
            type,
            text: item.text,
            context: item.context,
            platform: item.platform,
            brand,
          });
          return { id: item.id, reply, error: null as string | null };
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to generate reply';
          return { id: item.id, reply: null as string | null, error: msg };
        }
      })
    );

    const replies: Record<string, string> = {};
    const errors: Record<string, string> = {};
    for (const r of results) {
      if (r.reply) replies[r.id] = r.reply;
      else if (r.error) errors[r.id] = r.error;
    }

    return NextResponse.json({
      replies,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    });
  } catch (e) {
    console.error('[OpenAI] generate-inbox-reply-batch', e instanceof Error ? e.message : e);
    return NextResponse.json({ message: 'AI service error. Try again later.' }, { status: 502 });
  }
}
