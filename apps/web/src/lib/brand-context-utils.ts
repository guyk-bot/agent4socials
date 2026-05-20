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

/** True when enough brand context exists for Composer "Generate with AI". */
export function hasComposerBrandContext(ctx: unknown): boolean {
  if (!ctx || typeof ctx !== 'object') return false;
  const c = ctx as BrandContextRecord;
  return !!(
    String(c.targetAudience ?? '').trim() ||
    String(c.toneOfVoice ?? '').trim() ||
    String(c.productDescription ?? '').trim()
  );
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
