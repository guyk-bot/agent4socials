import type { AysopChatInputMessage } from '@/lib/ai/aysop-openai-messages';

/** Max messages the client may send per request (full history in DB/UI). */
export const AYSOP_CHAT_MAX_STORED_MESSAGES = Number(process.env.AYSOP_CHAT_MAX_STORED_MESSAGES) || 300;

/** Recent turns sent to the model (older turns stay saved in the chat). */
export const AYSOP_CHAT_LLM_CONTEXT_MESSAGES = Number(process.env.AYSOP_CHAT_LLM_CONTEXT_MESSAGES) || 100;

export function trimMessagesForLlmContext(messages: AysopChatInputMessage[]): {
  messages: AysopChatInputMessage[];
  omittedCount: number;
} {
  if (messages.length <= AYSOP_CHAT_LLM_CONTEXT_MESSAGES) {
    return { messages, omittedCount: 0 };
  }

  const omittedCount = messages.length - AYSOP_CHAT_LLM_CONTEXT_MESSAGES;
  let tail = messages.slice(-AYSOP_CHAT_LLM_CONTEXT_MESSAGES);
  while (tail.length > 0 && tail[0]?.role === 'assistant') {
    tail = tail.slice(1);
  }
  return { messages: tail, omittedCount };
}
