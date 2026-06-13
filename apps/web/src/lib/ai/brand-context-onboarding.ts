import { hasComposerBrandContext, type BrandContextRecord } from '@/lib/brand-context-utils';

/**
 * Brand context onboarding detection and management
 */

export interface BrandContextOnboardingState {
  needsSetup: boolean;
  hasMinimalContext: boolean;
  completionScore: number; // 0-100 percentage
  missingFields: (keyof BrandContextRecord)[];
}

const BRAND_CONTEXT_FIELDS: (keyof BrandContextRecord)[] = [
  'targetAudience',
  'productDescription', 
  'toneOfVoice',
  'toneExamples',
  'additionalContext'
];

/**
 * Check if user needs brand context onboarding
 */
export function shouldShowBrandContextOnboarding(brandContext?: BrandContextRecord | null): boolean {
  if (!brandContext) return true;
  
  // Check if has minimal brand context (at least product description and target audience)
  const hasProduct = !!String(brandContext.productDescription ?? '').trim();
  const hasAudience = !!String(brandContext.targetAudience ?? '').trim();
  
  return !(hasProduct && hasAudience);
}

/**
 * Analyze brand context completeness
 */
export function analyzeBrandContext(brandContext?: BrandContextRecord | null): BrandContextOnboardingState {
  if (!brandContext) {
    return {
      needsSetup: true,
      hasMinimalContext: false,
      completionScore: 0,
      missingFields: [...BRAND_CONTEXT_FIELDS]
    };
  }

  const filledFields = BRAND_CONTEXT_FIELDS.filter(field => 
    !!String(brandContext[field] ?? '').trim()
  );

  const missingFields = BRAND_CONTEXT_FIELDS.filter(field => 
    !String(brandContext[field] ?? '').trim()
  );

  const completionScore = Math.round((filledFields.length / BRAND_CONTEXT_FIELDS.length) * 100);
  
  // Minimal context = has product description and target audience
  const hasMinimalContext = !!brandContext.productDescription?.trim() && 
                           !!brandContext.targetAudience?.trim();
  
  // Needs setup if completion is less than 40% or missing minimal context
  const needsSetup = completionScore < 40 || !hasMinimalContext;

  return {
    needsSetup,
    hasMinimalContext,
    completionScore,
    missingFields
  };
}

/**
 * Generate brand context onboarding message
 */
export function generateBrandContextOnboardingMessage(
  hasConnectedAccounts: boolean = false
): string {
  const setupBenefit = hasConnectedAccounts 
    ? "I can analyze your connected accounts to help set this up automatically"
    : "This will help me create better captions and understand your brand";

  return `I recommend setting up your brand context for better AI assistance. ${setupBenefit}.

Would you like to:
1️⃣ **Set up brand context** (recommended)
2️⃣ **Continue without brand context** (you can set it up later)`;
}

/**
 * Generate contextual brand setup prompt for media uploads
 */
export function generateMediaUploadBrandPrompt(
  mediaType: 'image' | 'video',
  hasMinimalContext: boolean
): string {
  if (hasMinimalContext) {
    return `I see you've uploaded ${mediaType === 'image' ? 'an image' : 'a video'}! What would you like to post about, and who is your target audience for this content?`;
  }

  return `I see you've uploaded ${mediaType === 'image' ? 'an image' : 'a video'}! To help create the best caption:

• What is this post about?
• Who is your target audience?
• What tone should I use? (professional, casual, fun, etc.)

I can also help set up your brand context with this information for future posts.`;
}

/**
 * Check if brand context is sufficient for AI assistance
 */
export function hasSufficientBrandContext(brandContext?: BrandContextRecord | null): boolean {
  if (!brandContext) return false;
  
  const analysis = analyzeBrandContext(brandContext);
  return analysis.completionScore >= 60 && analysis.hasMinimalContext;
}