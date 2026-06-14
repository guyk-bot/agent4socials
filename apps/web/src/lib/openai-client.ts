/**
 * Chat Completions client (OpenAI or OpenRouter for iZop AI).
 * Default: OPENAI_API_KEY + api.openai.com
 * iZop AI: Izop_AI / OPENROUTER_API_KEY + openrouter.ai (default model openai/gpt-4.1-nano)
 */

import { resolveLlmConfig, type ResolvedLlmConfig } from '@/lib/ai/llm-config';

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type OpenAIUserMessage = {
  role: 'user';
  content: string | OpenAIContentPart[];
};

export interface OpenAIChatOptions {
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
  model?: string;
  /** Use OpenRouter for iZop AI when Izop_AI is set. Default uses OpenAI directly. */
  providerScope?: 'default' | 'aysop';
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

async function postChatCompletions(
  config: ResolvedLlmConfig,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(config.chatCompletionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function providerLabel(config: ResolvedLlmConfig): string {
  return config.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
}

/**
 * Call Chat Completions with optional tools.
 */
export async function openAiChatWithTools(
  messages: OpenAIChatMessageWithTools[],
  tools: OpenAIToolDefinition[],
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatWithToolsResult> {
  const scope = options.providerScope ?? 'default';
  const config = resolveLlmConfig(scope, options.model);
  const model = config.model;

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

  const res = await postChatCompletions(config, body);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${providerLabel(config)} API error: ${res.status} ${errText}`);
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
 * Call Chat Completions. Throws on error or missing key.
 */
export async function openAiChat(
  messages: OpenAIChatMessage[],
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
  return openAiChatWithUserParts(messages, options);
}

/** Chat Completions with optional multimodal user content (images). */
export async function openAiChatWithUserParts(
  messages: Array<
    | OpenAIChatMessage
    | OpenAIUserMessage
    | { role: 'assistant'; content: string }
  >,
  options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
  const scope = options.providerScope ?? 'default';
  const config = resolveLlmConfig(scope, options.model);
  const model = config.model;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.max_tokens ?? 500,
  };
  if (options.response_format) {
    body.response_format = options.response_format;
  }

  const res = await postChatCompletions(config, body);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${providerLabel(config)} API error: ${res.status} ${errText}`);
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
