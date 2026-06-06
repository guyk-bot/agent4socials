import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

/** Copy for the personal vs Company Page picker (OAuth Allow screen is separate). */
export type LinkedInConnectOptionCopy = {
  title: string;
  subtitle: string;
  features: string[];
};

export const LINKEDIN_CONNECT_OPTIONS: Record<LinkedInConnectMethod, LinkedInConnectOptionCopy> = {
  personal: {
    title: 'Personal profile',
    subtitle: 'Publish posts from your personal LinkedIn profile',
    features: ['Publish & schedule posts on LinkedIn'],
  },
  page: {
    title: 'Company Page',
    subtitle: 'Community Management for a LinkedIn Page you administer',
    features: [
      'Publish & schedule posts on your LinkedIn Company Page',
      'Reply to comments on your posts from the unified inbox',
      'Page post sync and performance metrics',
    ],
  },
};
