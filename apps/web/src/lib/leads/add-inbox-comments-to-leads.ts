import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getInboxCommentsFromDb, type InboxCommentRow } from '@/lib/inbox/inbox-db-cache';
import { getSavedLeadsScan, saveLeadsScan } from '@/lib/leads/leads-scan-cache';
import type { ScannedLead } from '@/lib/leads/scan-leads';

function profileUrlFor(row: InboxCommentRow): string | null {
  const handle = (row.authorName ?? '').replace(/^@/, '').trim();
  const p = (row.platform ?? '').toUpperCase();
  if (handle && /^[a-zA-Z0-9._]+$/.test(handle)) {
    if (p === 'INSTAGRAM') return `https://instagram.com/${handle}`;
    if (p === 'TWITTER') return `https://twitter.com/${handle}`;
    if (p === 'TIKTOK') return `https://www.tiktok.com/@${handle}`;
    if (p === 'THREADS') return `https://www.threads.net/@${handle}`;
  }
  return row.postUrl ?? null;
}

function rowToLead(row: InboxCommentRow, accountId: string, intent: ScannedLead['intent']): ScannedLead {
  return {
    commentId: row.commentId,
    accountId,
    platform: row.platform,
    authorName: row.authorName,
    profileUrl: profileUrlFor(row),
    authorPictureUrl: row.authorPictureUrl ?? null,
    comment: row.text,
    postPreview: row.postPreview ?? 'Post',
    postUrl: row.postUrl ?? null,
    createdAt: row.createdAt,
    intent,
    reason: intent === 'low' ? 'Saved from inbox comment' : 'Potential lead from inbox',
    outreach: '',
  };
}

function leadDedupeKey(lead: Pick<ScannedLead, 'commentId' | 'authorName' | 'platform'>): string {
  const id = lead.commentId?.trim();
  if (id) return `id:${id}`;
  const author = (lead.authorName ?? '').trim().toLowerCase();
  const plat = (lead.platform ?? '').trim().toUpperCase();
  return `author:${plat}:${author}`;
}

export async function addInboxCommentsToLeads(
  userId: string,
  opts: {
    commentIds?: string[];
    platform?: Platform | null;
    defaultIntent?: ScannedLead['intent'];
    limit?: number;
  }
): Promise<{
  totalMatched: number;
  newCount: number;
  skippedExisting: number;
  leads: ScannedLead[];
  scanned: number;
  message: string;
  accountId: string | null;
}> {
  const defaultIntent = opts.defaultIntent ?? 'low';
  const idFilter = opts.commentIds?.length ? new Set(opts.commentIds) : null;

  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId,
      ...(opts.platform ? { platform: opts.platform } : {}),
    },
    select: { id: true, platform: true },
    orderBy: { createdAt: 'asc' },
  });

  const matched: Array<{ row: InboxCommentRow; accountId: string }> = [];
  for (const acc of accounts) {
    const cached = (await getInboxCommentsFromDb(acc.id)) ?? [];
    for (const row of cached) {
      if (row.isFromMe) continue;
      if (idFilter && !idFilter.has(row.commentId)) continue;
      matched.push({ row, accountId: acc.id });
    }
  }

  matched.sort(
    (a, b) => new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime()
  );
  const cap = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const slice = matched.slice(0, cap);

  const existing = (await getSavedLeadsScan(userId))?.leads ?? [];
  const existingKeys = new Set(existing.map((l) => leadDedupeKey(l)));

  const newLeads: ScannedLead[] = [];
  let skippedExisting = 0;
  for (const { row, accountId } of slice) {
    const candidate = rowToLead(row, accountId, defaultIntent);
    const key = leadDedupeKey(candidate);
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    existingKeys.add(key);
    newLeads.push(candidate);
  }

  const merged = [...newLeads, ...existing];
  const accountId = accounts.length === 1 ? accounts[0]!.id : null;
  await saveLeadsScan(userId, {
    accountId,
    scanned: slice.length,
    leads: merged,
    message:
      newLeads.length === 0
        ? skippedExisting > 0
          ? `All ${slice.length} comment${slice.length === 1 ? '' : 's'} were already in your leads list.`
          : 'No matching comments found in inbox cache.'
        : undefined,
  });

  const message =
    newLeads.length === 0
      ? skippedExisting > 0
        ? `${slice.length} comment${slice.length === 1 ? '' : 's'} matched; ${skippedExisting} already in Leads.`
        : 'No new comments to add. Open Inbox to sync comments first.'
      : `${slice.length} comment${slice.length === 1 ? '' : 's'} matched; ${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'} added (${skippedExisting} already saved).`;

  return {
    totalMatched: slice.length,
    newCount: newLeads.length,
    skippedExisting,
    leads: merged,
    scanned: slice.length,
    message,
    accountId,
  };
}
