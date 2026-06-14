import type { IzopChatInputMessage } from '@/lib/ai/izop-openai-messages';

/** Recent turns sent to the model. Full history stays in the chat UI and database. */
export const IZOP_CHAT_LLM_CONTEXT_MESSAGES = Number(process.env.IZOP_CHAT_LLM_CONTEXT_MESSAGES) || 32;

export function trimMessagesForLlmContext(messages: IzopChatInputMessage[]): {
  messages: IzopChatInputMessage[];
  omittedCount: number;
} {
  if (messages.length <= IZOP_CHAT_LLM_CONTEXT_MESSAGES) {
    return { messages, omittedCount: 0 };
  }

  const omittedCount = messages.length - IZOP_CHAT_LLM_CONTEXT_MESSAGES;
  let tail = messages.slice(-IZOP_CHAT_LLM_CONTEXT_MESSAGES);
  while (tail.length > 0 && tail[0]?.role === 'assistant') {
    tail = tail.slice(1);
  }
  return { messages: tail, omittedCount };
}
