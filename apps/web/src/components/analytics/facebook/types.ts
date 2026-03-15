/**
 * Shared types for Facebook analytics view.
 * Aligned with GET /api/social/accounts/[id]/insights and imported posts.
 */

export interface FacebookInsights {
  platform: string;
  followers: number;
  impressionsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  pageViewsTotal?: number;
  reachTotal?: number;
  profileViewsTotal?: number;
  insightsHint?: string;
  growthTimeSeries?: Array<{ date: string; gained: number; lost: number; net?: number }>;
  /** Optional time series for followers chart (used by all platforms). */
  followersTimeSeries?: Array<{ date: string; value: number }>;
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
