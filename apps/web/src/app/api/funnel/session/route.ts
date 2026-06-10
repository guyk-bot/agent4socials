import { NextRequest, NextResponse } from 'next/server';
import {
  createFunnelSession,
  FUNNEL_SESSION_COOKIE,
  getFunnelSessionByToken,
  markFunnelSessionConnected,
  saveFunnelBrandContextDraft,
  saveFunnelChatPayload,
  type FunnelChatPayload,
} from '@/lib/funnel-guest';
import type { BrandContextRecord } from '@/lib/brand-context-utils';

function readToken(req: NextRequest): string | null {
  return (
    req.headers.get('x-funnel-session')?.trim() ||
    req.cookies.get(FUNNEL_SESSION_COOKIE)?.value?.trim() ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(FUNNEL_SESSION_COOKIE)?.value?.trim();
    if (existingToken) {
      const existing = await getFunnelSessionByToken(existingToken);
      if (existing) {
        const res = NextResponse.json({
          token: existingToken,
          expiresAt: existing.expiresAt.toISOString(),
        });
        res.cookies.set(FUNNEL_SESSION_COOKIE, existingToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
        return res;
      }
    }

    const created = await createFunnelSession();
    const res = NextResponse.json({
      token: created.token,
      expiresAt: created.expiresAt.toISOString(),
    });
    res.cookies.set(FUNNEL_SESSION_COOKIE, created.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    console.error('[funnel/session] create failed', (e as Error)?.message);
    return NextResponse.json({ error: 'Could not create funnel session' }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  const token = readToken(req);
  const row = await getFunnelSessionByToken(token);
  if (!row) {
    return NextResponse.json({ error: 'Invalid funnel session' }, { status: 401 });
  }

  let connectedAccountId = row.connectedAccountId;
  let connectedPlatform = row.connectedPlatform;

  if (!connectedAccountId) {
    const { prisma } = await import('@/lib/db');
    const account = await prisma.socialAccount.findFirst({
      where: { userId: row.guestUserId, status: 'connected' },
      orderBy: { connectedAt: 'desc' },
      select: { id: true, platform: true },
    });
    if (account) {
      connectedAccountId = account.id;
      connectedPlatform = account.platform;
      await markFunnelSessionConnected(row.guestUserId, account.platform, account.id);
    }
  }

  let connectedUsername: string | null = null;
  let connectedProfilePicture: string | null = null;
  if (connectedAccountId) {
    const { prisma } = await import('@/lib/db');
    const account = await prisma.socialAccount.findUnique({
      where: { id: connectedAccountId },
      select: { username: true, profilePicture: true },
    });
    connectedUsername = account?.username ?? null;
    connectedProfilePicture = account?.profilePicture ?? null;
  }

  return NextResponse.json({
    messageCount: row.messageCount,
    connectedPlatform,
    connectedAccountId,
    connectedUsername,
    connectedProfilePicture,
    chatPayload: row.chatPayload,
    brandContextDraft: row.brandContextDraft,
  });
}

export async function PATCH(req: NextRequest) {
  const token = readToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing funnel session' }, { status: 401 });
  }
  let body: { chatPayload?: FunnelChatPayload; brandContextDraft?: BrandContextRecord };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.chatPayload) {
    await saveFunnelChatPayload(token, body.chatPayload);
  }
  if (body.brandContextDraft) {
    await saveFunnelBrandContextDraft(token, body.brandContextDraft);
  }
  return NextResponse.json({ ok: true });
}
