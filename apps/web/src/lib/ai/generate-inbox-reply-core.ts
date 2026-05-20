import { openAiChat } from '@/lib/openai-client';

export type InboxReplyBrandContext = {
  toneOfVoice?: string | null;
  toneExamples?: string | null;
  inboxReplyExamples?: string | null;
  commentReplyExamples?: string | null;
};

export type GenerateInboxReplyInput = {
  type: 'comment' | 'message';
  text: string;
  context?: string;
  platform?: string;
  brand?: InboxReplyBrandContext | null;
};

export function cleanInboxReply(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

export async function generateInboxReply(input: GenerateInboxReplyInput): Promise<string> {
  const type = input.type;
  const text = input.text.trim();
  const context = input.context?.trim() ?? '';
  const platform = input.platform?.trim().toUpperCase() ?? '';
  const brand = input.brand;

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
  if (type === 'message' && brand?.inboxReplyExamples?.trim()) {
    systemParts.push(
      `Example inbox reply messages to match style and tone:\n${brand.inboxReplyExamples.trim().slice(0, 500)}`
    );
  }
  if (type === 'comment' && brand?.commentReplyExamples?.trim()) {
    systemParts.push(
      `Example comment replies to match style and tone:\n${brand.commentReplyExamples.trim().slice(0, 500)}`
    );
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
      YOUTUBE: 'Friendly and clear.',
      LINKEDIN: 'Professional but warm.',
    };
    if (hints[platform]) userContent += `\n\nPlatform: ${platform}. ${hints[platform]}`;
  }
  userContent += '\n\nGenerate a single short reply that the user can send as-is or edit.';

  const result = await openAiChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { max_tokens: 250 }
  );

  const reply = cleanInboxReply(result.content).slice(0, 2000);
  return reply || 'Thanks for your message!';
}
