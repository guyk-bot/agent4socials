/**
 * Shared types for Facebook analytics view.
 * Aligned with GET /api/social/accounts/[id]/insights and imported posts.
 */

export interface FacebookInsights {
  platform: string;
  followers: number;
  /** Instagram: follows_count (accounts the user follows). */
  followingCount?: number;
  impressionsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  pageViewsTotal?: number;
  /** Page visits by date (from page_views_total insights). */
  pageViewsTimeSeries?: Array<{ date: string; value: number }>;
  reachTotal?: number;
  profileViewsTotal?: number;
  insightsHint?: string;
  /** New followers by date: { date, gained, lost, net }. */
  growthTimeSeries?: Array<{ date: string; gained: number; lost: number; net?: number }>;
  /** Optional time series for followers chart (used by all platforms). */
  followersTimeSeries?: Array<{ date: string; value: number }>;
  /** Demographics (age, gender, country) when requested with extended=1. */
  demographics?: import('@/types/analytics').Demographics;
}

export interface FacebookPost {
  id: string;
  platform: string;
  content?: string | null;
  thumbnailUrl?: string | null;
  permalinkUrl?: string | null;
  impressions: number;
  interactions: number;
  publishedAt: string;
  mediaType?: string | null;
  likeCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  repostsCount?: number;
}
