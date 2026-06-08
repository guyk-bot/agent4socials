import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';

type BrandFields = {
  targetAudience: string | null;
  toneOfVoice: string | null;
  productDescription: string | null;
  additionalContext: string | null;
};

function buildBrandContextLines(brand: BrandFields): string {
  const parts: string[] = [];
  if (brand.targetAudience?.trim()) parts.push(`Target audience: ${brand.targetAudience.trim()}`);
  if (brand.toneOfVoice?.trim()) parts.push(`Tone of voice: ${brand.toneOfVoice.trim()}`);
  if (brand.productDescription?.trim()) parts.push(`Product/service: ${brand.productDescription.trim()}`);
  if (brand.additionalContext?.trim()) parts.push(`Additional context: ${brand.additionalContext.trim()}`);
  return parts.join('\n');
}

function cleanIdea(text: string): string {
  return text
    .replace(/^\s*[-*\d.)\]]+\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .trim();
}

function parseIdeas(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { ideas?: unknown };
      if (Array.isArray(parsed.ideas)) {
        return parsed.ideas
          .filter((i): i is string => typeof i === 'string')
          .map(cleanIdea)
          .filter(Boolean);
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  return raw
    .split('\n')
    .map(cleanIdea)
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { message: 'AI idea generation is not configured (OPENAI_API_KEY)' },
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

  let body: { section?: string; prompt?: string; count?: number; existing?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const section = typeof body.section === 'string' ? body.section.trim() : 'Ideas';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);
  const existing = Array.isArray(body.existing)
    ? (body.existing as unknown[]).filter((e): e is string => typeof e === 'string').slice(0, 30)
    : [];

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const ctx = (user?.brandContext as Record<string, unknown> | null) ?? {};
  const brand: BrandFields = {
    targetAudience: (ctx.targetAudience as string | undefined) ?? null,
    toneOfVoice: (ctx.toneOfVoice as string | undefined) ?? null,
    productDescription: (ctx.productDescription as string | undefined) ?? null,
    additionalContext: (ctx.additionalContext as string | undefined) ?? null,
  };
  const brandLines = buildBrandContextLines(brand);

  const systemPrompt = [
    'You are a social media content strategist helping a creator brainstorm.',
    brandLines ? `Brand context:\n${brandLines}` : 'No brand context provided; keep ideas broadly useful.',
    'Generate concise, specific, actionable items the creator can act on.',
    'Rules: Plain text only. No markdown. No hashtags. No em dashes or en dashes; use commas or " to " instead. Each item one sentence or short phrase.',
    'Respond with JSON only: {"ideas":["...","..."]}.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const userContent = [
    `Brainstorm section: "${section}".`,
    prompt ? `Focus / instructions: ${prompt}` : '',
    existing.length ? `Avoid repeating these existing items:\n${existing.map((e) => `- ${e}`).join('\n')}` : '',
    `Return ${count} fresh ${section.toLowerCase()} items.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  trackUsage(userId, 'ai_generation', 1);
  try {
    const result = await openAiChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { max_tokens: 600, response_format: { type: 'json_object' } }
    );
    const ideas = parseIdeas(result.content).slice(0, count);
    if (!ideas.length) {
      return NextResponse.json({ message: 'No ideas generated, try again.' }, { status: 502 });
    }
    return NextResponse.json({ ideas });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error('[OpenAI] brainstorm-ideas', raw);
    return NextResponse.json(
      { message: raw.length < 280 ? raw : 'AI service error. Try again later.' },
      { status: 502 }
    );
  }
}
