/**
 * OpenAI Chat Completions client for server-side use.
 * Set OPENAI_API_KEY in env (and optionally OPENAI_CHAT_MODEL, default gpt-4.1-nano).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-nano';

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface OpenAIChatMessage {
  role: 'system' | 'assistant';
  content: string;
}

export type OpenAIUserMessage = {
  role: 'user';
  content: string | OpenAIContentPart[];
};

export interface OpenAIChatOptions {
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
  /** Override OPENAI_CHAT_MODEL for this request (e.g. faster inbox batch). */
  model?: string;
}

export interface OpenAIChatResult {
  content: string;
  model: string;
}

export type OpenAIToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type OpenAIChatMessageWithTools =
  | OpenAIChatMessage
  | OpenAIUserMessage
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface OpenAIChatWithToolsResult {
  message: { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] };
  model: string;
  finish_reason: string | null;
}

/**
 * Call OpenAI Chat Completions with optional tools.
 */
export async function openAiChatWithTools(
  messages: OpenAIChatMessageWithTools[],
  tools: OpenAIToolDefinition[],
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatWithToolsResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const model = options.model?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.max_tokens ?? 800,
    tools,
    tool_choice: 'auto',
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
    choices?: Array<{
      message?: { role: 'assistant'; content?: string | null; tool_calls?: OpenAIToolCall[] };
      finish_reason?: string | null;
    }>;
    model?: string;
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  const choice = data.choices?.[0];
  const message = choice?.message ?? { role: 'assistant' as const, content: '' };
  return {
    message: {
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    },
    model: data.model ?? model,
    finish_reason: choice?.finish_reason ?? null,
  };
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
  const model = options.model?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_MODEL;
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
