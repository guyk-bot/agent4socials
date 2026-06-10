import axios from 'axios';
import { randomBytes } from 'crypto';

export const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';

import { resolveAppBaseUrl } from '@/lib/app-base-url';

export { resolveAppBaseUrl };

/**
 * Threads OAuth redirect URI. Uses THREADS_REDIRECT_URI only when its host matches
 * NEXT_PUBLIC_APP_URL so Meta whitelist and authorize redirect stay aligned.
 */
/** Redirect URI Meta used on callback (must match authorize + token exchange). */
export function threadsRedirectUriFromRequestUrl(requestUrl: string): string {
  const u = new URL(requestUrl);
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}

export function resolveThreadsRedirectUri(): string {
  const baseUrl = resolveAppBaseUrl();
  const defaultUri = `${baseUrl}/api/social/oauth/threads/callback`;
  const fromEnv = process.env.THREADS_REDIRECT_URI?.trim();
  if (!fromEnv) return defaultUri;
  try {
    const normalized = fromEnv.replace(/\/+$/, '');
    const envHost = new URL(normalized).host;
    const baseHost = new URL(baseUrl).host;
    if (envHost === baseHost) return normalized;
    console.warn(
      `[Threads OAuth] THREADS_REDIRECT_URI host (${envHost}) differs from app URL (${baseHost}); using ${defaultUri}`
    );
    return defaultUri;
  } catch {
    return defaultUri;
  }
}

export function threadsAppId(): string {
  return (
    process.env.THREADS_APP_ID?.trim() ||
    process.env.META_APP_ID?.trim() ||
    ''
  );
}

export function threadsAppSecret(): string {
  return (
    process.env.THREADS_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim() ||
    ''
  );
}

export function defaultThreadsOAuthScopes(): string {
  const fromEnv = process.env.THREADS_OAUTH_SCOPES?.trim();
  if (fromEnv) return fromEnv;
  return [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_read_replies',
    'threads_manage_replies',
    'threads_manage_mentions',
    'threads_share_to_instagram',
  ].join(',');
}

/**
 * Threads OAuth authorize URL. Meta reuses the browser session, so users often see
 * "Continue As …" for whoever is already logged in on threads.net.
 * Pass switchAccount to request auth_type=reauthenticate and allow signing in as someone else.
 */
export function buildThreadsOAuthAuthorizeUrl(params: {
  state: string;
  switchAccount?: boolean;
}): string {
  const url = new URL('https://www.threads.net/oauth/authorize');
  url.searchParams.set('client_id', threadsAppId());
  url.searchParams.set('redirect_uri', resolveThreadsRedirectUri());
  url.searchParams.set('scope', defaultThreadsOAuthScopes());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  if (params.switchAccount) {
    url.searchParams.set('auth_type', 'reauthenticate');
    url.searchParams.set('auth_nonce', randomBytes(16).toString('hex'));
  }
  return url.toString();
}

export function threadsApiHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function threadsGet<T = unknown>(
  path: string,
  accessToken: string,
  params?: Record<string, string | number | undefined>
): Promise<{ status: number; data: T }> {
  const r = await axios.get<T>(`${THREADS_GRAPH_BASE}/${path.replace(/^\//, '')}`, {
    headers: threadsApiHeaders(accessToken),
    params,
    timeout: 20_000,
    validateStatus: () => true,
  });
  return { status: r.status, data: r.data };
}

export async function threadsPostForm<T = unknown>(
  path: string,
  accessToken: string,
  form: Record<string, string>
): Promise<{ status: number; data: T }> {
  const body = new URLSearchParams(form);
  const r = await axios.post<T>(`${THREADS_GRAPH_BASE}/${path.replace(/^\//, '')}`, body.toString(), {
    headers: {
      ...threadsApiHeaders(accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 30_000,
    validateStatus: () => true,
  });
  return { status: r.status, data: r.data };
}

export type ThreadsProfile = {
  id?: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
};

export async function fetchThreadsProfile(accessToken: string): Promise<ThreadsProfile | null> {
  const { status, data } = await threadsGet<ThreadsProfile>(
    'me',
    accessToken,
    { fields: 'id,username,name,threads_profile_picture_url,threads_biography' }
  );
  if (status !== 200 || !data?.id) return null;
  return data;
}

export async function exchangeThreadsCodeForShortLivedToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; userId?: string } | null> {
  const clientId = threadsAppId();
  const clientSecret = threadsAppSecret();
  if (!clientId || !clientSecret) return null;
  const r = await axios.post<{
    access_token?: string;
    user_id?: string;
    error?: { message?: string };
  }>(
    'https://graph.threads.net/oauth/access_token',
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20_000,
      validateStatus: () => true,
    }
  );
  if (r.status !== 200 || !r.data?.access_token) {
    const errObj = r.data?.error;
    const metaMsg =
      errObj && typeof errObj === 'object' && 'message' in errObj
        ? String((errObj as { message?: string }).message)
        : null;
    console.error('[Threads OAuth] short-lived token:', r.status, r.data, { redirectUri });
    throw new Error(
      metaMsg
        ? `Threads token exchange failed: ${metaMsg}`
        : `Threads token exchange failed (HTTP ${r.status}). Confirm THREADS_APP_ID and THREADS_APP_SECRET in Vercel match Meta → Threads → Settings, and redirect URI is exactly ${redirectUri}`
    );
  }
  const userId =
    r.data.user_id !== undefined && r.data.user_id !== null ? String(r.data.user_id) : undefined;
  return { accessToken: r.data.access_token, userId };
}

/** Exchange short-lived token for long-lived (about 60 days). */
export async function exchangeThreadsLongLivedToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresInSec: number;
} | null> {
  const clientSecret = threadsAppSecret();
  if (!clientSecret) return null;
  const r = await axios.get<{
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  }>('https://graph.threads.net/access_token', {
    params: {
      grant_type: 'th_exchange_token',
      client_secret: clientSecret,
      access_token: shortLivedToken,
    },
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.access_token) {
    console.error('[Threads OAuth] long-lived token:', r.status, r.data);
    return null;
  }
  return {
    accessToken: r.data.access_token,
    expiresInSec: r.data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

export async function refreshThreadsLongLivedToken(currentToken: string): Promise<{
  accessToken: string;
  expiresInSec: number;
} | null> {
  const r = await axios.get<{
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  }>('https://graph.threads.net/refresh_access_token', {
    params: {
      grant_type: 'th_refresh_token',
      access_token: currentToken,
    },
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (r.status !== 200 || !r.data?.access_token) return null;
  return {
    accessToken: r.data.access_token,
    expiresInSec: r.data.expires_in ?? 60 * 24 * 60 * 60,
  };
}
