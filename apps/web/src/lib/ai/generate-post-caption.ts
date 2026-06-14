import {
  openAiChatWithUserParts,
  type OpenAIContentPart,
} from '@/lib/openai-client';
import { prisma } from '@/lib/db';
import {
  hasComposerBrandContext,
  parseBrandContextApiPayload,
  type BrandContextRecord,
} from '@/lib/brand-context-utils';
import { platformLabel } from '@/lib/composer/platform-capabilities';
import { getIzopOpenRouterApiKey, toOpenRouterModel } from '@/lib/ai/llm-config';

function cleanGeneratedText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

function buildSystemPrompt(brand: {
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
}): string {
  const parts: string[] = [
    'You are a social media copywriter. Write one ready-to-publish caption for the requested platform. Output only the caption text, no meta-commentary.',
    'Rules: Plain text only. No markdown. No em dashes or en dashes; use commas or " to " instead. Keep it concise (1 to 4 short lines). Include a clear call-to-action when it fits the brand.',
    'When an image or video is attached, describe what you see and tie it naturally to the brand voice.',
  ];
  if (brand.targetAudience?.trim()) parts.push(`Target audience: ${brand.targetAudience.trim()}`);
  if (brand.toneOfVoice?.trim()) parts.push(`Tone of voice: ${brand.toneOfVoice.trim()}`);
  if (brand.toneExamples?.trim()) parts.push(`Example tones:\n${brand.toneExamples.trim()}`);
  if (brand.productDescription?.trim()) parts.push(`Product/service: ${brand.productDescription.trim()}`);
  if (brand.additionalContext?.trim()) parts.push(`Additional context: ${brand.additionalContext.trim()}`);
  return parts.join('\n\n');
}

function brandFieldsFromRecord(ctx: BrandContextRecord | null | undefined) {
  const c = parseBrandContextApiPayload(ctx ?? {});
  return {
    targetAudience: c.targetAudience ?? null,
    toneOfVoice: c.toneOfVoice ?? null,
    toneExamples: c.toneExamples ?? null,
    productDescription: c.productDescription ?? null,
    additionalContext: c.additionalContext ?? null,
  };
}

export async function generatePostCaptionForUser(
  userId: string,
  opts: {
    platform: string;
    userIntent?: string;
    hasImage?: boolean;
    hasVideo?: boolean;
    imageUrl?: string | null;
    videoUrl?: string | null;
    brandContextOverride?: BrandContextRecord | null;
  }
): Promise<string> {
  if (!process.env.OPENAI_API_KEY?.trim() && !getIzopOpenRouterApiKey()) {
    throw new Error('Caption generation is not configured.');
  }

  let brandRecord: BrandContextRecord | null = opts.brandContextOverride ?? null;
  if (!brandRecord || !hasComposerBrandContext(brandRecord)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { brandContext: true },
    });
    brandRecord = parseBrandContextApiPayload(user?.brandContext);
  }

  const hasBrand = hasComposerBrandContext(brandRecord);
  const brand = brandFieldsFromRecord(brandRecord);

  const label = platformLabel(opts.platform);
  const mediaHint = opts.hasVideo
    ? 'The post includes a video.'
    : opts.hasImage
      ? 'The post includes an image.'
      : 'This is a text post.';

  const userTextParts = [
    `Write a caption for ${label}.`,
    mediaHint,
    opts.userIntent?.trim()
      ? `User request or context from chat:\n${opts.userIntent.trim().slice(0, 1500)}`
      : 'Write an engaging caption that fits the platform and brand.',
    'Output only the caption text.',
  ];

  const userParts: OpenAIContentPart[] = [{ type: 'text', text: userTextParts.join('\n\n') }];
  if (opts.imageUrl?.trim()) {
    userParts.push({ type: 'image_url', image_url: { url: opts.imageUrl.trim(), detail: 'low' } });
  } else if (opts.videoUrl?.trim()) {
    userParts.push({
      type: 'text',
      text: `[Attached video URL for context: ${opts.videoUrl.trim()}]`,
    });
  }

  const visionModelRaw =
    process.env.IZOP_AI_VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_CHAT_VISION_MODEL?.trim() ||
    'gpt-4.1-mini';
  const visionModel = getIzopOpenRouterApiKey() ? toOpenRouterModel(visionModelRaw) : visionModelRaw;
  const useVision = Boolean(opts.imageUrl?.trim());

  const { content } = await openAiChatWithUserParts(
    [
      {
        role: 'system',
        content: hasBrand
          ? buildSystemPrompt(brand)
          : 'You are a social media copywriter. Write one engaging, platform-appropriate caption. Plain text only. No markdown. When media is attached, reference what you see.',
      },
      { role: 'user', content: userParts },
    ],
    {
      max_tokens: 320,
      providerScope: 'izop',
      ...(useVision ? { model: visionModel } : {}),
    }
  );

  const cleaned = cleanGeneratedText(content);
  if (!cleaned) throw new Error('Empty caption from AI.');
  return cleaned;
}
