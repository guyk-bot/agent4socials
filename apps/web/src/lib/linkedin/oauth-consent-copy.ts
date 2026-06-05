import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';
import { SITE_LOGO_SRC } from '@/lib/site-brand-assets';

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

export const LINKEDIN_OAUTH_APP_NAME = 'iZop';

/** Generic member avatar before LinkedIn OAuth (no profile photo yet). */
export const LINKEDIN_OAUTH_MEMBER_AVATAR_URL = '/linkedin-oauth-member-placeholder.svg';

/** App mark on black circle. */
export const LINKEDIN_OAUTH_APP_LOGO_URL = SITE_LOGO_SRC;

/** Shown in footer copy after the user taps Allow on the in-app consent screen. */
export const LINKEDIN_OAUTH_REDIRECT_DISPLAY_URL = 'iZop';
