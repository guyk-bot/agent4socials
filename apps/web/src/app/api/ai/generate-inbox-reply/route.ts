import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { openAiChat } from '@/lib/openai-client';
import { trackUsage } from '@/lib/usage-tracking';

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
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { message: 'AI reply generation is not configured (OPENAI_API_KEY)' },
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
  trackUsage(userId, 'ai_generation');

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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { brandContext: true } });
  const brand = user?.brandContext as { toneOfVoice?: string; toneExamples?: string; inboxReplyExamples?: string; commentReplyExamples?: string } | null;
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
    systemParts.push(`Example phrases for general tone: ${brand.toneExamples.trim().slice(0, 200)}`);
  }
  // Use type-specific examples if available
  if (type === 'message' && brand?.inboxReplyExamples?.trim()) {
    systemParts.push(`Example inbox reply messages to match style and tone:\n${brand.inboxReplyExamples.trim().slice(0, 500)}`);
  }
  if (type === 'comment' && brand?.commentReplyExamples?.trim()) {
    systemParts.push(`Example comment replies to match style and tone:\n${brand.commentReplyExamples.trim().slice(0, 500)}`);
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

  let raw: string;
  try {
    const result = await openAiChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { max_tokens: 250 }
    );
    raw = result.content;
  } catch (e) {
    console.error('[OpenAI] generate-inbox-reply', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { message: 'AI service error. Try again later.' },
      { status: 502 }
    );
  }
  const reply = cleanReply(raw).slice(0, 2000);
  return NextResponse.json({ reply: reply || "Thanks for your message!" });
}
