import axios from 'axios';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const raw = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const base = raw || '';
/** Default for most API calls; Threads comment replies need longer (Meta container + publish). */
export const API_DEFAULT_TIMEOUT_MS = 25_000;
export const API_THREADS_COMMENT_REPLY_TIMEOUT_MS = 90_000;
export const API_INSTAGRAM_DM_TIMEOUT_MS = 58_000;
/** iZop AI chat (tool rounds + vision). */
export const API_IZOP_CHAT_TIMEOUT_MS = 120_000;
/** iZop chat with PDF/video attachments (slower model + tools). */
export const API_IZOP_CHAT_ATTACHMENTS_TIMEOUT_MS = 180_000;
/** Presigned URL + large PUT to R2. */
export const API_MEDIA_UPLOAD_TIMEOUT_MS = 180_000;
export const API_IZOP_SESSION_PERSIST_TIMEOUT_MS = 120_000;
/** Direct PUT to R2 after presign (large PDFs/videos). */
export const R2_DIRECT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const api = axios.create({
  baseURL: `${base}/api`,
  timeout: API_DEFAULT_TIMEOUT_MS,
});

// ─── Global concurrent-request limiter ──────────────────────────────────────
// Each API call = 1 Vercel serverless function = 1 DB connection.
// Supabase pgbouncer has a finite pool (~15-50 depending on plan).
// Without a cap, the dashboard can fire 15+ requests simultaneously and
// exhaust the pool, causing "Timed out fetching a new connection" for every
// request including the auth query.
//
// MAX_CONCURRENT controls how many HTTP requests can be in-flight at once.
// Excess requests are queued and executed as earlier ones complete.
// Keep this high enough that dashboard prefetch + navigation to another page
// (e.g. AI Assistant) does not sit behind the queue so long the UI looks broken.
const MAX_CONCURRENT = 6;
let _inFlight = 0;
const _queue: Array<{ resolve: () => void }> = [];

/** User-facing inbox/AI calls skip the queue so they are not stuck behind dashboard prefetch. */
function resolveRequestPath(url?: string, baseURL?: string): string {
  const raw = (url ?? '').trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const base = (baseURL ?? '').replace(/\/+$/, '');
  const path = raw.startsWith('/') ? raw : raw ? `/${raw}` : '';
  return `${base}${path}`;
}

function isPriorityApiPath(url?: string, baseURL?: string): boolean {
  const path = resolveRequestPath(url, baseURL);
  if (!path) return false;
  return (
    path.includes('/ai/izop-chat') ||
    path.includes('/ai/izop-chats') ||
    path.includes('/leads/scan') ||
    path.includes('/leads/last') ||
    path.includes('/media/upload-url') ||
    path.includes('/media/upload') ||
    path.includes('/ai/brand-context') ||
    path.includes('/ai/generate-description') ||
    path.includes('/tiktok-creator-info') ||
    path.includes('/ai/generate-inbox-reply') ||
    path.includes('/ai/generate-inbox-reply-batch') ||
    path.includes('/comments/reply') ||
    path.includes('/inbox/instagram-dms') ||
    path.includes('/sender-profile') ||
    /\/conversations(\?|$|\/)/.test(path) ||
    /\/posts\/[^/]+(\/publish|\/finalize-publish-status)?$/.test(path) ||
    /\/posts(\?|$)/.test(path)
  );
}

function applyApiTimeout(config: {
  url?: string;
  baseURL?: string;
  timeout?: number;
  method?: string;
}): void {
  const path = resolveRequestPath(config.url, config.baseURL);
  const floor = (ms: number) => {
    config.timeout = Math.max(config.timeout ?? 0, ms);
  };
  if (path.includes('/comments/reply')) {
    floor(API_THREADS_COMMENT_REPLY_TIMEOUT_MS);
  } else if (path.includes('/inbox/instagram-dms')) {
    floor(API_INSTAGRAM_DM_TIMEOUT_MS);
  } else if (path.includes('/ai/izop-chat')) {
    floor(API_IZOP_CHAT_TIMEOUT_MS);
  } else if (path.includes('/media/upload-url') || path.includes('/media/upload')) {
    floor(API_MEDIA_UPLOAD_TIMEOUT_MS);
  } else if (/\/ai\/izop-chats\/[^/?]+$/.test(path)) {
    // Only PATCH (save messages) needs the long timeout; GET/DELETE stay fast.
    const method = (config.method ?? 'get').toLowerCase();
    if (method === 'patch') {
      floor(API_IZOP_SESSION_PERSIST_TIMEOUT_MS);
    }
  }
}

function acquireSlot(): Promise<void> {
  if (_inFlight < MAX_CONCURRENT) {
    _inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    _queue.push({ resolve });
  });
}

function releaseSlot(): void {
  if (_queue.length > 0) {
    const next = _queue.shift()!;
    next.resolve();
  } else {
    _inFlight--;
  }
}

// Use request interceptor: resolve auth first, then acquire a slot right before send.
// Acquiring before getSession() held a "slot" during Supabase session resolution and
// could starve other requests (pages stuck on loaders while slots were busy).
api.interceptors.request.use(async (config) => {
  applyApiTimeout(config);

  if (typeof window !== 'undefined') {
    const supabase = getSupabaseBrowser();
    let accessToken: string | null = null;
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
    if (!accessToken) {
      const refreshed = await supabase.auth.refreshSession();
      accessToken = refreshed.data.session?.access_token ?? null;
    }
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  if (!isPriorityApiPath(config.url, config.baseURL)) {
    await acquireSlot();
  }

  return config;
});

// Release the slot after response (success or error).
api.interceptors.response.use(
  (response) => {
    if (!isPriorityApiPath(response.config?.url, response.config?.baseURL)) releaseSlot();
    return response;
  },
  (error) => {
    if (!isPriorityApiPath(error.config?.url, error.config?.baseURL)) releaseSlot();
    return Promise.reject(error);
  }
);

export default api;
