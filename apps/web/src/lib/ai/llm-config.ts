/**
 * LLM provider config. iZop AI can use OpenRouter (Izop_AI / OPENROUTER_API_KEY)
 * while other features keep using OPENAI_API_KEY directly.
 */

export type LlmProvider = 'openai' | 'openrouter';

export type ResolvedLlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
  extraHeaders: Record<string, string>;
};

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

/** OpenRouter model ids use vendor prefixes, e.g. openai/gpt-4.1-mini. */
export function toOpenRouterModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return 'openai/gpt-4.1-nano';
  if (trimmed.includes('/')) return trimmed;
  if (trimmed.startsWith('gpt-')) return `openai/${trimmed}`;
  return trimmed;
}

export function getIzopOpenRouterApiKey(): string {
  return readEnv('Izop_AI', 'IZOP_AI', 'OPENROUTER_API_KEY');
}

export function isIzopLlmConfigured(): boolean {
  return Boolean(getIzopOpenRouterApiKey() || readEnv('OPENAI_API_KEY'));
}

export function resolveIzopLlmConfig(modelOverride?: string): ResolvedLlmConfig {
  const openRouterKey = getIzopOpenRouterApiKey();
  if (openRouterKey) {
    const model = toOpenRouterModel(
      modelOverride ||
        readEnv('IZOP_AI_MODEL', 'OPENROUTER_MODEL', 'OPENAI_CHAT_MODEL') ||
        'gpt-4.1-nano'
    );
    const baseUrl = readEnv('OPENROUTER_BASE_URL') || OPENROUTER_CHAT_URL;
    const referer = readEnv('OPENROUTER_HTTP_REFERER') || 'https://www.izop.io';
    const title = readEnv('OPENROUTER_APP_TITLE') || 'iZop AI';
    return {
      provider: 'openrouter',
      apiKey: openRouterKey,
      chatCompletionsUrl: baseUrl.includes('/chat/completions')
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      model,
      extraHeaders: {
        'HTTP-Referer': referer,
        'X-Title': title,
      },
    };
  }

  const apiKey = readEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('No LLM API key configured. Set Izop_AI (OpenRouter) or OPENAI_API_KEY.');
  }

  return {
    provider: 'openai',
    apiKey,
    chatCompletionsUrl: OPENAI_CHAT_URL,
    model: modelOverride || readEnv('OPENAI_CHAT_MODEL') || 'gpt-4.1-nano',
    extraHeaders: {},
  };
}

export function resolveDefaultLlmConfig(modelOverride?: string): ResolvedLlmConfig {
  const apiKey = readEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return {
    provider: 'openai',
    apiKey,
    chatCompletionsUrl: OPENAI_CHAT_URL,
    model: modelOverride || readEnv('OPENAI_CHAT_MODEL') || 'gpt-4.1-nano',
    extraHeaders: {},
  };
}

export function resolveLlmConfig(
  scope: 'default' | 'izop',
  modelOverride?: string
): ResolvedLlmConfig {
  if (scope === 'izop') return resolveIzopLlmConfig(modelOverride);
  return resolveDefaultLlmConfig(modelOverride);
}
