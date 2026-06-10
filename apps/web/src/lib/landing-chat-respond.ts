import { openAiChat } from '@/lib/openai-client';
import { isAysopLlmConfigured } from '@/lib/ai/llm-config';
import {
  answerLandingChatQuestion,
  type LandingChatContext,
} from '@/lib/chat-hero-script';
import {
  LANDING_CHAT_SUPPORT_FALLBACK,
  landingChatKnowledgeBlock,
} from '@/lib/landing-chat-knowledge';

const MAX_REPLY_CHARS = 420;

function buildLandingChatSystemPrompt(): string {
  return [
    'You are iZop, the AI assistant on the izop.io marketing funnel (pre-signup).',
    'Answer ONLY about iZop the product: features, pricing, platforms, signup, connect flow, inbox, scheduling, analytics, AI, plans, and support.',
    'Rules:',
    '- Replies must be 1 to 3 short sentences. No bullet lists unless the user asks for a list.',
    '- Be specific to iZop. Never say you are a generic AI or ChatGPT.',
    '- Use exact plan names: Free, Standard, Pro (not Starter).',
    '- If the question is off-topic, unrelated to iZop, or not covered in the knowledge below, reply with exactly this support message and nothing else:',
    `"${LANDING_CHAT_SUPPORT_FALLBACK}"`,
    '- Do not invent features, prices, or platform support not listed below.',
    '- Do not ask users to email you; point to the support URL for unknowns.',
    '',
    'Knowledge:',
    landingChatKnowledgeBlock(),
  ].join('\n');
}

function trimReply(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= MAX_REPLY_CHARS) return t;
  const cut = t.slice(0, MAX_REPLY_CHARS);
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  if (lastStop > 80) return cut.slice(0, lastStop + 1).trim();
  return `${cut.trim()}…`;
}

function looksLikeSupportFallback(text: string): boolean {
  return /support ticket|typically repl|within 24 hours/i.test(text);
}

export async function respondLandingChat(ctx: LandingChatContext): Promise<{
  text: string;
  source: 'llm' | 'script';
}> {
  const scripted = answerLandingChatQuestion(ctx);

  if (!isAysopLlmConfigured()) {
    return { text: scripted, source: 'script' };
  }

  try {
    const userLines = [
      `User message: ${ctx.text}`,
      `Funnel step: ${ctx.step}`,
      ctx.selectedPlatformIds.length
        ? `Platforms selected in UI: ${ctx.selectedPlatformIds.join(', ')}`
        : null,
      ctx.matchedPlatforms.length ? `Platforms mentioned: ${ctx.matchedPlatforms.join(', ')}` : null,
      ctx.matchedPain ? `Pain point matched: ${ctx.matchedPain}` : null,
      'Reply in iZop voice. Stay short.',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await openAiChat(
      [
        { role: 'system', content: buildLandingChatSystemPrompt() },
        { role: 'user', content: userLines },
      ],
      {
        model: process.env.LANDING_CHAT_MODEL?.trim() || 'gpt-4.1-nano',
        providerScope: 'default',
        max_tokens: 140,
      }
    );

    const llmText = trimReply(result.content);
    if (!llmText) {
      return { text: scripted, source: 'script' };
    }

    if (looksLikeSupportFallback(llmText)) {
      return { text: LANDING_CHAT_SUPPORT_FALLBACK, source: 'llm' };
    }

    return { text: llmText, source: 'llm' };
  } catch {
    return { text: scripted, source: 'script' };
  }
}
