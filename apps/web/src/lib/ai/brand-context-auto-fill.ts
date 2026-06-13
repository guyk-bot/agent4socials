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
        platformData: true,
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
      // Extract relevant data from platformData
      bio: extractBioFromPlatformData(account.platformData),
      followerCount: extractFollowerCountFromPlatformData(account.platformData),
    })).filter(summary => summary.bio || summary.username);

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

function extractBioFromPlatformData(platformData: unknown): string | null {
  if (!platformData || typeof platformData !== 'object') return null;
  const data = platformData as Record<string, unknown>;
  
  // Try common bio field names across platforms
  const bioFields = ['biography', 'bio', 'description', 'about', 'summary'];
  for (const field of bioFields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  
  return null;
}

function extractFollowerCountFromPlatformData(platformData: unknown): number | null {
  if (!platformData || typeof platformData !== 'object') return null;
  const data = platformData as Record<string, unknown>;
  
  // Try common follower count field names
  const followerFields = ['follower_count', 'followers_count', 'subscribers', 'fans'];
  for (const field of followerFields) {
    const value = data[field];
    if (typeof value === 'number') {
      return value;
    }
  }
  
  return null;
}

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
    `${account.platform}${account.username ? ` (@${account.username})` : ''}:
    ${account.bio ? `Bio: "${account.bio}"` : 'No bio available'}
    ${account.followerCount ? `Followers: ${account.followerCount.toLocaleString()}` : ''}`
  ).join('\n\n');

  const systemPrompt = `You are helping to set up brand context by analyzing social media accounts. 

Based on the user's connected account information, extract brand context details with HIGH CONFIDENCE ONLY. 
Only fill fields where you can achieve 90%+ accuracy from the provided data. If uncertain, leave fields empty.

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
- Only include fields where confidence is 90%+ based on clear, explicit information
- productDescription: What they offer/do (from bio descriptions)
- targetAudience: Who they serve (inferrable from bio + platform + content style)
- toneOfVoice: Communication style (professional, casual, fun, etc.)
- toneExamples: Specific phrases that demonstrate their voice
- additionalContext: Any other clear brand information
- Be conservative - better to leave empty than guess incorrectly`;

  const userPrompt = `Analyze these connected accounts and extract brand context:

${accountsText}

Remember: Only fill fields with 90%+ confidence. Leave uncertain fields as null.`;

  try {
    const response = await openAiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // Low temperature for consistency
    });

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