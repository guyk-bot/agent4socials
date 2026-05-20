import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';
import { hasComposerBrandContext } from '@/lib/brand-context-utils';
import { mergeCaptionWithCta } from '@/lib/composer/cta-caption';

const TWITTER_AI_MAX_CHARS = 230;

type BrandFields = {
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
};

type CtaBundle = {
  cta: string;
  keywords?: string[];
  replyTemplate?: string;
};

type PlatformDescriptionResult = {
  content: string;
  cta?: string;
  keywords?: string[];
  replyTemplate?: string;
};

function buildSystemPrompt(brand: BrandFields, options?: { appendCtaSeparately?: boolean }): string {
  const parts: string[] = [
    'You are a social media copywriter. Generate a short, engaging post description that fits the brand.',
  ];
  if (brand.targetAudience?.trim()) {
    parts.push(`Target audience: ${brand.targetAudience.trim()}`);
  }
  if (brand.toneOfVoice?.trim()) {
    parts.push(`Tone of voice: ${brand.toneOfVoice.trim()}`);
  }
  if (brand.toneExamples?.trim()) {
    parts.push(`Example tones or phrases to match:\n${brand.toneExamples.trim()}`);
  }
  if (brand.productDescription?.trim()) {
    parts.push(`Product/service: ${brand.productDescription.trim()}`);
  }
  if (brand.additionalContext?.trim()) {
    parts.push(`Additional context: ${brand.additionalContext.trim()}`);
  }
  parts.push(
    'Output only the post caption text, no meta-commentary. Keep it concise and platform-ready (e.g. 1-3 short paragraphs or bullet points).',
    'Rules: Use plain text only. Do not use markdown (no ** for bold, no * for italic). Do not use em dashes or en dashes; use commas, colons, or " to " instead. Do not include hashtags.'
  );
  if (!options?.appendCtaSeparately) {
    parts.push(
      'When Instructions specify a call-to-action (e.g. comment a keyword to receive a link), include that exact CTA in the caption. Do not replace it with a generic "link in bio" or "tap the link" unless the user asked for that.'
    );
  } else {
    parts.push(
      'Do not include a call-to-action, link-in-bio line, or comment-for-link line in the caption. The CTA will be added automatically after generation.'
    );
  }
  return parts.join('\n\n');
}

function cleanGeneratedText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/#\w+/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

function getPlatformHint(platform: string): string {
  const p = platform.toUpperCase();
  if (p === 'TWITTER') return `X (Twitter) has a ${TWITTER_AI_MAX_CHARS} character target including spaces. Keep the main post text under ${TWITTER_AI_MAX_CHARS} characters. Do not include hashtags. Be concise.`;
  if (p === 'LINKEDIN') return 'Professional tone. One to three short paragraphs. Suitable for a business audience.';
  if (p === 'INSTAGRAM') return 'Engaging and visual. Line breaks work well.';
  if (p === 'FACEBOOK') return 'Conversational. One or two short paragraphs.';
  if (p === 'TIKTOK') return 'Casual and punchy. Short lines. Hook in the first line.';
  if (p === 'YOUTUBE') return 'Descriptive but concise. Good for video captions or community posts.';
  if (p === 'PINTEREST') return 'Pinterest Pin description: searchable keywords naturally, short paragraphs or bullet-style lines, inspiring tone. No hashtag spam.';
  return '';
}

/** Merge CTA/automation instructions from the dedicated field and extra instructions. */
function mergeCtaInstructionSources(prompt: string, ctaAutomationPrompt: string): string {
  const parts = [ctaAutomationPrompt.trim(), prompt.trim()].filter(Boolean);
  return parts.join('\n');
}

