import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { openAiChat } from '@/lib/openai-client';
import { isIzopLlmConfigured } from '@/lib/ai/llm-config';
import type { LandingChatContext } from '@/lib/chat-hero-script';
import { isBrandContextFunnelStep, normalizeLandingChatText } from '@/lib/chat-hero-script';
import { buildFunnelBrandDraftForAccount } from '@/lib/funnel/build-brand-draft';

export type BrandContextFillResult = {
  text: string;
  source: 'brand_fill';
  brandContextUpdate: BrandContextRecord;
  hashtagPoolUpdate: string;
};

const BRAND_FIELD_KEYS: (keyof BrandContextRecord)[] = [
  'productDescription',
  'targetAudience',
  'toneOfVoice',
  'toneExamples',
  'inboxReplyExamples',
  'commentReplyExamples',
  'additionalContext',
];

function fieldEmpty(value: unknown): boolean {
  return !String(value ?? '').trim();
}

function mergeFillEmpty(
  current: BrandContextRecord,
  incoming: BrandContextRecord
): BrandContextRecord {
  const out: BrandContextRecord = { ...current };
  for (const key of BRAND_FIELD_KEYS) {
    if (fieldEmpty(out[key]) && !fieldEmpty(incoming[key])) {
      out[key] = String(incoming[key]).trim();
    }
  }
  return out;
}

function countFilled(draft: BrandContextRecord): number {
  return BRAND_FIELD_KEYS.filter((k) => !fieldEmpty(draft[k])).length;
}

