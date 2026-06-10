import { resolveAppBaseUrl } from '@/lib/app-base-url';
import { resolveThreadsRedirectUri } from '@/lib/threads/threads-api';

const PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'twitter',
  'linkedin',
  'pinterest',
  'threads',
] as const;

export type OAuthPlatformSlug = (typeof PLATFORMS)[number];

export function defaultOAuthCallbackUrl(platform: OAuthPlatformSlug, baseUrl?: string): string {
  const base = (baseUrl || resolveAppBaseUrl()).replace(/\/+$/, '');
  return `${base}/api/social/oauth/${platform}/callback`;
}

/** Effective redirect URI per platform (env override when host matches app URL). */
export function resolveOAuthCallbackUrlForPlatform(platform: OAuthPlatformSlug): string {
  const base = resolveAppBaseUrl();
  const fallback = defaultOAuthCallbackUrl(platform, base);
  const envKey: Partial<Record<OAuthPlatformSlug, string | undefined>> = {
    instagram: process.env.INSTAGRAM_REDIRECT_URI,
    facebook: process.env.FACEBOOK_REDIRECT_URI,
    threads: process.env.THREADS_REDIRECT_URI,
    tiktok: process.env.TIKTOK_REDIRECT_URI,
    youtube: process.env.YOUTUBE_REDIRECT_URI,
    twitter: process.env.TWITTER_REDIRECT_URI,
    linkedin: process.env.LINKEDIN_REDIRECT_URI,
    pinterest: process.env.PINTEREST_REDIRECT_URI,
  };
  if (platform === 'instagram' && !envKey.instagram?.trim()) {
    const meta = process.env.META_REDIRECT_URI?.trim();
    if (meta) return meta.replace(/\/+$/, '');
  }
  if (platform === 'threads') return resolveThreadsRedirectUri();
  const fromEnv = envKey[platform]?.trim();
  if (!fromEnv) return fallback;
  try {
    const normalized = fromEnv.replace(/\/+$/, '');
    if (new URL(normalized).host === new URL(base).host) return normalized;
  } catch {
    /* use fallback */
  }
  return fallback;
}

export function allOAuthCallbackUrls(): Record<OAuthPlatformSlug, string> {
  return Object.fromEntries(
    PLATFORMS.map((p) => [p, resolveOAuthCallbackUrlForPlatform(p)])
  ) as Record<OAuthPlatformSlug, string>;
}
