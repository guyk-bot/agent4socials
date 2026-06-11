import { BRAND_NAME } from '@/lib/site-brand-assets';
import type { AysopChatInputMessage } from '@/lib/ai/aysop-openai-messages';

const DATA_INTENT =
  /\b(analytics|followers?|comments?|inbox|leads?|posts?|schedule|scheduled|connect|report|chart|graph|scan|reply|replies|draft|caption|publish|instagram|tiktok|facebook|youtube|threads|linkedin|pinterest|twitter|brand context|team|brainstorm|support|metrics?|engagement|views?|likes?)\b/i;

const CASUAL_GREETING =
  /^(hi|hello|hey|howdy|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|great|nice|got it|sounds good|bye|goodbye)\b[!.,?\s]*$/i;

const CAPABILITY_QUESTION = /^(what can you (do|help with)|help me|who are you)\??$/i;

/** Skip tool schemas + heavy prompt for obvious chit-chat (saves latency and tokens). */
export function isCasualAysopChatMessage(messages: AysopChatInputMessage[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return false;
  if (last.attachments?.length) return false;

  const text = last.content.trim();
  if (!text || text.length > 140) return false;
  if (DATA_INTENT.test(text)) return false;

  return CASUAL_GREETING.test(text) || CAPABILITY_QUESTION.test(text);
}

export function buildCasualAysopSystemPrompt(): string {
  return [
    `You are ${BRAND_NAME} AI inside the ${BRAND_NAME} dashboard.`,
    'Reply in one or two short sentences. Plain text only, no markdown.',
    'You help with connecting accounts, posts, scheduling, inbox replies, analytics, brand context, and leads.',
    'If they need live numbers or inbox data, tell them to ask specifically (e.g. "show my Instagram analytics" or "Threads replies this week").',
    'No em dashes.',
  ].join('\n');
}

export function instantCasualAysopReply(messages: AysopChatInputMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content.trim() ?? '';
  if (CASUAL_GREETING.test(text)) {
    return `Hi! I'm ${BRAND_NAME} AI. Ask about analytics, inbox, posts, or leads and I'll pull live data from your workspace.`;
  }
  if (CAPABILITY_QUESTION.test(text)) {
    return `I'm ${BRAND_NAME} AI. I can connect platforms, draft posts, show inbox comments, run analytics, manage brand context, and save leads. What do you want to do first?`;
  }
  return null;
}
