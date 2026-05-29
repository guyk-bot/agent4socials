import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export type LinkedInConsentItem = {
  id: string;
  label: string;
};

export type LinkedInConnectOptionCopy = {
  title: string;
  subtitle: string;
  badge?: string;
  features: string[];
  consentTitle: string;
  consentIntro: string;
  items: LinkedInConsentItem[];
  scopesSummary: string;
  dataUseNote: string;
};

const SHARED_NOT_ADS: LinkedInConsentItem = {
  id: 'not_ads',
  label:
    'I understand Agent4Socials will not use LinkedIn personal or activity data obtained through these APIs for advertising, retargeting, lead sales, or selling data to third parties.',
};

const SHARED_OWN_ACCOUNT: LinkedInConsentItem = {
  id: 'own_account',
  label:
    'I am connecting an account I manage. Data is shown only to me (and my team on this workspace) to publish and moderate my own LinkedIn presence.',
};

const SHARED_LINKEDIN_TERMS: LinkedInConsentItem = {
  id: 'linkedin_terms',
  label:
    'I agree to LinkedIn\'s API Terms of Use and will comply with LinkedIn\'s Community Management and platform policies.',
};

const SHARED_AGENT_TERMS: LinkedInConsentItem = {
  id: 'agent_terms',
  label: 'I agree to Agent4Socials Terms of Service and Privacy Policy.',
};

export const LINKEDIN_CONNECT_OPTIONS: Record<LinkedInConnectMethod, LinkedInConnectOptionCopy> = {
  personal: {
    title: 'Personal profile',
    subtitle: 'Post and reply on your own LinkedIn profile',
    features: [
      'Publish and schedule posts from Composer',
      'Read and reply to comments on your posts in Inbox',
      'Sync your recent posts for context',
    ],
    consentTitle: 'Before connecting your personal profile',
    consentIntro:
      'LinkedIn may show a short sign-in screen. Agent4Socials also asks you to confirm the following before we request access:',
    items: [
      SHARED_OWN_ACCOUNT,
      {
        id: 'personal_use',
        label:
          'I authorize Agent4Socials to use my personal profile access only to publish content I create and to read and reply to comments on my own posts.',
      },
      SHARED_NOT_ADS,
      SHARED_LINKEDIN_TERMS,
      SHARED_AGENT_TERMS,
    ],
    scopesSummary: 'Requested access: sign-in (OpenID), profile basics, post on your behalf, read your posts and comments.',
    dataUseNote:
      'We do not use this data to build ad audiences or sell profiles. Disconnect anytime from Account settings.',
  },
  page: {
    title: 'Company Page',
    subtitle: 'Community Management for a LinkedIn Page you administer',
    badge: 'Community Management API',
    features: [
      'Publish as your Company Page from Composer',
      'Inbox: comments and engagement on Page posts',
      'Page post sync and performance metrics (when approved by LinkedIn)',
    ],
    consentTitle: 'Before connecting a Company Page',
    consentIntro:
      'You must be a Page administrator. LinkedIn may show a short sign-in screen. Confirm the following before we request Community Management access:',
    items: [
      {
        id: 'page_admin',
        label:
          'I am an administrator of the LinkedIn Company Page I am connecting and I have authority to grant this app access on its behalf.',
      },
      {
        id: 'page_use',
        label:
          'I authorize Agent4Socials to use Page access to publish Page posts, display comments and reactions on Page content, and let Page admins reply in Inbox.',
      },
      {
        id: 'member_visibility',
        label:
          'I understand that when members comment or react on Page posts, Agent4Socials may display comment text, timestamps, and member information returned by LinkedIn so Page admins can moderate and respond.',
      },
      SHARED_NOT_ADS,
      SHARED_LINKEDIN_TERMS,
      SHARED_AGENT_TERMS,
    ],
    scopesSummary:
      'Requested access: sign-in (OpenID), Page social read/write (organization scopes), posts, comments, and Page analytics where LinkedIn provides them.',
    dataUseNote:
      'Page data is used only for Page management in Agent4Socials. We do not resell or use it for off-platform advertising.',
  },
};
