export type TikTokConnectMethod = 'personal' | 'business';

export type TikTokConnectOptionCopy = {
  badge: string;
  title: string;
  subtitle: string;
  features: string[];
  limitations: string[];
};

export const TIKTOK_CONNECT_OPTIONS: Record<TikTokConnectMethod, TikTokConnectOptionCopy> = {
  personal: {
    badge: 'Personal',
    title: 'Personal account',
    subtitle: 'For individual creators and personal brands on TikTok',
    features: [
      'Publish and schedule videos from the Composer (Direct Post API)',
      'Sync your uploaded videos for analytics and post history',
      'Track followers, views, likes, comments, and shares on synced videos',
      'Use TikTok post settings (privacy, comments, branded content) before publish',
    ],
    limitations: [
      'Sign in with your personal TikTok profile during OAuth (not a separate login type in our app)',
      'TikTok DMs are not available in Inbox (Instagram or Facebook for messaging)',
      'Inbox shows comment activity counts; TikTok does not expose full comment text in the API we use',
      'Photo carousels and some post types depend on TikTok creator limits for your account',
    ],
  },
  business: {
    badge: 'Business',
    title: 'Business account',
    subtitle: 'For brands, shops, and business profiles on TikTok',
    features: [
      'Same publishing and scheduling as personal when you connect a Business or Creator account',
      'Sync videos and view performance metrics in Analytics and Console',
      'Schedule content in advance from the calendar',
      'Keeps business vs personal labeled in Accounts for easier reconnect',
    ],
    limitations: [
      'You must choose a Business or Creator account on TikTok\'s login screen (not a personal-only profile)',
      'TikTok DMs are not available in Inbox',
      'Inbox comment text is not available; use TikTok\'s app for detailed comment threads',
      'Some metrics may need TikTok app review or reconnect if counts do not appear',
    ],
  },
};
