import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export const dynamic = 'force-dynamic';

type ConsentPreviewPayload = {
  step?: string;
  method?: LinkedInConnectMethod;
  memberName?: string;
  memberPicture?: string | null;
};

/**
 * GET /api/social/linkedin/consent-preview?previewId=
 * Member name and photo after LinkedIn identity sign-in (before full connect scopes).
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const previewId = request.nextUrl.searchParams.get('previewId')?.trim();
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
  const method = payload.method === 'page' ? 'page' : 'personal';
  const res = NextResponse.json({
    method,
    memberName: typeof payload.memberName === 'string' ? payload.memberName : null,
    memberPicture: typeof payload.memberPicture === 'string' ? payload.memberPicture : null,
  });
  res.headers.set('Cache-Control', 'private, no-store, must-revalidate');
  return res;
}
