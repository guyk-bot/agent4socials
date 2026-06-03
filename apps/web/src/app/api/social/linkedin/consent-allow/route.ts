import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { buildLinkedInOAuthAuthorizationUrl } from '@/lib/linkedin/build-oauth-authorization-url';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export const dynamic = 'force-dynamic';

type ConsentPreviewPayload = {
  step?: string;
  method?: LinkedInConnectMethod;
  memberName?: string;
  memberPicture?: string | null;
  returnTo?: string;
  consentApproved?: boolean;
};

/**
 * POST /api/social/linkedin/consent-allow
 * User approved in-app permissions; start full LinkedIn OAuth (same session, extra scopes).
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: { previewId?: string; returnTo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const previewId = body.previewId?.trim();
  if (!previewId) {
    return NextResponse.json({ message: 'Missing previewId' }, { status: 400 });
  }
  const pending = await prisma.pendingConnection.findUnique({ where: { id: previewId } });
  if (!pending || pending.userId !== userId || pending.platform !== 'LINKEDIN') {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  if (pending.expiresAt && new Date() > pending.expiresAt) {
    await prisma.pendingConnection.delete({ where: { id: previewId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const payload = (pending.payload ?? {}) as ConsentPreviewPayload;
  if (payload.step !== 'consent_preview') {
    return NextResponse.json({ message: 'Invalid session' }, { status: 400 });
  }
  const method: LinkedInConnectMethod = payload.method === 'page' ? 'page' : 'personal';
  const returnTo =
    typeof body.returnTo === 'string' && body.returnTo.startsWith('/')
      ? body.returnTo
      : typeof payload.returnTo === 'string' && payload.returnTo.startsWith('/')
        ? payload.returnTo
        : '/dashboard?connect=LINKEDIN';

  await prisma.pendingConnection.update({
    where: { id: previewId },
    data: {
      payload: {
        ...payload,
        consentApproved: true,
        returnTo,
      },
    },
  });

  const url = buildLinkedInOAuthAuthorizationUrl(userId, { method, previewId });
  return NextResponse.json({ url });
}
