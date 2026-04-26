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
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  await acquireSlot();

  return config;
});

// Release the slot after response (success or error).
api.interceptors.response.use(
  (response) => {
    releaseSlot();
    return response;
  },
  (error) => {
    releaseSlot();
    return Promise.reject(error);
  }
);

export default api;
