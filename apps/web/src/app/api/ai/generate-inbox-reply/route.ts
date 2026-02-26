import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-4.1-mini';

function cleanReply(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { message: 'AI reply generation is not configured (OPENROUTER_API_KEY)' },
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

  let body: { type?: string; text?: string; context?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const type = body.type === 'comment' || body.type === 'message' ? body.type : 'comment';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim().toUpperCase() : '';

  if (!text) {
    return NextResponse.json({ message: 'text is required (the message or comment to reply to)' }, { status: 400 });
  }

  const brand = await prisma.brandContext.findUnique({ where: { userId } });
  const systemParts: string[] = [
    'You are a helpful assistant that writes short, natural replies for social media inbox messages and comments.',
    'Output only the reply text, nothing else. No quotes, no "Reply:", no meta-commentary.',
    'Keep it concise and friendly (typically 1-3 sentences). Match the tone of the conversation.',
    'Use plain text only. No markdown (no ** or *). No em dashes or en dashes; use commas or " to " instead.',
  ];
  if (brand?.toneOfVoice?.trim()) {
    systemParts.push(`Tone to match: ${brand.toneOfVoice.trim()}`);
  }
  if (brand?.toneExamples?.trim()) {
    systemParts.push(`Example phrases: ${brand.toneExamples.trim().slice(0, 200)}`);
  }
  const systemPrompt = systemParts.join('\n');

  const typeLabel = type === 'comment' ? 'Comment' : 'Message';
  let userContent = `${typeLabel} to reply to:\n"${text.slice(0, 1500)}"`;
  if (context) {
    userContent += `\n\nContext (e.g. post or thread): ${context.slice(0, 500)}`;
  }
  if (platform) {
    const hints: Record<string, string> = {
      TWITTER: 'Keep under 280 characters.',
      INSTAGRAM: 'Conversational, can use emojis sparingly.',
      FACEBOOK: 'Friendly and clear.',
    };
    if (hints[platform]) userContent += `\n\nPlatform: ${platform}. ${hints[platform]}`;
  }
  userContent += '\n\nGenerate a single short reply that the user can send as-is or edit.';

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 250,
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
    console.error('[OpenRouter] generate-inbox-reply', res.status, errText);
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
  const reply = cleanReply(raw).slice(0, 2000);
  return NextResponse.json({ reply: reply || "Thanks for your message!" });
}
