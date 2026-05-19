/** Read a user-facing message from an axios-style API error. */
export function readApiErrorMessage(e: unknown, fallback: string): string {
  if (!e || typeof e !== 'object') return fallback;
  const err = e as {
    response?: {
      data?: { message?: string; error?: string | { message?: string } };
      status?: number;
    };
    message?: string;
  };
  const data = err.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    const nested = data.error;
    if (nested && typeof nested === 'object' && typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message.trim();
    }
  }
  const raw = typeof err.message === 'string' ? err.message : '';
  if (/timeout of \d+ms exceeded/i.test(raw) || /ECONNABORTED/i.test(raw)) {
    return 'Request timed out. Please try again.';
  }
  if (raw && !/^Network Error$/i.test(raw)) return raw;
  return fallback;
}

export const AI_REPLY_NOT_CONFIGURED_MESSAGE =
  'AI replies are not enabled on the server. Add OPENAI_API_KEY in your hosting settings (e.g. Vercel Environment Variables), redeploy, then try again.';

export const AI_REPLY_FAILED_MESSAGE = 'Could not generate an AI reply. Try again in a moment.';
