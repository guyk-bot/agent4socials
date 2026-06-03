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

/** Generic member avatar before LinkedIn OAuth (no profile photo yet). */
export const LINKEDIN_OAUTH_MEMBER_AVATAR_URL = '/linkedin-oauth-member-placeholder.svg';

/** Shown in footer copy (matches LinkedIn's consent screen wording). */
export const LINKEDIN_OAUTH_REDIRECT_DISPLAY_URL = 'https://www.linkedin.com';
