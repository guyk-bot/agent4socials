import { prisma } from '@/lib/db';
import type { InboxReplyBrandContext } from '@/lib/ai/generate-inbox-reply-core';

/** Built-in examples for beta testers when AI Assistant reply examples are not saved yet. */
export const DEFAULT_BETA_COMMENT_REPLY_EXAMPLES = [
  'Thanks for your comment! We appreciate you reaching out.',
  'Great question! Check your DMs for the link.',
  'Thanks! Comment received, we will get back to you shortly.',
].join('\n');

export const DEFAULT_BETA_INBOX_REPLY_EXAMPLES = [
  'Thanks for your message! How can we help?',
  'Hi! Thanks for reaching out, we will reply shortly.',
].join('\n');

function parseCsvSet(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function betaEmailAllowlist(): Set<string> {
  const emails = new Set(parseCsvSet(process.env.AI_INBOX_BETA_EMAILS));
  for (const e of parseCsvSet(process.env.ADMIN_USAGE_EMAILS)) {
    emails.add(e);
  }
  return emails;
}

/** True for allowlisted testers (env). New users are not on this list. */
export async function isAiInboxBetaUser(userId: string): Promise<boolean> {
  const idAllow = parseCsvSet(process.env.AI_INBOX_BETA_USER_IDS);
  if (idAllow.has(userId.toLowerCase())) return true;

  const emailAllow = betaEmailAllowlist();
  if (emailAllow.size === 0) return false;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!u?.email) return false;
  return emailAllow.has(u.email.trim().toLowerCase());
}

/** Merge saved brand context with beta defaults so OpenAI has reply style examples. */
export function brandContextForInboxAi(
  brand: InboxReplyBrandContext | null,
  isBeta: boolean
): InboxReplyBrandContext | null {
  if (!isBeta) return brand;
  const base = brand ?? {};
  return {
    ...base,
    commentReplyExamples:
      (base.commentReplyExamples?.trim() || DEFAULT_BETA_COMMENT_REPLY_EXAMPLES).slice(0, 1000),
    inboxReplyExamples:
      (base.inboxReplyExamples?.trim() || DEFAULT_BETA_INBOX_REPLY_EXAMPLES).slice(0, 1000),
  };
}
