import axios from 'axios';
import { randomBytes } from 'crypto';

export const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';

import { resolveAppBaseUrl, resolveOAuthRedirectOrigin } from '@/lib/app-base-url';

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
  const oauthOrigin = resolveOAuthRedirectOrigin();
  const defaultUri = `${oauthOrigin}/api/social/oauth/threads/callback`;
  const fromEnv = process.env.THREADS_REDIRECT_URI?.trim();
  if (!fromEnv) return defaultUri;
  try {
    const normalized = fromEnv.replace(/\/+$/, '');
    const envHost = new URL(normalized).host;
    const oauthHost = new URL(oauthOrigin).host;
    if (envHost === oauthHost) return normalized;
    console.warn(
      `[Threads OAuth] THREADS_REDIRECT_URI host (${envHost}) differs from OAuth origin (${oauthHost}); using ${defaultUri}`
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

/** When `1`, every Threads OAuth start uses rerequest+reauthenticate (for App Review screencasts). */
export function threadsOAuthForceFullConsentEnabled(): boolean {
  return process.env.THREADS_OAUTH_FORCE_FULL_CONSENT === '1';
}

/**
 * Threads OAuth authorize URL. Meta reuses the browser session, so users often see
 * "Continue As …" for whoever is already logged in on threads.net.
 * Pass switchAccount to request auth_type=reauthenticate and allow signing in as someone else.
 * Pass forceFullConsent to re-show the permission dialog (rerequest + reauthenticate).
 */
export function buildThreadsOAuthAuthorizeUrl(params: {
  state: string;
  switchAccount?: boolean;
  forceFullConsent?: boolean;
}): string {
  const url = new URL('https://www.threads.net/oauth/authorize');
  url.searchParams.set('client_id', threadsAppId());
  url.searchParams.set('redirect_uri', resolveThreadsRedirectUri());
  url.searchParams.set('scope', defaultThreadsOAuthScopes());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);

  const authTypes: string[] = [];
  if (params.forceFullConsent) authTypes.push('rerequest');
  if (params.switchAccount || params.forceFullConsent) authTypes.push('reauthenticate');
  if (authTypes.length > 0) {
    url.searchParams.set('auth_type', authTypes.join(','));
    url.searchParams.set('auth_nonce', randomBytes(16).toString('hex'));
  }
  return url.toString();
}

export function threadsApiHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Revoke all Threads permissions for this user+app pair (forces first-time consent on next OAuth). */
export async function revokeThreadsAppAuthorization(accessToken: string): Promise<boolean> {
  const r = await axios.delete(`${THREADS_GRAPH_BASE}/me/permissions`, {
    headers: threadsApiHeaders(accessToken),
    timeout: 15_000,
    validateStatus: () => true,
  });
  if (r.status !== 200) return false;
  const data = r.data as boolean | { success?: boolean | string };
  if (data === true) return true;
  if (data && typeof data === 'object' && (data.success === true || data.success === 'true')) return true;
  return false;
}

export async function threadsGet<T = unknown>(
  path: string,
  accessToken: string,
  params?: Record<string, string | number | undefined>,
  timeoutMs = 20_000
): Promise<{ status: number; data: T }> {
  const r = await axios.get<T>(`${THREADS_GRAPH_BASE}/${path.replace(/^\//, '')}`, {
    headers: threadsApiHeaders(accessToken),
    params,
    timeout: timeoutMs,
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

export async function fetchThreadsProfile(
  accessToken: string,
  timeoutMs = 20_000
): Promise<ThreadsProfile | null> {
  const { status, data } = await threadsGet<ThreadsProfile>(
    'me',
    accessToken,
    { fields: 'id,username,name,threads_profile_picture_url,threads_biography' },
    timeoutMs
  );
  if (status !== 200 || !data?.id) return null;
  return data;
}

export async function exchangeThreadsCodeForShortLivedToken(
  code: string,
  redirectUri: string,
  timeoutMs = 20_000
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
      timeout: timeoutMs,
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

/** OAuth connect: short-lived token, then long-lived + profile in parallel (faster callback). */
export async function exchangeThreadsOAuthConnect(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  expiresAt: Date;
  platformUserId: string;
  username: string;
  profilePicture: string | null;
}> {
  const OAUTH_MS = 12_000;
  const short = await exchangeThreadsCodeForShortLivedToken(code, redirectUri, OAUTH_MS);
  if (!short?.accessToken) {
    throw new Error(
      `Threads token exchange failed. Redirect URI used: ${redirectUri}. Check THREADS_APP_ID and THREADS_APP_SECRET in Vercel.`
    );
  }
  const [long, profile] = await Promise.all([
    exchangeThreadsLongLivedToken(short.accessToken, OAUTH_MS),
    fetchThreadsProfile(short.accessToken, OAUTH_MS).catch(() => null),
  ]);
  if (!long?.accessToken) {
    console.error(
      '[Threads OAuth] long-lived exchange failed. Check THREADS_APP_SECRET in Vercel matches Meta → Threads → Basic.'
    );
    throw new Error(
      'Threads long-lived token exchange failed. In Vercel, set THREADS_APP_SECRET to the Threads App Secret from Meta (same app as THREADS_APP_ID), redeploy, then connect Threads again.'
    );
  }
  const accessToken = long.accessToken;
  const expiresAt = new Date(Date.now() + long.expiresInSec * 1000);
  const threadsUserId =
    short.userId !== undefined && short.userId !== null ? String(short.userId).trim() : '';
  let platformUserId = threadsUserId || profile?.id || 'threads-' + accessToken.slice(-8);
  const username = profile?.username ?? profile?.name ?? 'Threads';
  const profilePicture = profile?.threads_profile_picture_url ?? null;
  if (profile?.id) platformUserId = profile.id;
  return { accessToken, expiresAt, platformUserId, username, profilePicture };
}

/** Exchange short-lived token for long-lived (about 60 days). */
export async function exchangeThreadsLongLivedToken(
  shortLivedToken: string,
  timeoutMs = 20_000
): Promise<{
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
    timeout: timeoutMs,
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
  if (r.status !== 200 || !r.data?.access_token) {
    console.error('[Threads OAuth] refresh long-lived token:', r.status, r.data);
    return null;
  }
  return {
    accessToken: r.data.access_token,
    expiresInSec: r.data.expires_in ?? 60 * 24 * 60 * 60,
  };
}
