import { prisma } from '@/lib/db';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { openAiChat } from '@/lib/openai-client';
import { isAysopLlmConfigured } from '@/lib/ai/llm-config';

/**
 * Auto-fill brand context from connected account analysis
 */

export interface BrandContextAutoFillResult {
  success: boolean;
  confidence: number; // 0-100
  brandContext: Partial<BrandContextRecord>;
  sources: string[];
  reasoning: string;
}

/**
 * Analyze connected accounts to auto-fill brand context
 */
export async function autoFillBrandContextFromAccounts(userId: string): Promise<BrandContextAutoFillResult> {
  try {
    // Get connected accounts
    const accounts = await prisma.socialAccount.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        username: true,
      },
    });

    if (!accounts.length) {
      return {
        success: false,
        confidence: 0,
        brandContext: {},
        sources: [],
        reasoning: 'No connected accounts found for analysis.',
      };
    }

    // Extract account information for AI analysis
    const accountSummaries = accounts.map(account => ({
      platform: account.platform,
      username: account.username,
      // For now, we'll work with basic account info
      // TODO: Integrate with platform-specific data when available
      bio: null,
      followerCount: null,
    })).filter(summary => summary.username);

    if (!accountSummaries.length) {
      return {
        success: false,
        confidence: 0,
        brandContext: {},
        sources: [],
        reasoning: 'No usable account data found for analysis.',
      };
    }

    // Use AI to analyze accounts and suggest brand context
    const aiResult = await analyzAccountsWithAI(accountSummaries);
    
    return {
      success: aiResult.confidence >= 90, // User requested 90% accuracy threshold
      confidence: aiResult.confidence,
      brandContext: aiResult.brandContext,
      sources: accountSummaries.map(a => `${a.platform}${a.username ? ` (@${a.username})` : ''}`),
      reasoning: aiResult.reasoning,
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

// TODO: Future enhancement - extract bio and follower data when platform data is stored
// For now, we'll work with usernames and platform combinations to infer brand context

async function analyzAccountsWithAI(accountSummaries: Array<{
  platform: string;
  username: string | null;
  bio: string | null;
  followerCount: number | null;
}>): Promise<{
  confidence: number;
  brandContext: Partial<BrandContextRecord>;
  reasoning: string;
}> {
  
  if (!isAysopLlmConfigured()) {
    throw new Error('AI model not configured');
  }

  const accountsText = accountSummaries.map(account => 
    `${account.platform}${account.username ? ` (@${account.username})` : ''}`
  ).join(', ');

  const systemPrompt = `You are helping to set up brand context by analyzing social media accounts. 

Based on the user's connected account platforms and usernames, try to infer brand context with HIGH CONFIDENCE ONLY. 
Only fill fields where you can achieve 90%+ accuracy from the limited data. If uncertain, leave fields empty.

With just platform names and usernames (no bios available), confidence will typically be low unless the username clearly indicates:
- A business name or brand
- A specific industry or service
- A clear professional focus

Respond in JSON format:
{
  "confidence": number (0-100),
  "brandContext": {
    "productDescription": "string or null",
    "targetAudience": "string or null", 
    "toneOfVoice": "string or null",
    "toneExamples": "string or null",
    "additionalContext": "string or null"
  },
  "reasoning": "explanation of analysis and confidence level"
}

Rules:
- With limited data, confidence should typically be 20-40% unless username is very clear
- Only include fields where confidence is 90%+ based on explicit username indicators
- Be extremely conservative - better to leave empty than guess incorrectly
- If no clear brand indicators, return low confidence with empty fields`;

  const userPrompt = `Analyze these connected accounts and extract brand context:

Connected platforms: ${accountsText}

Remember: Only fill fields with 90%+ confidence based on clear username/platform indicators.`;

  try {
    const response = await openAiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const result = JSON.parse(response.content);
    
    return {
      confidence: Math.min(100, Math.max(0, result.confidence || 0)),
      brandContext: result.brandContext || {},
      reasoning: result.reasoning || 'AI analysis completed',
    };

  } catch (error) {
    console.error('[AI account analysis]', error);
    return {
      confidence: 0,
      brandContext: {},
      reasoning: 'Failed to analyze accounts with AI',
    };
  }
}

/**
 * Get brand context questions based on what's missing and what can be auto-filled
 */
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
  
  // Try auto-fill first
  const autoFillResult = await autoFillBrandContextFromAccounts(userId);
  
  const current = currentBrandContext || {};
  const missingFields = [
    { key: 'productDescription', label: 'Product/Service' },
    { key: 'targetAudience', label: 'Target Audience' },
    { key: 'toneOfVoice', label: 'Tone of Voice' },
    { key: 'toneExamples', label: 'Tone Examples' },
    { key: 'additionalContext', label: 'Additional Context' },
  ].filter(field => !String(current[field.key as keyof BrandContextRecord] ?? '').trim());

  if (!missingFields.length) {
    return {
      autoFillAvailable: false,
    };
  }

  // Find next field that wasn't auto-filled or needs manual input
  let nextField = missingFields.find(field => 
    !autoFillResult.brandContext[field.key as keyof BrandContextRecord]
  ) || missingFields[0];

  const questionPrompts: Record<string, string> = {
    productDescription: "What product or service do you offer? Describe what you do and what makes you unique.",
    targetAudience: "Who is your ideal customer or audience? (e.g., small business owners, fitness enthusiasts, young professionals)",
    toneOfVoice: "How should I communicate for your brand? (e.g., professional, friendly, casual, authoritative, fun)",
    toneExamples: "Can you provide 2-3 example phrases or sentences that match your brand voice?",
    additionalContext: "Any other important details about your brand, values, or messaging guidelines?",
  };

  return {
    autoFillAvailable: autoFillResult.success,
    autoFillResult: autoFillResult.success ? autoFillResult : undefined,
    nextQuestion: {
      field: nextField.key,
      prompt: questionPrompts[nextField.key] || `Please provide details for ${nextField.label}`,
      dependsOnAutoFill: false,
    },
  };
}