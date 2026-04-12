import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const raw = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const base = raw || '';
const api = axios.create({
  baseURL: `${base}/api`,
  timeout: 25_000,
});

api.interceptors.request.use(async (config) => {
  if (typeof window === 'undefined') return config;
  const supabase = getSupabaseBrowser();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
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
const MAX_CONCURRENT = 4;
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

const originalRequest = api.request.bind(api);

api.request = async function limitedRequest<T = unknown, R = AxiosResponse<T>>(
  configOrUrl: string | InternalAxiosRequestConfig,
  ...args: unknown[]
): Promise<R> {
  await acquireSlot();
  try {
    return await (originalRequest as Function)(configOrUrl, ...args);
  } finally {
    releaseSlot();
  }
} as typeof api.request;

// Patch convenience methods to route through the limited request
for (const method of ['get', 'delete', 'head', 'options'] as const) {
  const orig = api[method].bind(api);
  (api as Record<string, unknown>)[method] = async function (...args: unknown[]) {
    await acquireSlot();
    try {
      return await (orig as Function)(...args);
    } finally {
      releaseSlot();
    }
  };
}
for (const method of ['post', 'put', 'patch'] as const) {
  const orig = api[method].bind(api);
  (api as Record<string, unknown>)[method] = async function (...args: unknown[]) {
    await acquireSlot();
    try {
      return await (orig as Function)(...args);
    } finally {
      releaseSlot();
    }
  };
}

export default api;