export function wantsBrandContextAssist(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  if (
    /\b(fill|complete|populate|update|finish|refine|improve|expand|write)\b/.test(lower) &&
    /\b(form|fields|brand|context|above|them|it|this|everything|all)\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\b(fill|complete|populate)\b.*\b(based on|using|from|with)\b.*\b(context|posts|profile|data|what you)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\b(help me|can you|please).*(fill|complete|populate|write).*(brand|context|form|fields)\b/.test(lower)) {
    return true;
  }
  if (
    /\b(use|based on).*(context|what you (know|have|learned|pulled|found))\b/.test(lower) &&
    /\b(fill|brand|form|fields|audience|offer|tone|hashtag)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/** User shares brand facts in chat (not only explicit "fill the form"). */
export function providesBrandContextDetails(text: string): boolean {
  if (wantsBrandContextAssist(text)) return false;
  const lower = normalizeLandingChatText(text);
  if (lower.length < 12) return false;
  return (
    /\b(i am|i'm|we are|we're|my (brand|business|company|product|service|offer|audience|customers|clients))\b/.test(
      lower
    ) ||
    /\b(we help|i help|i sell|we sell|we build|i build|we offer|i offer|target audience|tone of voice)\b/.test(
      lower
    ) ||
    /\b(for (small business|creators|agencies|freelancers|founders|coaches))\b/.test(lower)
  );
}

export function shouldAssistBrandContextForm(ctx: LandingChatContext): boolean {
  if (!isBrandContextFunnelStep(ctx)) return false;
  return wantsBrandContextAssist(ctx.text) || providesBrandContextDetails(ctx.text);
}

function draftFromRecord(raw: Record<string, unknown> | null | undefined): BrandContextRecord {
  if (!raw || typeof raw !== 'object') return {};
  const out: BrandContextRecord = {};
  for (const key of BRAND_FIELD_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

function buildLlmUserPayload(params: {
  ctx: LandingChatContext;
  current: BrandContextRecord;
  refreshed: BrandContextRecord;
  hashtagPool: string;
  platformLabel?: string;
  username?: string;
}): string {
  const { ctx, current, refreshed, hashtagPool, platformLabel, username } = params;
  return [
    `User request: ${ctx.text}`,
    platformLabel ? `Connected platform: ${platformLabel}` : null,
    username ? `Account: @${username.replace(/^@/, '')}` : null,
    'Current form (may be partial):',
    JSON.stringify(current, null, 2),
    'Fresh data from connected profile/posts (use to fill gaps, synthesize — do not paste promo posts verbatim):',
    JSON.stringify(refreshed, null, 2),
    hashtagPool ? `Hashtags from posts: ${hashtagPool}` : null,
    'Return JSON only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function llmFillBrandContext(params: {
  ctx: LandingChatContext;
  current: BrandContextRecord;
  refreshed: BrandContextRecord;
  hashtagPool: string;
  platformLabel?: string;
  username?: string;
}): Promise<{ reply: string; draft: BrandContextRecord; hashtagPool: string } | null> {
  if (!isIzopLlmConfigured()) return null;

  const system = [
    'You help fill the iZop brand context form during the pre-signup funnel.',
    'Output valid JSON with keys:',
    'reply (1-2 short sentences telling the user you updated the form),',
    'productDescription, targetAudience, toneOfVoice, toneExamples, inboxReplyExamples, commentReplyExamples, additionalContext, hashtagPool.',
    'Rules:',
    '- Synthesize what the brand offers and who it serves. Never paste a single social post as productDescription.',
    '- Target audience: infer roles/industries from content. Leave empty string if unclear.',
    '- Tone of voice: short trait list only (e.g. "Enthusiastic, direct, professional"). No meta like "based on your posts".',
    '- Tone examples: 2-4 real caption snippets, one per line.',
    '- Inbox/comment reply examples: short realistic replies from available reply data or infer polite on-brand replies.',
    '- additionalContext: only useful facts for future AI (niche, product stage, content themes). No "sampled N posts".',
    '- hashtagPool: space-separated hashtags from data, or empty string.',
    '- Fill every empty field you can support from context. Improve thin fields (e.g. one-word replies) when you have better data.',
    '- If the user adds new facts in their message, weave them in.',
    '- Professional, concise, actionable for brainstorm and content generation later.',
  ].join('\n');

  try {
    const result = await openAiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: buildLlmUserPayload(params) },
      ],
      {
        model: process.env.LANDING_CHAT_MODEL?.trim() || 'gpt-4.1-nano',
        providerScope: 'default',
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }
    );

    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    const draft: BrandContextRecord = {};
    for (const key of BRAND_FIELD_KEYS) {
      const v = parsed[key];
      if (typeof v === 'string' && v.trim()) draft[key] = v.trim();
    }
    const reply =
      typeof parsed.reply === 'string' && parsed.reply.trim()
        ? parsed.reply.trim()
        : 'I updated the brand context form from your profile and posts. Review the fields above and tap Save when it looks right.';
    const pool =
      typeof parsed.hashtagPool === 'string' ? parsed.hashtagPool.trim() : params.hashtagPool;
    return { reply, draft, hashtagPool: pool };
  } catch {
    return null;
  }
}

export async function fillBrandContextFromChat(params: {
  ctx: LandingChatContext;
  guestUserId?: string | null;
  hashtagPool?: string;
}): Promise<BrandContextFillResult> {
  const { ctx, guestUserId } = params;
  let current = draftFromRecord(ctx.brandContextDraft);
  let refreshed: BrandContextRecord = {};
  let hashtagPool = (params.hashtagPool ?? '').trim();
  let platformLabel: string | undefined;
  let username: string | undefined;

  if (ctx.connectedAccountId && guestUserId) {
    try {
      const snapshot = await buildFunnelBrandDraftForAccount(ctx.connectedAccountId, guestUserId);
      if (snapshot) {
        refreshed = snapshot.draft;
        platformLabel = snapshot.platformLabel;
        username = snapshot.username;
        if (snapshot.hashtagPool.length > 0) {
          hashtagPool = snapshot.hashtagPool.join(' ');
        }
      }
    } catch (e) {
      console.warn('[brand-context-fill] refresh failed:', (e as Error)?.message ?? e);
    }
  }

  let merged = mergeFillEmpty(current, refreshed);

  const llm = await llmFillBrandContext({
    ctx,
    current: merged,
    refreshed,
    hashtagPool,
    platformLabel,
    username,
  });

  if (llm) {
    merged = mergeFillEmpty(merged, llm.draft);
    for (const key of BRAND_FIELD_KEYS) {
      const llmVal = llm.draft[key];
      const curVal = merged[key];
      if (
        typeof llmVal === 'string' &&
        llmVal.trim() &&
        (fieldEmpty(curVal) || String(curVal).trim().length < 12)
      ) {
        merged[key] = llmVal.trim();
      }
    }
    if (llm.hashtagPool.trim()) hashtagPool = llm.hashtagPool.trim();

    const filled = countFilled(merged);
    const reply =
      filled >= 4
        ? llm.reply
        : `${llm.reply} Add anything I missed in the empty fields, then tap Save.`;

    return {
      text: reply,
      source: 'brand_fill',
      brandContextUpdate: merged,
      hashtagPoolUpdate: hashtagPool,
    };
  }

  merged = mergeFillEmpty(merged, refreshed);
  const filled = countFilled(merged);
  const text =
    filled >= 3
      ? 'I filled the brand context form from your connected account and posts. Review the fields above and tap Save.'
      : 'I added what I could from your profile and posts. Please complete the empty fields, then tap Save.';

  return {
    text,
    source: 'brand_fill',
    brandContextUpdate: merged,
    hashtagPoolUpdate: hashtagPool,
  };
}
