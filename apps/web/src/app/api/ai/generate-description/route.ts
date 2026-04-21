import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';

const TWITTER_AI_MAX_CHARS = 230;

type BrandFields = {
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
};

function buildSystemPrompt(brand: BrandFields): string {
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
  return parts.join('\n\n');
}

function cleanGeneratedText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/#\w+/g, '')             // remove #hashtags
    .replace(/\n\s*\n\s*\n/g, '\n\n') // collapse extra blank lines
    .replace(/  +/g, ' ')             // collapse multiple spaces
    .trim();
}

function getPlatformHint(platform: string): string {
  const p = platform.toUpperCase();
  if (p === 'TWITTER') return `X (Twitter) has a ${TWITTER_AI_MAX_CHARS} character target including spaces. Keep the main post text under ${TWITTER_AI_MAX_CHARS} characters. Do not include hashtags. Be concise. A clear CTA works well.`;
  if (p === 'LINKEDIN') return 'Professional tone. One to three short paragraphs. Suitable for a business audience.';
  if (p === 'INSTAGRAM') return 'Engaging and visual. Line breaks work well.';
  if (p === 'FACEBOOK') return 'Conversational. One or two short paragraphs.';
  if (p === 'TIKTOK') return 'Casual and punchy. Short lines. Hook in the first line.';
  if (p === 'YOUTUBE') return 'Descriptive but concise. Good for video captions or community posts.';
  if (p === 'PINTEREST') return 'Pinterest Pin description: searchable keywords naturally, short paragraphs or bullet-style lines, inspiring tone. No hashtag spam.';
  return '';
}

async function generateDescriptionForPlatform(
  brand: BrandFields,
  topic: string,
  prompt: string | undefined,
  platform: string,
  includeCtaAndAutomation: boolean,
  ctaAutomationPrompt: string | undefined
): Promise<{ content: string; cta?: string; keywords?: string[]; replyTemplate?: string }> {
  const systemPrompt = buildSystemPrompt(brand);
  const platformHint = platform ? getPlatformHint(platform) : '';
  let userContent = [topic && `Topic: ${topic}`, prompt && `Instructions: ${prompt}`, platform && `Platform: ${platform}${platformHint ? `. ${platformHint}` : ''}. Do not include any hashtags in the content.`]
    .filter(Boolean)
    .join('\n') || 'Write a short social post that fits my brand. Do not include hashtags.';
  if (includeCtaAndAutomation) {
    userContent += '\n\nAlso provide: (1) a short CTA (call-to-action) line. (2) Comment automation: 1-2 keywords and a short reply template for when someone comments with that keyword. Respond with a JSON object only, no markdown: {"content":"...","cta":"...","keywords":["keyword1","keyword2"],"replyTemplate":"..."}. Use double quotes. Content = main post text; cta = one line; keywords = array of strings; replyTemplate = one short reply sentence.';
    if (ctaAutomationPrompt) {
      userContent += `\n\nUser instructions for CTA and automation: ${ctaAutomationPrompt}`;
    }
  }

  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { max_tokens: includeCtaAndAutomation ? 600 : 500 }
  );
  const raw = result.content;

  if (includeCtaAndAutomation) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? (() => { try { return JSON.parse(jsonMatch[0]) as Record<string, unknown>; } catch { return null; } })() : null;
    if (parsed && typeof parsed.content === 'string') {
      let content = cleanGeneratedText(parsed.content);
      const cta = typeof parsed.cta === 'string' ? cleanGeneratedText(parsed.cta).slice(0, 200) : undefined;
      const platformUpper = platform.toUpperCase();
      if (platformUpper === 'TWITTER' || platformUpper === 'X') {
        // Keep content + CTA within Twitter AI target.
        const combined = cta ? `${content.trim()}\n\n${cta.trim()}` : content;
        if (combined.length > TWITTER_AI_MAX_CHARS) {
          const maxContent = cta ? Math.max(0, TWITTER_AI_MAX_CHARS - cta.length - 2) : TWITTER_AI_MAX_CHARS;
          content = content.slice(0, maxContent).trim();
        }
      }
      const keywords = Array.isArray(parsed.keywords)
        ? (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 5)
        : undefined;
      const replyTemplate = typeof parsed.replyTemplate === 'string' ? cleanGeneratedText(parsed.replyTemplate).slice(0, 500) : undefined;
      return {
        content,
        ...(cta !== undefined ? { cta } : {}),
        ...(keywords?.length ? { keywords } : {}),
        ...(replyTemplate ? { replyTemplate } : {}),
      };
    }
  }

  let content = cleanGeneratedText(raw);
  const platformUpper = platform.toUpperCase();
  if (platformUpper === 'TWITTER' || platformUpper === 'X') {
    const max = TWITTER_AI_MAX_CHARS;
    if (content.length > max) content = content.slice(0, max).trim();
  }
  return { content };
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = user?.brandContext as Record<string, unknown> | null;
  if (!ctx) {
    return NextResponse.json(
      { message: 'Set up your brand context first in Dashboard > AI Assistant' },
      { status: 400 }
    );
  }
  const brand: BrandFields = {
    targetAudience: (ctx.targetAudience as string | undefined) ?? null,
    toneOfVoice: (ctx.toneOfVoice as string | undefined) ?? null,
    toneExamples: (ctx.toneExamples as string | undefined) ?? null,
    productDescription: (ctx.productDescription as string | undefined) ?? null,
    additionalContext: (ctx.additionalContext as string | undefined) ?? null,
  };

  if (platformsMulti.length > 1) {
    trackUsage(userId, 'ai_generation', platformsMulti.length);
    try {
      const results = await Promise.all(
        platformsMulti.map((p, i) =>
          generateDescriptionForPlatform(
            brand,
            topic,
            prompt || undefined,
            p,
            i === 0 && includeCtaAndAutomation,
            i === 0 && includeCtaAndAutomation ? ctaAutomationPrompt || undefined : undefined
          )
        )
      );
      const byPlatform: Record<string, string> = {};
      for (let i = 0; i < platformsMulti.length; i++) {
        byPlatform[platformsMulti[i]] = results[i].content;
      }
      const first = results[0];
      return NextResponse.json({
        byPlatform,
        ...(typeof first.cta === 'string' ? { cta: first.cta } : {}),
        ...(first.keywords?.length ? { keywords: first.keywords } : {}),
        ...(first.replyTemplate ? { replyTemplate: first.replyTemplate } : {}),
      });
    } catch (e) {
      console.error('[OpenAI] generate-description batch', e instanceof Error ? e.message : e);
      return NextResponse.json(
        { message: 'AI service error. Try again later.' },
        { status: 502 }
      );
    }
  }

  trackUsage(userId, 'ai_generation');
  try {
    const out = await generateDescriptionForPlatform(
      brand,
      topic,
      prompt || undefined,
      platform,
      includeCtaAndAutomation,
      includeCtaAndAutomation ? ctaAutomationPrompt || undefined : undefined
    );
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
