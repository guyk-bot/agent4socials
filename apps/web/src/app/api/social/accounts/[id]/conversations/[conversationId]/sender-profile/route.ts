import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { getInboxMessagesFromDb } from '@/lib/inbox/inbox-db-cache';
import { resolveConversationSenderProfile } from '@/lib/inbox/resolve-inbox-sender-profile';

/**
 * GET /api/social/accounts/[id]/conversations/[conversationId]/sender-profile
 * Resolves one thread's other-party name + avatar (lightweight; for inbox list backfill).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id, conversationId } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ message: 'Unsupported platform' }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ message: 'conversationId required' }, { status: 400 });
  }

  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };
  const isInstagramBusinessLogin =
    account.platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';

  const sendersParam = request.nextUrl.searchParams.get('senders');
  let senders: Array<{ id?: string; name?: string; username?: string; pictureUrl?: string | null }> = [];
  if (sendersParam) {
    try {
      const parsed = JSON.parse(sendersParam) as unknown;
      if (Array.isArray(parsed)) senders = parsed;
    } catch {
      /* ignore bad client payload */
    }
  }

  const profile = await resolveConversationSenderProfile({
    userId,
    platform: account.platform === 'INSTAGRAM' ? 'instagram' : 'facebook',
    conversationId,
    senders,
    accessToken: account.accessToken,
    isInstagramBusinessLogin,
    forceEnrich: true,
  });

  let name = profile.name ?? null;
  let username = profile.username ?? null;
  if (!name && !username) {
    const msgs = await getInboxMessagesFromDb(account.id, conversationId, null, true);
    const inbound = msgs?.find((m) => !m.isFromPage && m.fromName?.trim());
    if (inbound?.fromName?.trim()) {
      const raw = inbound.fromName.trim();
      if (raw.startsWith('@') || raw.includes('_')) username = raw.replace(/^@/, '');
      else name = raw;
    }
  }

  return NextResponse.json({
    senderId: profile.senderId,
    name,
    username,
    pictureUrl: profile.pictureUrl ?? null,
  });
}
