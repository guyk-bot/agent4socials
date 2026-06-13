import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { buildThreadsBrandDraftForAccount } from '@/lib/funnel/build-brand-draft';
import { synthesizeThreadsBrandContext } from '@/lib/funnel/synthesize-threads-brand';
import { fetchPageProfile } from '@/lib/facebook/fetchers';

/**
 * Auto-fill brand context from connected account profiles and synced posts.
 */

export interface BrandContextAutoFillResult {
  success: boolean;
  confidence: number;
  brandContext: Partial<BrandContextRecord>;
  sources: string[];
  reasoning: string;
}

const PLATFORM_PRIORITY: Platform[] = [
  'THREADS',
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'YOUTUBE',
  'TWITTER',
  'LINKEDIN',
  'PINTEREST',
];

const BRAND_FIELD_KEYS: (keyof BrandContextRecord)[] = [
  'productDescription',
  'targetAudience',
  'toneOfVoice',
  'toneExamples',
  'additionalContext',
  'inboxReplyExamples',
  'commentReplyExamples',
];

type ConnectedAccount = {
  id: string;
  platform: Platform;
  username: string;
  accessToken: string;
  expiresAt: Date | null;
  platformUserId: string;
};

async function importedPostTexts(accountId: string, limit = 12): Promise<string[]> {
  const rows = await prisma.importedPost.findMany({
    where: { socialAccountId: accountId },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { content: true },
  });
  return rows.map((r) => r.content?.trim()).filter((t): t is string => Boolean(t));
}

function mergeBrandDrafts(
  base: Partial<BrandContextRecord>,
  next: Partial<BrandContextRecord>
): Partial<BrandContextRecord> {
  const out = { ...base };
  for (const key of BRAND_FIELD_KEYS) {
    const existing = String(out[key] ?? '').trim();
    const incoming = String(next[key] ?? '').trim();
    if (!existing && incoming) {
      out[key] = incoming;
    }
  }
  return out;
}

function countFilledFields(draft: Partial<BrandContextRecord>): number {
  return BRAND_FIELD_KEYS.filter((k) => String(draft[k] ?? '').trim().length >= 8).length;
}

function draftToAutoFillResult(args: {
  brandContext: Partial<BrandContextRecord>;
  sources: string[];
  confidence: number;
  reasoning: string;
}): BrandContextAutoFillResult {
  const filled = countFilledFields(args.brandContext);
  return {
    success: filled >= 2 || String(args.brandContext.productDescription ?? '').trim().length >= 20,
    confidence: args.confidence,
    brandContext: args.brandContext,
    sources: args.sources,
    reasoning: args.reasoning,
  };
}

async function buildFromThreadsAccount(account: ConnectedAccount): Promise<Partial<BrandContextRecord> | null> {
  try {
    const built = await buildThreadsBrandDraftForAccount(account);
    if (!built.hasUsableDraft) return null;
    return built.draft;
  } catch (error) {
    console.warn('[Brand auto-fill] Threads failed:', (error as Error)?.message ?? error);
    return null;
  }
}

async function buildFromFacebookAccount(account: ConnectedAccount): Promise<Partial<BrandContextRecord> | null> {
  try {
    const res = await fetchPageProfile(account.platformUserId, account.accessToken);
    const bio = String(res.data?.about ?? res.data?.category ?? '').trim();
    const postTexts = await importedPostTexts(account.id);
    const synthesized = synthesizeThreadsBrandContext({ bio, postTexts, replyTexts: [] });
    return synthesized.hasUsableDraft ? synthesized.draft : null;
  } catch (error) {
    console.warn('[Brand auto-fill] Facebook failed:', (error as Error)?.message ?? error);
    return null;
  }
}

async function buildFromImportedPostsAccount(account: ConnectedAccount): Promise<Partial<BrandContextRecord> | null> {
  const postTexts = await importedPostTexts(account.id);
  if (postTexts.length < 2) return null;
  const bio = account.username ? `@${account.username} on ${account.platform}` : '';
  const synthesized = synthesizeThreadsBrandContext({ bio, postTexts, replyTexts: [] });
  return synthesized.hasUsableDraft ? synthesized.draft : null;
}

async function buildFromAccount(account: ConnectedAccount): Promise<Partial<BrandContextRecord> | null> {
  if (account.platform === 'THREADS') {
    return buildFromThreadsAccount(account);
  }
  if (account.platform === 'FACEBOOK') {
    const fb = await buildFromFacebookAccount(account);
    if (fb) return fb;
  }
  return buildFromImportedPostsAccount(account);
}

