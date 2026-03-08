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
    'You are a social media copywriter. Generate a single, engaging caption for a short-form video (Reel, TikTok, Short). The caption should match the brand, include a clear call-to-action (CTA), and be ready to paste into the post. Output only the caption text, no meta-commentary.',
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
    'Rules: Use plain text only. No markdown (no ** or *). No em dashes or en dashes; use commas or " to " instead. Include a clear CTA (e.g. "Follow for more", "Save this", "Comment below"). Keep it concise, 1-3 short lines. Do not include hashtags unless the user context asks for them.'
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
    .replace(/#\w+/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * POST /api/reels/generate-caption
 * Generates a caption for a reel based on video context and AI Assistant brand guidelines.
 * Body: { videoUrl?, transcript?, durationSec? }
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: 'Caption generation is not configured (OPENROUTER_API_KEY).' },
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

  let body: { videoUrl?: string; transcript?: string; durationSec?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  const durationSec = typeof body.durationSec === 'number' ? body.durationSec : undefined;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = user?.brandContext as Record<string, unknown> | null;
  if (!ctx) {
    return NextResponse.json(
      { message: 'Set up your brand in Dashboard > AI Assistant to generate captions.' },
      { status: 400 }
    );
  }

  const brand = {
    targetAudience: (ctx.targetAudience as string | undefined) ?? null,
    toneOfVoice: (ctx.toneOfVoice as string | undefined) ?? null,
    toneExamples: (ctx.toneExamples as string | undefined) ?? null,
    productDescription: (ctx.productDescription as string | undefined) ?? null,
    additionalContext: (ctx.additionalContext as string | undefined) ?? null,
  };

  const systemPrompt = buildSystemPrompt(brand);
  const userParts: string[] = [
    'Generate a caption for this short-form video that matches my brand and includes a clear CTA.',
  ];
  if (durationSec != null) {
    userParts.push(`Video length: ${durationSec.toFixed(0)} seconds.`);
  }
  if (transcript) {
    userParts.push(`Transcript or content description:\n${transcript.slice(0, 2000)}`);
  }
  if (!transcript) {
    userParts.push('No transcript was provided. Write a versatile, engaging caption that fits short-form video and encourages engagement.');
  }
  userParts.push('Output only the caption text, nothing else.');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || '',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts.join('\n\n') },
      ],
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[reels/generate-caption]', res.status, errText);
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
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
  const content = cleanGeneratedText(raw);
  return NextResponse.json({ content });
}
