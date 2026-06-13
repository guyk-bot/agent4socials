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
const BRAND_CONTEXT_CACHE_PREFIX = 'agent4socials_brand_context_';
const BRAND_CONTEXT_LAST_UID_KEY = 'agent4socials_brand_context_last_uid';

export function brandContextCacheKey(userId: string): string {
  return `${BRAND_CONTEXT_CACHE_PREFIX}${userId}`;
}

/** Read cached brand context (instant UI). Uses last saved user when userId omitted. */
export function readBrandContextCache(userId?: string | null): BrandContextRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const uid = userId ?? localStorage.getItem(BRAND_CONTEXT_LAST_UID_KEY);
    if (!uid) return null;
    const raw = localStorage.getItem(brandContextCacheKey(uid));
    if (!raw) return null;
    return parseBrandContextApiPayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeBrandContextCache(data: BrandContextRecord, userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const payload = parseBrandContextApiPayload(data);
    localStorage.setItem(brandContextCacheKey(userId), JSON.stringify(payload));
    localStorage.setItem(BRAND_CONTEXT_LAST_UID_KEY, userId);
  } catch {
    /* ignore quota */
  }
}

/** When set, in-flight brand-context GETs that started before this time must not overwrite the form or cache. */
let lastBrandContextSaveAt = 0;

export function markBrandContextSaved(): void {
  lastBrandContextSaveAt = Date.now();
}

/** True when a remote fetch started after the latest successful save (safe to apply). */
export function shouldApplyRemoteBrandContext(fetchStartedAt: number): boolean {
  return fetchStartedAt >= lastBrandContextSaveAt;
}

export function clearBrandContextCache(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const uid = userId ?? localStorage.getItem(BRAND_CONTEXT_LAST_UID_KEY);
    if (uid) localStorage.removeItem(brandContextCacheKey(uid));
    if (!userId) localStorage.removeItem(BRAND_CONTEXT_LAST_UID_KEY);
    sessionStorage.removeItem(COMPOSER_BRAND_READY_KEY);
  } catch {
    /* ignore */
  }
}

export function brandContextToFormFields(data: BrandContextRecord): Required<BrandContextRecord> {
  return {
    targetAudience: data.targetAudience ?? null,
    toneOfVoice: data.toneOfVoice ?? null,
    toneExamples: data.toneExamples ?? null,
    productDescription: data.productDescription ?? null,
    additionalContext: data.additionalContext ?? null,
    inboxReplyExamples: data.inboxReplyExamples ?? null,
    commentReplyExamples: data.commentReplyExamples ?? null,
  };
}

/** True when localStorage has any saved AI Assistant fields for this user. */
export function readBrandContextCacheHasContent(userId?: string | null): boolean {
  const c = readBrandContextCache(userId);
  if (!c) return false;
  return (
    hasComposerBrandContext(c) ||
    hasInboxReplyExamples(c) ||
    hasCommentReplyExamples(c)
  );
}

/** Optimistic flag so Composer can open AI modal before a slow brand-context fetch finishes. */
export function readComposerBrandReadyCache(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(COMPOSER_BRAND_READY_KEY) === '1') return true;
    return hasComposerBrandContext(readBrandContextCache() ?? {});
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
 * Merge incoming brand context with existing DB values.
 * Keys listed in `explicitKeys` are taken from `incoming` as-is (null clears the field).
 * Other keys keep existing values when incoming is empty (partial saves from iZop AI cards).
 */
export function mergeBrandContextOnSave(
  previous: unknown,
  incoming: BrandContextRecord,
  explicitKeys?: Iterable<keyof BrandContextRecord>
): BrandContextRecord {
  const prev = (previous && typeof previous === 'object' ? previous : {}) as BrandContextRecord;
  const explicit = explicitKeys ? new Set(explicitKeys) : null;

  const pick = (key: keyof BrandContextRecord, value: string | null | undefined): string | null => {
    if (explicit?.has(key)) {
      return value ?? null;
    }
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
