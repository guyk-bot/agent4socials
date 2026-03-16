/**
 * OpenAI Chat Completions client for server-side use.
 * Set OPENAI_API_KEY in env (and optionally OPENAI_CHAT_MODEL, default gpt-4o-mini).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIChatOptions {
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
}

export interface OpenAIChatResult {
  content: string;
  model: string;
}

/**
 * Call OpenAI Chat Completions. Throws on error or missing key.
 */
export async function openAiChat(
  messages: OpenAIChatMessage[],
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const model = process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.max_tokens ?? 500,
  };
  if (options.response_format) {
    body.response_format = options.response_format;
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  return { content, model: data.model ?? model };
}