/**
 * Analyze connected accounts to auto-fill brand context from live profile + synced posts.
 */
export async function autoFillBrandContextFromAccounts(userId: string): Promise<BrandContextAutoFillResult> {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { userId, status: 'connected' },
      select: {
        id: true,
        platform: true,
        username: true,
        accessToken: true,
        expiresAt: true,
        platformUserId: true,
      },
    });

    if (!accounts.length) {
      return {
        success: false,
        confidence: 0,
        brandContext: {},
        sources: [],
        reasoning: 'No connected accounts found.',
      };
    }

    const byPlatform = new Map(accounts.map((a) => [a.platform, a as ConnectedAccount]));
    const sources: string[] = [];
    let merged: Partial<BrandContextRecord> = {};
    let bestConfidence = 0;
    const reasoningParts: string[] = [];

    for (const platform of PLATFORM_PRIORITY) {
      const account = byPlatform.get(platform);
      if (!account) continue;

      const draft = await buildFromAccount(account);
      const label = `${platform}${account.username ? ` (@${account.username})` : ''}`;
      if (!draft) {
        reasoningParts.push(`${label}: no usable profile or post data yet`);
        continue;
      }

      merged = mergeBrandDrafts(merged, draft);
      sources.push(label);
      const confidence = platform === 'THREADS' ? 88 : platform === 'FACEBOOK' ? 78 : 68;
      bestConfidence = Math.max(bestConfidence, confidence);
      reasoningParts.push(`${label}: analyzed profile and recent posts`);
    }

    if (countFilledFields(merged) >= 2) {
      return draftToAutoFillResult({
        brandContext: merged,
        sources,
        confidence: bestConfidence,
        reasoning: reasoningParts.join('; '),
      });
    }

    return {
      success: false,
      confidence: bestConfidence,
      brandContext: merged,
      sources,
      reasoning:
        reasoningParts.join('; ') ||
        'Connected accounts found but no profile bios or synced posts yet. Open Console to sync posts, then try again.',
    };
  } catch (error) {
    console.error('[Auto-fill brand context]', error);
    return {
      success: false,
      confidence: 0,
      brandContext: {},
      sources: [],
      reasoning: 'Error analyzing connected accounts.',
    };
  }
}

/**
 * Fields still missing after auto-fill (for in-chat manual entry card).
 */
export function missingBrandContextFieldKeys(
  current: Partial<BrandContextRecord>,
  proposed: Partial<BrandContextRecord>
): (keyof BrandContextRecord)[] {
  const keys: (keyof BrandContextRecord)[] = [
    'productDescription',
    'targetAudience',
    'toneOfVoice',
    'toneExamples',
  ];
  return keys.filter((key) => {
    const cur = String(current[key] ?? '').trim();
    const prop = String(proposed[key] ?? '').trim();
    return !cur && !prop;
  });
}

export async function getBrandContextSetupQuestions(
  userId: string,
  currentBrandContext?: BrandContextRecord | null
): Promise<{
  autoFillAvailable: boolean;
  autoFillResult?: BrandContextAutoFillResult;
  nextQuestion?: {
    field: string;
    prompt: string;
    dependsOnAutoFill: boolean;
  };
}> {
  const autoFillResult = await autoFillBrandContextFromAccounts(userId);
  const current = currentBrandContext || {};
  const missingFields = [
    { key: 'productDescription', label: 'Product/Service' },
    { key: 'targetAudience', label: 'Target Audience' },
    { key: 'toneOfVoice', label: 'Tone of Voice' },
    { key: 'toneExamples', label: 'Tone Examples' },
  ].filter((field) => !String(current[field.key as keyof BrandContextRecord] ?? '').trim());

  if (!missingFields.length) {
    return { autoFillAvailable: false };
  }

  const nextField =
    missingFields.find(
      (field) => !autoFillResult.brandContext[field.key as keyof BrandContextRecord]
    ) || missingFields[0];

  const questionPrompts: Record<string, string> = {
    productDescription: 'What product or service do you offer?',
    targetAudience: 'Who is your ideal customer or audience?',
    toneOfVoice: 'How should I communicate for your brand?',
    toneExamples: 'Share 2-3 example phrases that match your brand voice.',
  };

  return {
    autoFillAvailable: autoFillResult.success,
    autoFillResult: autoFillResult.success ? autoFillResult : undefined,
    nextQuestion: {
      field: nextField.key,
      prompt: questionPrompts[nextField.key] || `Please provide ${nextField.label}`,
      dependsOnAutoFill: false,
    },
  };
}
