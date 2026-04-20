/**
 * Shared TypeScript interfaces and client-safe constants for the Unified
 * Command Center. This file must NOT import Prisma or any server-only module.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UnifiedKpiSummary {
  totalAudience: number;
  totalImpressions: number;
  totalEngagement: number;
  totalPosts: number;
  audienceGrowthPercentage: number;
  impressionsGrowthPercentage: number;
  engagementGrowthPercentage: number;
  postsGrowthPercentage: number;
}

export interface UnifiedChartPoint {
  date: string;
  Instagram: number;
  Meta: number;
  X: number;
  LinkedIn: number;
  YouTube: number;
  TikTok: number;
  Pinterest: number;
  [key: string]: string | number;
}

export type UnifiedChartData = UnifiedChartPoint[];

export interface UnifiedTopPost {
  id: string;
  platform: string;
  caption: string;
  url: string | null;
  thumbnailUrl: string | null;
  totalEngagement: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string;
}

export interface UnifiedHistoryPost {
  id: string;
  platform: string;
  caption: string;
  url: string | null;
  thumbnailUrl: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  totalEngagement: number;
  postedAt: string;
  mediaType: string | null;
}

export interface UnifiedEngagementDay {
  date: string;
  likes: number;
  comments: number;
  shares: number;
  reposts: number;
}

export interface UnifiedActivityDay {
  date: string;
  posts: number;
}

/**
 * Daily per-platform post counts split by content type. This is computed from ALL
 * `importedPost` rows in the reporting window (not capped at the history limit)
 * so the Console "Posts" chart can show accurate per-platform totals even when a
 * user has hundreds of posts and some platforms fall outside the history slice.
 */
export interface UnifiedPostsBreakdownDay {
  date: string;
  /** Per-platform counts keyed by label (Instagram, Meta, X, LinkedIn, YouTube, TikTok, Pinterest). */
  reels: Record<string, number>;
  image: Record<string, number>;
  carousel: Record<string, number>;
  all: Record<string, number>;
}

export interface UnifiedSummaryResponse {
  kpi: UnifiedKpiSummary;
  chart: UnifiedChartData;
  audienceChart: UnifiedChartData;
  engagementChart: UnifiedChartData;
  engagementBreakdown: UnifiedEngagementDay[];
  activityBreakdown: UnifiedActivityDay[];
  postsBreakdown: UnifiedPostsBreakdownDay[];
  topPosts: UnifiedTopPost[];
  history: UnifiedHistoryPost[];
}

// ─── Client-safe constants ────────────────────────────────────────────────────

export const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Meta',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  PINTEREST: 'Pinterest',
};

export const PLATFORM_COLOR: Record<string, string> = {
  Instagram: '#e1306c',
  Meta: '#1877f2',
  X: '#5b7fa6',
  LinkedIn: '#0a66c2',
  YouTube: '#ff0000',
  TikTok: '#69c9d0',
  Pinterest: '#e60023',
};

export const CHART_PLATFORMS = [
  'Instagram',
  'Meta',
  'X',
  'LinkedIn',
  'YouTube',
  'TikTok',
  'Pinterest',
] as const;
