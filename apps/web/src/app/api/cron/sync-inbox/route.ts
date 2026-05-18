/**
 * POST /api/cron/sync-inbox
 *
 * Pre-warms the server-side inbox message cache (AppKv) for every connected
 * Instagram and Facebook account across all users.
 *
 * How it works:
 *   1. Load all connected IG / FB social accounts.
 *   2. For each account, fetch the first page of conversations from Meta's API.
 *   3. For each conversation that does NOT already have a fresh DB cache entry,
 *      fetch its messages and store them in AppKv (4-hour TTL).
 *   4. After the TTL expires, the next cron run re-warms it.
 *
 * Result: when any user opens a conversation it is served from the DB cache
 * instantly — zero Meta API calls, zero loading spinners.
 *
 * Schedule: every 30 minutes via cron-job.org (see docs/CRON_SCHEDULES.md).
 * Auth: X-Cron-Secret header (same as all other cron routes).
 * HTTP: GET or POST (cron-job.org defaults to GET; both are supported).
 *
 * Budget: aborts after SYNC_INBOX_BUDGET_MS to stay within Vercel's function
 * timeout. Conversations not reached in one run are handled by the next run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  isInboxMessagesCached,
  setInboxMessagesInDb,
} from '@/lib/inbox/inbox-db-cache';
import {
  loadInstagramBusinessConversationMessages,
  loadFacebookGraphConversationMessages,
} from '@/lib/inbox/load-meta-conversation-messages';
import { noteMetaUsageFromHeaders, isMetaNonCriticalThrottled } from '@/lib/meta-usage-guard';

export const maxDuration = 60;

const SYNC_INBOX_BUDGET_MS = parseInt(process.env.SYNC_INBOX_BUDGET_MS ?? '50000', 10); // 50s
/** Max conversations to sync per account per run (avoids exhausting Meta API in one shot). */
const MAX_CONVS_PER_ACCOUNT = 30;
const fbBase = facebookGraphBaseUrl;
const igBase = 'https://graph.instagram.com/v25.0';

type ConvItem = { id: string; updated_time?: string };

async function resolveLinkedPageId(
  userId: string,
  accessToken: string,
  credLinkedPageId?: string
): Promise<string | null> {
  if (credLinkedPageId) return credLinkedPageId;
  if (!accessToken) return null;
  try {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', accessToken },
      select: { platformUserId: true },
    });
    return fb?.platformUserId ?? null;
  } catch {
    return null;
  }
}

async function fetchConversationIds(
  account: {
    userId: string;
    platform: string;
    platformUserId: string;
    accessToken: string;
    credentialsJson: unknown;
  }
): Promise<ConvItem[]> {
  const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; igUserToken?: string; linkedPageId?: string };

  const isInstagram = account.platform === 'INSTAGRAM';
  const isInstagramBusinessLogin =
    isInstagram && cred.loginMethod === 'instagram_business';
  const linkedPageId = isInstagram && !isInstagramBusinessLogin
    ? await resolveLinkedPageId(account.userId, account.accessToken, cred.linkedPageId)
    : cred.linkedPageId ?? null;

  let url: string;
  let token: string;
  const params: Record<string, string> = { fields: 'id,updated_time', limit: '100' };

  if (isInstagramBusinessLogin) {
    url = `${igBase}/me/conversations`;
    token = account.accessToken;
  } else if (isInstagram && linkedPageId) {
    url = `${fbBase}/${linkedPageId}/conversations`;
    token = account.accessToken;
    params.platform = 'instagram';
  } else if (isInstagram) {
    url = `${igBase}/me/conversations`;
    token = account.accessToken;
  } else if (account.platform === 'FACEBOOK') {
    url = `${fbBase}/${account.platformUserId}/conversations`;
    token = account.accessToken;
  } else {
    return [];
  }

  params.access_token = token;
  try {
    const res = await axios.get<{ data?: ConvItem[]; error?: { message: string } }>(url, {
      params,
      timeout: 15_000,
    });
    noteMetaUsageFromHeaders(res.headers);
    if (res.data?.error) return [];
    return res.data?.data ?? [];
  } catch {
    return [];
  }
}

async function handle(request: NextRequest) {
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 });
  }

  const deadline = Date.now() + SYNC_INBOX_BUDGET_MS;
  const results: Record<string, { synced: number; skipped: number; errors: number }> = {};

  // Load all IG + FB accounts across all users (active only)
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
      accessToken: { not: '' },
    },
    select: {
      id: true,
      userId: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      credentialsJson: true,
    },
  });

  for (const account of accounts) {
    if (Date.now() >= deadline) break;
    if (isMetaNonCriticalThrottled()) break; // back off if rate-limited

    const key = `${account.platform}:${account.id}`;
    results[key] = { synced: 0, skipped: 0, errors: 0 };

    // Step 1: Get conversation list
    const convs = await fetchConversationIds(account);
    if (convs.length === 0) continue;

    const cred = (account.credentialsJson && typeof account.credentialsJson === 'object'
      ? account.credentialsJson : {}) as { loginMethod?: string; igUserToken?: string; linkedPageId?: string };
    const isInstagramBusinessLogin =
      account.platform === 'INSTAGRAM' && cred.loginMethod === 'instagram_business';
    const token = account.accessToken;
    const linkedPageIdForMsgs =
      account.platform === 'INSTAGRAM' && !isInstagramBusinessLogin
        ? await resolveLinkedPageId(account.userId, account.accessToken, cred.linkedPageId)
        : cred.linkedPageId ?? null;
    const ourIds = new Set<string>(
      [account.platformUserId, linkedPageIdForMsgs].filter((x): x is string => !!x)
    );

    // Step 2: For each conversation (newest first, up to cap), sync if not cached
    for (const conv of convs.slice(0, MAX_CONVS_PER_ACCOUNT)) {
      if (Date.now() >= deadline) break;
      if (isMetaNonCriticalThrottled()) break;

      // Skip if DB cache is still fresh
      const already = await isInboxMessagesCached(account.id, conv.id);
      if (already) { results[key].skipped++; continue; }

      // Fetch messages from Meta
      try {
        let msgs: Awaited<ReturnType<typeof loadFacebookGraphConversationMessages>>;
        if (isInstagramBusinessLogin) {
          msgs = await loadInstagramBusinessConversationMessages(conv.id, token, ourIds);
        } else {
          msgs = await loadFacebookGraphConversationMessages(conv.id, token, ourIds,
            account.platform === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK');
        }

        if (!msgs.error) {
          await setInboxMessagesInDb(account.id, conv.id, msgs.messages);
          results[key].synced++;
        }
      } catch {
        results[key].errors++;
      }

      // Small pause between conversations to avoid bursting Meta's API
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('[Cron] sync-inbox done:', JSON.stringify({ ok: true, accountCount: accounts.length, results }));

  return NextResponse.json({
    ok: true,
    ran: new Date().toISOString(),
    accountCount: accounts.length,
    results,
  });
}

export const GET = handle;
export const POST = handle;
