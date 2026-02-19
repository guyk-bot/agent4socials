import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-4.1-mini';

function buildSystemPrompt(brand: {
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
}): string {
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
    'Rules: Use plain text only. Do not use markdown (no ** for bold, no * for italic). Do not use em dashes or en dashes; use commas, colons, or " to " instead.'
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
    .trim();
}

function getPlatformHint(platform: string): string {
  const p = platform.toUpperCase();
  if (p === 'TWITTER') return 'Keep it concise (under 280 characters works best). Hashtags and a clear CTA work well.';
  if (p === 'LINKEDIN') return 'Professional tone. One to three short paragraphs. Suitable for a business audience.';
  if (p === 'INSTAGRAM') return 'Engaging and visual. Line breaks and a few hashtags work well.';
  if (p === 'FACEBOOK') return 'Conversational. One or two short paragraphs.';
  if (p === 'TIKTOK') return 'Casual and punchy. Short lines. Hook in the first line.';
  if (p === 'YOUTUBE') return 'Descriptive but concise. Good for video captions or community posts.';
  return '';
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { message: 'AI description generation is not configured (OPENROUTER_API_KEY)' },
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
  let body: { topic?: string; prompt?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';

  const brand = await prisma.brandContext.findUnique({ where: { userId } });
  if (!brand) {
    return NextResponse.json(
      { message: 'Set up your brand context first in Dashboard > AI Assistant' },
      { status: 400 }
    );
  }

  const systemPrompt = buildSystemPrompt(brand);
  const platformHint = platform ? getPlatformHint(platform) : '';
  const userContent = [topic && `Topic: ${topic}`, prompt && `Instructions: ${prompt}`, platform && `Platform: ${platform}${platformHint ? `. ${platformHint}` : ''}`]
    .filter(Boolean)
    .join('\n') || 'Write a short social post that fits my brand.';

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 500,
  };

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || '',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[OpenRouter]', res.status, errText);
    return NextResponse.json(
      { message: 'AI service error. Try again later.' },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    return NextResponse.json({ message: data.error.message }, { status: 502 });
  }
  let content = data.choices?.[0]?.message?.content?.trim() ?? '';
  content = cleanGeneratedText(content);
  return NextResponse.json({ content });
}
