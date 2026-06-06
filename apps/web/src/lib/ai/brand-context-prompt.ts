import { parseBrandContextApiPayload } from '@/lib/brand-context-utils';

/** Format AI Assistant brand context for copilot / chat system prompts (server-safe). */
export function formatBrandContextForPrompt(raw: unknown): string | null {
  const c = parseBrandContextApiPayload(raw);
  const parts: string[] = [];
  if (String(c.targetAudience ?? '').trim()) {
    parts.push(`Target audience: ${String(c.targetAudience).trim()}`);
  }
  if (String(c.toneOfVoice ?? '').trim()) {
    parts.push(`Tone of voice: ${String(c.toneOfVoice).trim()}`);
  }
  if (String(c.toneExamples ?? '').trim()) {
    parts.push(`Tone examples to match:\n${String(c.toneExamples).trim()}`);
  }
  if (String(c.productDescription ?? '').trim()) {
    parts.push(`Product or service: ${String(c.productDescription).trim()}`);
  }
  if (String(c.additionalContext ?? '').trim()) {
    parts.push(`Additional brand context: ${String(c.additionalContext).trim()}`);
  }
  if (String(c.inboxReplyExamples ?? '').trim()) {
    parts.push(`Example inbox reply style:\n${String(c.inboxReplyExamples).trim()}`);
  }
  if (String(c.commentReplyExamples ?? '').trim()) {
    parts.push(`Example comment reply style:\n${String(c.commentReplyExamples).trim()}`);
  }
  if (!parts.length) return null;
  return [
    'Brand context from AI Assistant (use when drafting captions, explaining the brand, or answering "what is my brand about"):',
    ...parts,
    'When the user asks about their brand, product, or voice, answer from this context. Match this tone in generated copy.',
  ].join('\n');
}
