import { NextResponse } from 'next/server';
import type { ChatHeroPainPointId, ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { tryHandleFunnelGuestAction } from '@/lib/funnel-guest-actions';
import { respondLandingChat } from '@/lib/landing-chat-respond';
import {
  funnelSessionLimitMessage,
  getFunnelSessionByToken,
  incrementFunnelMessageCount,
} from '@/lib/funnel-guest';

export const runtime = 'nodejs';
export const maxDuration = 45;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > RATE_MAX;
}

type Body = {
  text?: string;
  step?: 0 | 1 | 2 | 3;
  matchedPlatforms?: ChatHeroPlatformId[];
  matchedPain?: ChatHeroPainPointId | null;
  selectedPlatformIds?: ChatHeroPlatformId[];
  connectedAccountId?: string | null;
  funnelFlowStep?: string | null;
  brandContextDraft?: Record<string, unknown> | null;
  hashtagPool?: string | null;
};

export async function POST(req: Request) {
  const key = clientKey(req);
  if (rateLimited(key)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 500) {
    return NextResponse.json({ error: 'Message is required (max 500 characters).' }, { status: 400 });
  }

  const step = body.step ?? 0;
  if (step < 0 || step > 3) {
    return NextResponse.json({ error: 'Invalid funnel step' }, { status: 400 });
  }

  const funnelToken = req.headers.get('x-funnel-session')?.trim() || null;
  let funnelSession: Awaited<ReturnType<typeof getFunnelSessionByToken>> = null;
  if (funnelToken) {
    funnelSession = await getFunnelSessionByToken(funnelToken);
    if (!funnelSession) {
      return NextResponse.json({ text: funnelSessionLimitMessage(), source: 'script', limited: true });
    }
    const { limited } = await incrementFunnelMessageCount(funnelToken);
    if (limited) {
      return NextResponse.json({ text: funnelSessionLimitMessage(), source: 'script', limited: true });
    }
  }

  const chatCtx = {
    step,
    text,
    matchedPlatforms: Array.isArray(body.matchedPlatforms) ? body.matchedPlatforms : [],
    matchedPain: body.matchedPain ?? null,
    selectedPlatformIds: Array.isArray(body.selectedPlatformIds) ? body.selectedPlatformIds : [],
    connectedAccountId: typeof body.connectedAccountId === 'string' ? body.connectedAccountId : null,
    funnelFlowStep: typeof body.funnelFlowStep === 'string' ? body.funnelFlowStep : null,
    brandContextDraft:
      body.brandContextDraft && typeof body.brandContextDraft === 'object'
        ? (body.brandContextDraft as Record<string, unknown>)
        : null,
  };

  const guestAction = await tryHandleFunnelGuestAction(chatCtx, funnelToken);
  if (guestAction) {
    return NextResponse.json(guestAction);
  }

  const result = await respondLandingChat(chatCtx, {
    guestUserId: funnelSession?.guestUserId ?? null,
    hashtagPool: typeof body.hashtagPool === 'string' ? body.hashtagPool : '',
  });

  return NextResponse.json(result);
}
