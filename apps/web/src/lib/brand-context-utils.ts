/**
 * Shared helpers for AI Assistant brand context (Composer, Inbox, API routes).
 */

export type BrandContextRecord = {
  targetAudience?: string | null;
  toneOfVoice?: string | null;
  toneExamples?: string | null;
  productDescription?: string | null;
  additionalContext?: string | null;
  inboxReplyExamples?: string | null;
  commentReplyExamples?: string | null;
};

/** Strip API-only fields from GET /ai/brand-context before reading form fields. */
export function parseBrandContextApiPayload(data: unknown): BrandContextRecord {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  return {
    targetAudience: (d.targetAudience as string | null | undefined) ?? null,
    toneOfVoice: (d.toneOfVoice as string | null | undefined) ?? null,
    toneExamples: (d.toneExamples as string | null | undefined) ?? null,
    productDescription: (d.productDescription as string | null | undefined) ?? null,
    additionalContext: (d.additionalContext as string | null | undefined) ?? null,
    inboxReplyExamples: (d.inboxReplyExamples as string | null | undefined) ?? null,
    commentReplyExamples: (d.commentReplyExamples as string | null | undefined) ?? null,
  };
}

/** True when enough brand context exists for Composer "Generate with AI". */
export function hasComposerBrandContext(ctx: unknown): boolean {
  const c = parseBrandContextApiPayload(ctx);
  return !!(
    String(c.targetAudience ?? '').trim() ||
    String(c.toneOfVoice ?? '').trim() ||
    String(c.productDescription ?? '').trim() ||
    String(c.toneExamples ?? '').trim() ||
    String(c.additionalContext ?? '').trim()
  );
}

const COMPOSER_BRAND_READY_KEY = 'agent4socials_composer_brand_ready';

/** Optimistic flag so Composer can open AI modal before a slow brand-context fetch finishes. */
export function readComposerBrandReadyCache(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(COMPOSER_BRAND_READY_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeComposerBrandReadyCache(ready: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (ready) sessionStorage.setItem(COMPOSER_BRAND_READY_KEY, '1');
    else sessionStorage.removeItem(COMPOSER_BRAND_READY_KEY);
  } catch {
    /* ignore */
  }
}

export function hasInboxReplyExamples(ctx: unknown): boolean {
  if (!ctx || typeof ctx !== 'object') return false;
  return !!String((ctx as BrandContextRecord).inboxReplyExamples ?? '').trim();
}

export function hasCommentReplyExamples(ctx: unknown): boolean {
  if (!ctx || typeof ctx !== 'object') return false;
  return !!String((ctx as BrandContextRecord).commentReplyExamples ?? '').trim();
}

/**
 * When the client saves with empty fields (e.g. form not loaded yet), keep existing DB values
 * so inbox/comment-only saves do not wipe brand context.
 */
export function mergeBrandContextOnSave(
  previous: unknown,
  incoming: BrandContextRecord
): BrandContextRecord {
  const prev = (previous && typeof previous === 'object' ? previous : {}) as BrandContextRecord;
  const pick = (key: keyof BrandContextRecord, value: string | null): string | null => {
    if (value) return value;
    const existing = prev[key];
    if (typeof existing === 'string' && existing.trim()) return existing.trim();
    return null;
  };
  return {
    targetAudience: pick('targetAudience', incoming.targetAudience ?? null),
    toneOfVoice: pick('toneOfVoice', incoming.toneOfVoice ?? null),
    toneExamples: pick('toneExamples', incoming.toneExamples ?? null),
    productDescription: pick('productDescription', incoming.productDescription ?? null),
    additionalContext: pick('additionalContext', incoming.additionalContext ?? null),
    inboxReplyExamples: pick('inboxReplyExamples', incoming.inboxReplyExamples ?? null),
    commentReplyExamples: pick('commentReplyExamples', incoming.commentReplyExamples ?? null),
  };
}
