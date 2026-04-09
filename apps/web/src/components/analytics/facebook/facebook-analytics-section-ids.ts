/** Section ids for scroll-to navigation on the dashboard Facebook analytics view. */
export const FACEBOOK_ANALYTICS_SECTION_IDS = {
  overview: 'overview',
  /** Kept for compatibility with existing dev panel anchors. */
  readInsightsApi: 'overview',
  traffic: 'traffic',
  posts: 'posts',
  reels: 'reels',
  /** Long-form YouTube uploads (analytics shell only; scroll target). */
  videos: 'videos',
  history: 'history',
} as const;
