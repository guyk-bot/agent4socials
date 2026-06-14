import { openAiChat } from '@/lib/openai-client';
import { prisma } from '@/lib/db';
import { hasComposerBrandContext } from '@/lib/brand-context-utils';
import { platformLabel } from '@/lib/composer/platform-capabilities';

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
  ];
  if (brand.targetAudience?.trim()) parts.push(`Target audience: ${brand.targetAudience.trim()}`);
  if (brand.toneOfVoice?.trim()) parts.push(`Tone of voice: ${brand.toneOfVoice.trim()}`);
  if (brand.toneExamples?.trim()) parts.push(`Example tones:\n${brand.toneExamples.trim()}`);
  if (brand.productDescription?.trim()) parts.push(`Product/service: ${brand.productDescription.trim()}`);
  if (brand.additionalContext?.trim()) parts.push(`Additional context: ${brand.additionalContext.trim()}`);
  return parts.join('\n\n');
}

export async function generatePostCaptionForUser(
  userId: string,
  opts: {
    platform: string;
    userIntent?: string;
    hasImage?: boolean;
    hasVideo?: boolean;
  }
): Promise<string> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('Caption generation is not configured.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { brandContext: true },
  });
  const ctx = user?.brandContext as Record<string, unknown> | null;
  const hasBrand = hasComposerBrandContext(ctx);

  const brand = hasBrand
    ? {
        targetAudience: (ctx!.targetAudience as string | undefined) ?? null,
        toneOfVoice: (ctx!.toneOfVoice as string | undefined) ?? null,
        toneExamples: (ctx!.toneExamples as string | undefined) ?? null,
        productDescription: (ctx!.productDescription as string | undefined) ?? null,
        additionalContext: (ctx!.additionalContext as string | undefined) ?? null,
      }
    : {
        targetAudience: null,
        toneOfVoice: null,
        toneExamples: null,
        productDescription: null,
        additionalContext: null,
      };

  const label = platformLabel(opts.platform);
  const mediaHint = opts.hasVideo
    ? 'The post includes a video.'
    : opts.hasImage
      ? 'The post includes an image.'
      : 'This is a text post.';

  const userParts = [
    `Write a caption for ${label}.`,
    mediaHint,
    opts.userIntent?.trim()
      ? `User request or context from chat:\n${opts.userIntent.trim().slice(0, 1500)}`
      : 'Write an engaging caption that fits the platform.',
    'Output only the caption text.',
  ];

  const { content } = await openAiChat(
    [
      {
        role: 'system',
        content: hasBrand
          ? buildSystemPrompt(brand)
          : 'You are a social media copywriter. Write one engaging, platform-appropriate caption. Plain text only. No markdown.',
      },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    { max_tokens: 320 }
  );

  const cleaned = cleanGeneratedText(content);
  if (!cleaned) throw new Error('Empty caption from AI.');
  return cleaned;
}
