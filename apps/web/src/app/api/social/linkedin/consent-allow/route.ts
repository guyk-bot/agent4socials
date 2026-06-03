import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { finalizeLinkedInPendingConnect } from '@/lib/linkedin/finalize-pending-connect';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export const dynamic = 'force-dynamic';

type ConsentPreviewPayload = {
  step?: string;
  method?: LinkedInConnectMethod;
  returnTo?: string;
};

/**
 * POST /api/social/linkedin/consent-allow
 * User approved in-app permissions; finalize connect using tokens from the single LinkedIn OAuth trip.
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
  const payload = (pending.payload ?? {}) as ConsentPreviewPayload;
  if (payload.step !== 'consent_preview') {
    return NextResponse.json({ message: 'Invalid session' }, { status: 400 });
  }

  try {
    const { redirect } = await finalizeLinkedInPendingConnect(userId, previewId);
    return NextResponse.json({ redirect });
  } catch (e) {
    const message = (e as Error)?.message ?? 'Could not connect LinkedIn';
    const status = message === 'Expired' ? 410 : message === 'Not found or expired' ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
