/**
 * Shared types for Facebook analytics view.
 * Aligned with GET /api/social/accounts/[id]/insights and imported posts.
 */

import type { FacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';

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
  /** Per-day following (from our snapshots for Instagram); when present chart shows fluctuation. */
  followingTimeSeries?: Array<{ date: string; value: number }>;
  /** When true, chart data is from our DB (snapshot or bootstrap). */
  metricHistoryFromSnapshots?: boolean;
  /** When true, we have &lt; 2 snapshots and show flat bootstrap line; show "Tracking started on …". */
  isBootstrap?: boolean;
  /** First connection date (for bootstrap helper text). */
  firstConnectedAt?: string | null;
  /** Demographics (age, gender, country) when requested with extended=1. */
  demographics?: import('@/types/analytics').Demographics;
  /** Live Meta demographics normalized for Traffic widget. */
  audienceByCountry?: {
    label: string;
    rows: Array<{ country: string; value: number; percent: number }>;
  };
  /** Graph-native metric name → daily series (from live API merge). */
  facebookPageMetricSeries?: Record<string, Array<{ date: string; value: number }>>;
  /** When extended=1: rows upserted into `facebook_page_insight_daily` on last persist. */
  facebookInsightPersistence?: { dailyRowsUpserted: number };
  /** Stable series + totals for dashboard widgets (followers, follows, views, engagement, video, actions, post impressions). */
  facebookAnalytics?: FacebookFrontendAnalyticsBundle;
  /** Page profile strip data from Graph page endpoint. */
  facebookPageProfile?: {
    id?: string;
    name?: string;
    username?: string;
    category?: string;
    followers_count?: number;
    fan_count?: number;
    website?: string;
    is_published?: boolean;
    is_verified?: boolean;
    verification_status?: string;
  };
  /** Supporting community data from cached sync tables. */
  facebookCommunity?: {
    conversationsCount: number;
    latestConversationAt: string | null;
    ratingsCount: number;
    latestRecommendationText: string | null;
  };
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
  /** Post lifetime insights from sync (registry-valid metrics only). */
  facebookInsights?: Record<string, number>;
  /** Edge summaries + scalar totals for quick UI (Facebook only). */
  engagementBreakdown?: {
    reactions: number;
    comments: number;
    shares: number;
    totalEngagement: number;
  };
}
