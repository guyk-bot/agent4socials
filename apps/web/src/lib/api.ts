import axios from 'axios';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const raw = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const base = raw || '';
const api = axios.create({
  baseURL: `${base}/api`,
  timeout: 25_000,
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
const MAX_CONCURRENT = 14;
let _inFlight = 0;
const _queue: Array<{ resolve: () => void }> = [];

/** User-facing inbox/AI calls skip the queue so they are not stuck behind dashboard prefetch. */
function isPriorityApiPath(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/ai/brand-context') ||
    url.includes('/ai/generate-description') ||
    url.includes('/ai/generate-inbox-reply') ||
    url.includes('/ai/generate-inbox-reply-batch') ||
    url.includes('/comments/reply') ||
    /\/conversations(\?|$|\/)/.test(url)
  );
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

  if (!isPriorityApiPath(typeof config.url === 'string' ? config.url : undefined)) {
    await acquireSlot();
  }

  return config;
});

// Release the slot after response (success or error).
api.interceptors.response.use(
  (response) => {
    const url = typeof response.config?.url === 'string' ? response.config.url : undefined;
    if (!isPriorityApiPath(url)) releaseSlot();
    return response;
  },
  (error) => {
    const url = typeof error.config?.url === 'string' ? error.config.url : undefined;
    if (!isPriorityApiPath(url)) releaseSlot();
    return Promise.reject(error);
  }
);

export default api;
