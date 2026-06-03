import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

/** Human-readable permission lines aligned with LinkedIn's official OAuth consent UI (for app review). */
export const LINKEDIN_OAUTH_CONSENT_PERMISSIONS: Record<LinkedInConnectMethod, string[]> = {
  page: [
    "Manage your organizations' pages and retrieve reporting data",
    "Retrieve your organization's posts, comments, reactions, and other engagement data",
    "Create, modify, and delete posts, comments, and reactions on your organization's behalf",
    'Use your basic profile including your name, photo, headline, and public profile URL',
    'Use the primary email address associated with your LinkedIn account',
    'Create, modify, and delete posts, comments, and reactions on your behalf',
    'Retrieve your posts, comments, reactions, and other engagement data',
  ],
  personal: [
    'Use your basic profile including your name, photo, headline, and public profile URL',
    'Use the primary email address associated with your LinkedIn account',
    'Create, modify, and delete posts, comments, and reactions on your behalf',
    'Retrieve your posts, comments, reactions, and other engagement data',
  ],
};

export const LINKEDIN_OAUTH_APP_NAME = 'Agent4Socials';

export function linkedInOAuthRedirectDisplayUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/+$/, '');
    return `${origin}/api/social/oauth/linkedin/callback`;
  }
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://agent4socials.com'
  ).replace(/\/+$/, '');
  return `${base}/api/social/oauth/linkedin/callback`;
}
