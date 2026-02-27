/** Aggregated summary data for the Summary Dashboard (derived from AppData + accounts). */
export type SummaryPlatform = {
  id: string;
  platform: string;
  username?: string | null;
  followers: number;
  followersChange?: number;
  reach: number;
  reachChange?: number;
  engagement: number;
  posts: number;
  impressions: number;
  videoViews?: number;
  clicks?: number;
  timeSeries: Array<{ date: string; value: number }>;
};

export type SummaryPost = {
  id: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  platform: string;
  date: string;
  reach: number;
  impressions: number;
  engagement: number;
  engagementRate?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  videoViews?: number;
  watchTime?: number;
  performanceScore?: number;
  mediaType?: string | null;
};

export type SummaryKPIs = {
  totalAudience: number;
  totalAudienceChange?: number;
  totalReach: number;
  totalReachChange?: number;
  engagementRate: number;
  engagementRateChange?: number;
  contentPublished: number;
  contentPublishedChange?: number;
  audienceSparkline: number[];
  reachSparkline: number[];
  engagementSparkline: number[];
  postsSparkline: number[];
};

export type SummaryContentTypeBreakdown = {
  platform: string;
  segments: Array<{ label: string; value: number; color: string }>;
};

export type SummaryData = {
  kpis: SummaryKPIs;
  platforms: SummaryPlatform[];
  posts: SummaryPost[];
  dailyPublishing: Array<{ date: string; count: number; byPlatform: Record<string, number> }>;
  dailyEngagement: Array<{ date: string; likes: number; comments: number; shares: number; clicks: number }>;
  contentTypeDistribution: SummaryContentTypeBreakdown[];
  timeSeries: Array<{ date: string; audience?: number; reach?: number; engagement?: number; posts?: number }>;
};
