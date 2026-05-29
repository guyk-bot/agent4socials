import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export type LinkedInConsentItem = {
  id: string;
  label: string;
};

export type LinkedInConnectOptionCopy = {
  title: string;
  subtitle: string;
  features: string[];
  /** Shown without a checkmark (limitations or pointers to the other option). */
  notes?: string[];
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

const SHARED_AGENT_TERMS: LinkedInConsentItem = {
  id: 'agent_terms',
  label: 'I agree to Agent4Socials Terms of Service and Privacy Policy.',
};

const SHARED_CONSENT_INTRO =
  'Please mark all relevant items below to continue. To fully use Agent4Socials, you must mark all of them to continue.';

export const LINKEDIN_CONNECT_OPTIONS: Record<LinkedInConnectMethod, LinkedInConnectOptionCopy> = {
  personal: {
    title: 'Personal profile',
    subtitle: 'Publish posts from your personal LinkedIn profile',
    features: ['Publish & schedule posts on LinkedIn'],
    consentTitle: 'Before connecting your personal profile',
    consentIntro: SHARED_CONSENT_INTRO,
    items: [
      {
        id: 'own_account',
        label:
          'I am connecting my own LinkedIn profile. Agent4Socials will use this access only so I can publish content I create.',
      },
      {
        id: 'personal_use',
        label:
          'I authorize Agent4Socials to use the permissions LinkedIn shows at sign-in (publish now; read posts and Inbox replies when LinkedIn grants those scopes).',
      },
      SHARED_NOT_ADS,
      {
        id: 'linkedin_terms',
        label:
          'I agree to LinkedIn\'s API Terms of Use and will comply with LinkedIn\'s platform policies.',
      },
      SHARED_AGENT_TERMS,
    ],
    scopesSummary: '',
    dataUseNote:
      'We do not use this data to build ad audiences or sell profiles. Disconnect anytime from Account settings.',
  },
  page: {
    title: 'Company Page',
    subtitle: 'Community Management for a LinkedIn Page you administer',
    features: [
      'Publish & schedule posts on your LinkedIn Company Page',
      'Reply to comments on your posts and auto reply using keyword automation',
      'Page post sync and performance metrics',
    ],
    consentTitle: 'Before connecting a Company Page',
    consentIntro: SHARED_CONSENT_INTRO,
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
      {
        id: 'linkedin_terms',
        label:
          'I agree to LinkedIn\'s API Terms of Use and will comply with LinkedIn\'s platform policies.',
      },
      SHARED_AGENT_TERMS,
    ],
    scopesSummary: '',
    dataUseNote:
      'Page data is used only for Page management in Agent4Socials. We do not resell or use it for off-platform advertising.',
  },
};