function promptRequestsInPostCta(prompt: string): boolean {
  if (!prompt.trim()) return false;
  return /\b(call[\s-]?to[\s-]?action|cta|comment\s+["']?\w+|reply\s+with|dm\s+me|send\s+(you\s+)?(the\s+)?link|keyword)\b/i.test(prompt);
}

function ensureClosingCtaInContent(content: string, closingCta: string): string {
  return mergeCaptionWithCta(content, closingCta);
}

function clampTwitterCaption(content: string, platform: string, closingCta?: string): string {
  const platformUpper = platform.toUpperCase();
  if (platformUpper !== 'TWITTER' && platformUpper !== 'X') return content;
  const combined = closingCta ? `${content.trim()}\n\n${closingCta.trim()}` : content;
  if (combined.length <= TWITTER_AI_MAX_CHARS) return content;
  const maxContent = closingCta
    ? Math.max(0, TWITTER_AI_MAX_CHARS - closingCta.length - 2)
    : TWITTER_AI_MAX_CHARS;
  return content.slice(0, maxContent).trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Step 1: derive CTA line, comment keywords, and reply template from user instructions. */
async function generateCtaBundle(
  brand: BrandFields,
  topic: string,
  prompt: string,
  ctaInstructions: string
): Promise<CtaBundle | null> {
  const systemPrompt = [
    buildSystemPrompt(brand, { appendCtaSeparately: true }),
    'You configure comment-to-DM automation for social posts.',
    'Respond with JSON only, no markdown.',
  ].join('\n\n');

  const userContent = [
    topic && `Post topic: ${topic}`,
    prompt && `Post context: ${prompt}`,
    ctaInstructions && `User requirements (follow exactly): ${ctaInstructions}`,
    'Return JSON: {"cta":"one short call-to-action line for the post caption","keywords":["keyword1"],"replyTemplate":"short reply when someone comments the keyword"}.',
    'Rules for cta: MUST match the user requirements (e.g. if they want people to comment "AI" to get a link, say that clearly). Do NOT use generic "link in bio", "tap the link", or "check our bio" unless the user explicitly asked for bio links.',
    'Rules for keywords: use the exact comment trigger words the user wants (e.g. "ai" if they said comment AI).',
    'Rules for replyTemplate: mention sending the link or next step when appropriate.',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { max_tokens: 350 }
  );

  const parsed = parseJsonObject(result.content);
  if (!parsed || typeof parsed.cta !== 'string') return null;

  const cta = cleanGeneratedText(parsed.cta).slice(0, 200);
  if (!cta) return null;

  const keywords = Array.isArray(parsed.keywords)
    ? (parsed.keywords as unknown[])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5)
    : undefined;
  const replyTemplate =
    typeof parsed.replyTemplate === 'string'
      ? cleanGeneratedText(parsed.replyTemplate).slice(0, 500)
      : undefined;

  return {
    cta,
    ...(keywords?.length ? { keywords } : {}),
    ...(replyTemplate ? { replyTemplate } : {}),
  };
}

async function generateDescriptionForPlatform(
  brand: BrandFields,
  topic: string,
  prompt: string | undefined,
  platform: string,
  options?: { requiredClosingCta?: string; emphasizeInPostCta?: boolean }
): Promise<{ content: string }> {
  const requiredClosingCta = options?.requiredClosingCta?.trim();
  const systemPrompt = buildSystemPrompt(brand, {
    appendCtaSeparately: !!requiredClosingCta,
  });
  const platformHint = platform ? getPlatformHint(platform) : '';

  let userContent =
    [topic && `Topic: ${topic}`, prompt && `Instructions: ${prompt}`, platform && `Platform: ${platform}${platformHint ? `. ${platformHint}` : ''}. Do not include any hashtags in the content.`]
      .filter(Boolean)
      .join('\n') || 'Write a short social post that fits my brand. Do not include hashtags.';

  if (options?.emphasizeInPostCta && prompt?.trim()) {
    userContent +=
      '\n\nImportant: Include the call-to-action from Instructions in the post caption (exact wording or very close). Do not substitute a different CTA such as "link in bio".';
  }

  if (requiredClosingCta) {
    userContent +=
      '\n\nDo not write the call-to-action in the caption. It will be appended automatically after generation.';
    userContent += `\n\nRequired call-to-action (for reference only, do not paste into the caption):\n${requiredClosingCta}`;
    userContent +=
      '\nDo not add any other call-to-action (no link in bio, no tap the link).';
  }

  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { max_tokens: 500 }
  );

  let content = cleanGeneratedText(result.content);
  const platformUpper = platform.toUpperCase();
  if (platformUpper === 'TWITTER' || platformUpper === 'X') {
    content = clampTwitterCaption(content, platform, requiredClosingCta);
  }
  if (requiredClosingCta) {
    content = ensureClosingCtaInContent(content, requiredClosingCta);
  }

  return { content };
}

/** One OpenAI call for all platforms (much faster than N parallel calls). */
async function generateDescriptionsAllPlatforms(
  brand: BrandFields,
  topic: string,
  prompt: string | undefined,
  platforms: string[],
  closingCta?: string
): Promise<Record<string, string>> {
  const requiredClosingCta = closingCta?.trim();
  const systemPrompt = buildSystemPrompt(brand, { appendCtaSeparately: !!requiredClosingCta });
  const hints = platforms
    .map((p) => {
      const h = getPlatformHint(p);
      return h ? `${p}: ${h}` : p;
    })
    .join('\n');
  let userContent = [
    topic && `Topic: ${topic}`,
    prompt && `Instructions: ${prompt}`,
    `Write one caption per platform. Platforms: ${platforms.join(', ')}`,
    hints && `Platform notes:\n${hints}`,
    'Do not include hashtags.',
    'Return JSON only: an object whose keys are platform ids (e.g. INSTAGRAM, FACEBOOK) and values are caption strings.',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (requiredClosingCta) {
    userContent +=
      '\n\nDo not put the call-to-action inside captions; it will be appended automatically after generation.';
  }
  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { max_tokens: 1400, response_format: { type: 'json_object' } }
  );
  const parsed = parseJsonObject(result.content);
  const out: Record<string, string> = {};
  for (const p of platforms) {
    const raw =
      (parsed?.[p] as string | undefined) ??
      (parsed?.[p.toLowerCase()] as string | undefined) ??
      (parsed?.[p.toUpperCase()] as string | undefined);
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let content = cleanGeneratedText(raw);
    const platformUpper = p.toUpperCase();
    if (platformUpper === 'TWITTER' || platformUpper === 'X') {
      content = clampTwitterCaption(content, p, requiredClosingCta);
    }
    if (requiredClosingCta) {
      content = ensureClosingCtaInContent(content, requiredClosingCta);
    }
    out[p] = content;
  }
  const missing = platforms.filter((p) => !out[p]?.trim());
  if (missing.length > 0) {
    const fallback = await Promise.all(
      missing.map((p) =>
        generateDescriptionForPlatform(brand, topic, prompt, p, { requiredClosingCta }).then((r) => ({
          p,
          content: r.content,
        }))
      )
    );
    for (const { p, content } of fallback) {
      if (content.trim()) out[p] = content;
    }
  }
  return out;
}

async function generateWithCtaAndAutomation(
  brand: BrandFields,
  topic: string,
  prompt: string | undefined,
  platform: string,
  ctaInstructions: string
): Promise<{ content: string; cta?: string; keywords?: string[]; replyTemplate?: string }> {
  const bundle = await generateCtaBundle(brand, topic, prompt ?? '', ctaInstructions);
  const closingCta = bundle?.cta;

  const { content } = await generateDescriptionForPlatform(brand, topic, prompt, platform, {
    requiredClosingCta: closingCta,
    emphasizeInPostCta: !closingCta && !!prompt?.trim() && promptRequestsInPostCta(prompt),
  });

  return {
    content,
    ...(bundle?.cta ? { cta: bundle.cta } : {}),
    ...(bundle?.keywords?.length ? { keywords: bundle.keywords } : {}),
    ...(bundle?.replyTemplate ? { replyTemplate: bundle.replyTemplate } : {}),
  };
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { message: 'AI description generation is not configured (OPENAI_API_KEY)' },
      { status: 503 }
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    topic?: string;
    prompt?: string;
    platform?: string;
    platforms?: unknown;
    includeCtaAndAutomation?: boolean;
    ctaAutomationPrompt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const platformsMulti = Array.isArray(body.platforms)
    ? (body.platforms as unknown[])
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
  const includeCtaAndAutomation = body.includeCtaAndAutomation === true;
  const ctaAutomationPrompt = typeof body.ctaAutomationPrompt === 'string' ? body.ctaAutomationPrompt.trim() : '';
  const ctaInstructions = mergeCtaInstructionSources(prompt, ctaAutomationPrompt);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = user?.brandContext as Record<string, unknown> | null;
  if (!hasComposerBrandContext(ctx)) {
    return NextResponse.json(
      { message: 'Set up your brand context first in Dashboard → AI Assistant (target audience, tone, or product description).' },
      { status: 400 }
    );
  }
  const saved = ctx as Record<string, unknown>;
  const brand: BrandFields = {
    targetAudience: (saved.targetAudience as string | undefined) ?? null,
    toneOfVoice: (saved.toneOfVoice as string | undefined) ?? null,
    toneExamples: (saved.toneExamples as string | undefined) ?? null,
    productDescription: (saved.productDescription as string | undefined) ?? null,
    additionalContext: (saved.additionalContext as string | undefined) ?? null,
  };

  if (platformsMulti.length > 1) {
    trackUsage(userId, 'ai_generation', includeCtaAndAutomation ? 2 : 1);
    try {
      let ctaBundle: CtaBundle | null = null;
      if (includeCtaAndAutomation && ctaInstructions) {
        ctaBundle = await generateCtaBundle(brand, topic, prompt, ctaInstructions);
      }

      const byPlatform =
        platformsMulti.length >= 2
          ? await generateDescriptionsAllPlatforms(
              brand,
              topic,
              prompt || undefined,
              platformsMulti,
              ctaBundle?.cta
            )
          : (
              await (async (): Promise<Record<string, string>> => {
                const p = platformsMulti[0];
                if (includeCtaAndAutomation && ctaBundle) {
                  const r = await generateDescriptionForPlatform(brand, topic, prompt || undefined, p, {
                    requiredClosingCta: ctaBundle.cta,
                  });
                  return { [p]: r.content };
                }
                if (includeCtaAndAutomation) {
                  const r = await generateWithCtaAndAutomation(brand, topic, prompt || undefined, p, ctaInstructions);
                  return { [p]: r.content };
                }
                const r = await generateDescriptionForPlatform(brand, topic, prompt || undefined, p, {
                  emphasizeInPostCta: promptRequestsInPostCta(prompt),
                });
                return { [p]: r.content };
              })()
            );

      const automationMeta = ctaBundle;
      return NextResponse.json({
        byPlatform,
        ...(automationMeta?.cta ? { cta: automationMeta.cta } : {}),
        ...(automationMeta?.keywords?.length ? { keywords: automationMeta.keywords } : {}),
        ...(automationMeta?.replyTemplate ? { replyTemplate: automationMeta.replyTemplate } : {}),
      });
    } catch (e) {
      console.error('[OpenAI] generate-description batch', e instanceof Error ? e.message : e);
      return NextResponse.json(
        { message: 'AI service error. Try again later.' },
        { status: 502 }
      );
    }
  }

  trackUsage(userId, 'ai_generation', includeCtaAndAutomation ? 2 : 1);
  try {
    const out: PlatformDescriptionResult = includeCtaAndAutomation
      ? await generateWithCtaAndAutomation(brand, topic, prompt || undefined, platform, ctaInstructions)
      : await generateDescriptionForPlatform(brand, topic, prompt || undefined, platform, {
          emphasizeInPostCta: promptRequestsInPostCta(prompt),
        }).then((r) => ({ content: r.content }));

    if (includeCtaAndAutomation && (out.cta !== undefined || out.keywords?.length || out.replyTemplate)) {
      return NextResponse.json({
        content: out.content,
        ...(out.cta !== undefined ? { cta: out.cta } : {}),
        ...(out.keywords?.length ? { keywords: out.keywords } : {}),
        ...(out.replyTemplate ? { replyTemplate: out.replyTemplate } : {}),
      });
    }
    return NextResponse.json({ content: out.content });
  } catch (e) {
    console.error('[OpenAI] generate-description', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { message: 'AI service error. Try again later.' },
      { status: 502 }
    );
  }
}
