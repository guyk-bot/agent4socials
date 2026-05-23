import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import {
  getInboxCommentsFromDb,
  getInboxConversationListFromDb,
} from '@/lib/inbox/inbox-db-cache';
import { enrichConversationListFromMessageCache } from '@/lib/inbox/enrich-conversations-from-messages';
import { mergeInboxProfileCacheIntoConversations } from '@/lib/inbox/resolve-inbox-sender-profile';

/**
 * GET /api/inbox/bootstrap
 * One call for Inbox UI: DB-backed comments + conversations (with profile + message-cache names).
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, status: 'connected' },
    select: { id: true, platform: true },
  });

  const commentsByAccountId: Record<string, unknown[]> = {};
  const conversationsByAccountId: Record<string, unknown[]> = {};

  for (const acc of accounts) {
    if (
      acc.platform === 'INSTAGRAM' ||
      acc.platform === 'FACEBOOK' ||
      acc.platform === 'TWITTER' ||
      acc.platform === 'YOUTUBE' ||
      acc.platform === 'LINKEDIN' ||
      acc.platform === 'PINTEREST' ||
      acc.platform === 'THREADS'
    ) {
      const storedComments = await getInboxCommentsFromDb(acc.id);
      if (storedComments?.length) {
        commentsByAccountId[acc.id] = storedComments.map((c) => ({
          ...c,
          accountId: c.accountId ?? acc.id,
          platform: c.platform ?? acc.platform,
        }));
      }
    }

    if (acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK' || acc.platform === 'TWITTER') {
      const storedConvs = await getInboxConversationListFromDb(acc.id);
      if (storedConvs?.length) {
        const profilePlatform = acc.platform === 'INSTAGRAM' ? 'instagram' : 'facebook';
        let list =
          acc.platform === 'TWITTER'
            ? storedConvs
            : await mergeInboxProfileCacheIntoConversations(profilePlatform, storedConvs);
        if (acc.platform !== 'TWITTER') {
          list = await enrichConversationListFromMessageCache(acc.id, profilePlatform, list);
        }
        conversationsByAccountId[acc.id] = list.map((c) => ({
          ...c,
          platform: acc.platform,
        }));
      }
    }
  }

  return NextResponse.json({
    commentsByAccountId,
    conversationsByAccountId,
  });
}
