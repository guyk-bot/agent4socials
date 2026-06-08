import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';
import { getInboxCommentsFromDb, type InboxCommentRow } from '@/lib/inbox/inbox-db-cache';

export const maxDuration = 60;

/** Keep the AI fan-out bounded so a viral account does not blow the function budget. */
const MAX_COMMENTS_TO_SCAN = 80;
const CHUNK_SIZE = 40;

type Lead = {
  commentId: string;
  accountId: string;
  platform: string;
  authorName: string;
  profileUrl: string | null;
  authorPictureUrl: string | null;
  comment: string;
  postPreview: string;
  postUrl: string | null;
  createdAt: string;
  intent: 'high' | 'medium';
  reason: string;
  outreach: string;
};

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

type BrandFields = {
  targetAudience: string | null;
  toneOfVoice: string | null;
  productDescription: string | null;
  additionalContext: string | null;
};

function brandLines(brand: BrandFields): string {
  const parts: string[] = [];
  if (brand.targetAudience?.trim()) parts.push(`Target audience: ${brand.targetAudience.trim()}`);
  if (brand.toneOfVoice?.trim()) parts.push(`Tone of voice: ${brand.toneOfVoice.trim()}`);
  if (brand.productDescription?.trim()) parts.push(`Product/service: ${brand.productDescription.trim()}`);
  if (brand.additionalContext?.trim()) parts.push(`Additional context: ${brand.additionalContext.trim()}`);
  return parts.join('\n');
}

function parseLeadsJson(raw: string): Array<{ i: number; intent?: string; reason?: string; outreach?: string }> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { leads?: unknown };
    if (!Array.isArray(parsed.leads)) return [];
    return parsed.leads
      .map((l) => l as { i?: unknown; intent?: unknown; reason?: unknown; outreach?: unknown })
      .filter((l) => typeof l.i === 'number')
      .map((l) => ({
        i: l.i as number,
        intent: typeof l.intent === 'string' ? l.intent : undefined,
        reason: typeof l.reason === 'string' ? l.reason : undefined,
        outreach: typeof l.outreach === 'string' ? l.outreach : undefined,
      }));
  } catch {
    return [];
  }
}

async function classifyChunk(
  brand: BrandFields,
  rows: InboxCommentRow[],
  startIndex: number
): Promise<Map<number, { intent: 'high' | 'medium'; reason: string; outreach: string }>> {
  const lines = brandLines(brand);
  const systemPrompt = [
    'You identify potential customers (leads) from social media comments and write short outreach DMs.',
    lines ? `Brand context:\n${lines}` : 'No brand context provided; treat buying-intent broadly.',
    'A lead is someone who shows interest in the product/service, asks about price/availability, wants to buy, asks how it works, or expresses a need it solves. Ignore spam, generic praise ("nice!", emojis only), self-promo, and your own replies.',
    'For each lead, write a friendly, personalized outreach message (1 to 2 sentences) the brand could DM them, referencing their comment naturally. No markdown, no hashtags, no em dashes or en dashes.',
    'Respond with JSON only: {"leads":[{"i":<index>,"intent":"high"|"medium","reason":"why they are a lead (short)","outreach":"the DM"}]}. Only include real leads. If none, return {"leads":[]}.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const numbered = rows
    .map((r, idx) => `[${startIndex + idx}] @${(r.authorName ?? 'user').replace(/^@/, '')} on post "${(r.postPreview ?? '').slice(0, 60)}": ${(r.text ?? '').slice(0, 300)}`)
    .join('\n');

  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Comments:\n${numbered}` },
    ],
    { max_tokens: 1500, response_format: { type: 'json_object' } }
  );

  const out = new Map<number, { intent: 'high' | 'medium'; reason: string; outreach: string }>();
  for (const lead of parseLeadsJson(result.content)) {
    const intent = lead.intent === 'high' ? 'high' : 'medium';
    out.set(lead.i, {
      intent,
      reason: (lead.reason ?? '').slice(0, 280),
      outreach: (lead.outreach ?? '').slice(0, 600),
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ message: 'Lead mining needs OPENAI_API_KEY' }, { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { accountId?: string } = {};
  try {
    body = (await request.json()) as { accountId?: string };
  } catch {
    /* allow empty body = scan all accounts */
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, ...(body.accountId ? { id: body.accountId } : {}) },
    select: { id: true, platform: true, username: true },
  });
  if (accounts.length === 0) {
    return NextResponse.json({ leads: [], scanned: 0, message: 'No connected accounts to scan.' });
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const allComments: InboxCommentRow[] = [];
  for (const acc of accounts) {
    const cached = (await getInboxCommentsFromDb(acc.id)) ?? [];
    for (const c of cached) {
      if (c.isFromMe) continue;
      if (c.openOnPlatformOnly) continue;
      if (!c.text || !c.text.trim()) continue;
      allComments.push({ ...c, accountId: acc.id, platform: c.platform || acc.platform });
    }
  }

  if (allComments.length === 0) {
    return NextResponse.json({
      leads: [],
      scanned: 0,
      message: 'No comments cached yet. Open Inbox for your accounts so comments load, then scan again.',
    });
  }

  const seen = new Set<string>();
  const deduped = allComments.filter((c) => {
    if (seen.has(c.commentId)) return false;
    seen.add(c.commentId);
    return true;
  });
  deduped.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const toScan = deduped.slice(0, MAX_COMMENTS_TO_SCAN);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = (user?.brandContext as Record<string, unknown> | null) ?? {};
  const brand: BrandFields = {
    targetAudience: (ctx.targetAudience as string | undefined) ?? null,
    toneOfVoice: (ctx.toneOfVoice as string | undefined) ?? null,
    productDescription: (ctx.productDescription as string | undefined) ?? null,
    additionalContext: (ctx.additionalContext as string | undefined) ?? null,
  };

  trackUsage(userId, 'ai_generation', Math.ceil(toScan.length / CHUNK_SIZE));

  const classified = new Map<number, { intent: 'high' | 'medium'; reason: string; outreach: string }>();
  try {
    for (let i = 0; i < toScan.length; i += CHUNK_SIZE) {
      const chunk = toScan.slice(i, i + CHUNK_SIZE);
      const chunkResult = await classifyChunk(brand, chunk, i);
      for (const [k, v] of chunkResult) classified.set(k, v);
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error('[leads/scan]', raw);
    return NextResponse.json(
      { message: raw.length < 280 ? raw : 'Lead scan failed. Try again.' },
      { status: 502 }
    );
  }

  const leads: Lead[] = [];
  for (let idx = 0; idx < toScan.length; idx += 1) {
    const verdict = classified.get(idx);
    if (!verdict) continue;
    const row = toScan[idx];
    const acc = accountById.get(row.accountId);
    leads.push({
      commentId: row.commentId,
      accountId: row.accountId,
      platform: row.platform || acc?.platform || '',
      authorName: row.authorName || 'Unknown',
      profileUrl: profileUrlFor(row),
      authorPictureUrl: row.authorPictureUrl ?? null,
      comment: row.text ?? '',
      postPreview: row.postPreview ?? '',
      postUrl: row.postUrl ?? null,
      createdAt: row.createdAt ?? '',
      intent: verdict.intent,
      reason: verdict.reason,
      outreach: verdict.outreach,
    });
  }

  leads.sort((a, b) => {
    if (a.intent !== b.intent) return a.intent === 'high' ? -1 : 1;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });

  return NextResponse.json({ leads, scanned: toScan.length });
}
