/** Section ids for scroll-to navigation on the dashboard Facebook analytics view. */
export const FACEBOOK_ANALYTICS_SECTION_IDS = {
  overview: 'overview',
  /** Kept for compatibility with existing dev panel anchors. */
  readInsightsApi: 'overview',
  traffic: 'traffic',
  posts: 'posts',
  reels: 'reels',
  /** YouTube Shorts analytics (split from long-form `reels`). */
  youtubeShorts: 'youtube-shorts',
  history: 'history',
} as const;
