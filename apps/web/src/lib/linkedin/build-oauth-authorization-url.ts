import {
  buildLinkedInOAuthScopeString,
  LINKEDIN_IDENTITY_OAUTH_SCOPES,
  type LinkedInConnectMethod,
} from '@/lib/linkedin/oauth-scopes';

export function buildLinkedInOAuthStateKey(
  userId: string,
  options: {
    method: LinkedInConnectMethod;
    step?: 'identify' | 'connect';
    previewId?: string;
  }
): string {
  const { method, step, previewId } = options;
  if (step === 'identify') {
    return method === 'page' ? `${userId}:linkedin_identify:page` : `${userId}:linkedin_identify:personal`;
  }
  const base = method === 'page' ? `${userId}:linkedin_page` : `${userId}:linkedin_personal`;
  if (previewId) return `${base}:pv:${previewId}`;
  return base;
}

export function parseLinkedInOAuthState(stateRaw: string): {
  userIdBase: string;
  previewId: string | null;
} {
  let stateNorm = stateRaw;
  const previewMatch = stateNorm.match(/:pv:([^:]+)$/);
  const previewId = previewMatch?.[1] ?? null;
  if (previewMatch) {
    stateNorm = stateNorm.slice(0, -previewMatch[0].length);
  }
  const userIdBase = stateNorm
    .replace(/:instagram$/, '')
    .replace(/:linkedin_identify:personal$/, '')
    .replace(/:linkedin_identify:page$/, '')
    .replace(/:linkedin_page$/, '')
    .replace(/:linkedin_personal$/, '')
    .replace(/:tiktok_personal$/, '')
    .replace(/:tiktok_business$/, '');
  return { userIdBase, previewId };
}

export function buildLinkedInOAuthAuthorizationUrl(
  userId: string,
  options: {
    method: LinkedInConnectMethod;
    step?: 'identify' | 'connect';
    previewId?: string;
  }
): string {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(
    /\/+$/,
    ''
  );
  const callbackUrl = `${baseUrl}/api/social/oauth/linkedin/callback`;
  const redirect = encodeURIComponent((process.env.LINKEDIN_REDIRECT_URI || callbackUrl).replace(/\/+$/, ''));
  const clientId = encodeURIComponent(process.env.LINKEDIN_CLIENT_ID || '');
  const state = encodeURIComponent(buildLinkedInOAuthStateKey(userId, options));
  const scopes =
    options.step === 'identify'
      ? LINKEDIN_IDENTITY_OAUTH_SCOPES
      : buildLinkedInOAuthScopeString(options.method);
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&state=${state}&scope=${encodeURIComponent(scopes)}&enable_extended_login=true`;
}
