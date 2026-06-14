import { openAiChat } from '@/lib/openai-client';
import { isIzopLlmConfigured } from '@/lib/ai/llm-config';
import {
  answerLandingChatQuestion,
  answerLandingChatPriority,
  type LandingChatContext,
} from '@/lib/chat-hero-script';
import {
  fillBrandContextFromChat,
  type BrandContextFillResult,
  shouldAssistBrandContextForm,
} from '@/lib/funnel/brand-context-chat-fill';
import {
  LANDING_CHAT_SUPPORT_FALLBACK,
  landingChatKnowledgeBlock,
} from '@/lib/landing-chat-knowledge';

const MAX_REPLY_CHARS = 420;

function buildLandingChatSystemPrompt(): string {
  return [
    'You are iZop, the AI assistant on the izop.ai marketing funnel (pre-signup demo only).',
    'Answer ONLY about iZop the product: features, pricing, platforms, signup, connect flow, inbox, scheduling, analytics, AI, plans, and support.',
    'Rules:',
    '- Replies must be 1 to 3 short sentences. No bullet lists unless the user asks for a list.',
    '- Be specific to iZop. Never say you are a generic AI or ChatGPT.',
    '- Use exact plan names: Free, Standard, Pro (not Starter).',
    '- If the user has NOT connected an account yet, this funnel chat cannot publish or run live analytics. Tell them to connect a platform first, then they get one free post (text or media) and one free analytics snapshot here before signing in.',
    '- If the user HAS connected an account (connectedAccountId in context), they may get one free post (text or media) and one free analytics snapshot from this chat. Do not tell them they must sign in before trying once. After that trial, point them to sign in for the full app.',
    '- The user can upload images and videos. If they upload media, acknowledge it and offer to help create a post with it.',
    '- This funnel chat cannot schedule posts, run ads, or use inbox tools. For those, sign in at izop.ai.',
    '- If the user asks about ads or running campaigns, say ads are in development and registered users will get an email when it launches. Do not use the support fallback for ads questions.',
    '- If the question is off-topic, unrelated to iZop, or not covered in the knowledge below, reply with exactly this support message and nothing else:',
    `"${LANDING_CHAT_SUPPORT_FALLBACK}"`,
    '- When users ask for a link (pricing, signup, login, help, dashboard), reply with the full https URL from the Links section below. Do not use the support fallback for link requests.',
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

export type LandingChatResponse = {
  text: string;
  source: 'llm' | 'script' | 'brand_fill';
  brandContextUpdate?: BrandContextRecord | null;
  hashtagPoolUpdate?: string | null;
};

type BrandContextRecord = import('@/lib/brand-context-utils').BrandContextRecord;

export async function respondLandingChat(
  ctx: LandingChatContext,
  options?: { guestUserId?: string | null; hashtagPool?: string }
): Promise<LandingChatResponse> {
  if (shouldAssistBrandContextForm(ctx)) {
    const filled: BrandContextFillResult = await fillBrandContextFromChat({
      ctx,
      guestUserId: options?.guestUserId,
      hashtagPool: options?.hashtagPool,
    });
    return {
      text: filled.text,
      source: filled.source,
      brandContextUpdate: filled.brandContextUpdate,
      hashtagPoolUpdate: filled.hashtagPoolUpdate,
    };
  }

  const priority = answerLandingChatPriority(ctx);
  if (priority) {
    return { text: priority, source: 'script' };
  }

  const scripted = answerLandingChatQuestion(ctx);

  if (!isIzopLlmConfigured()) {
    return { text: scripted, source: 'script' };
  }

  try {
  const userLines = [
    `User message: ${ctx.text}`,
    ctx.attachments?.length ? `Uploaded files: ${ctx.attachments.map(a => `${a.fileName} (${a.contentType.startsWith('image/') ? 'image' : 'video'})`).join(', ')}` : null,
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
