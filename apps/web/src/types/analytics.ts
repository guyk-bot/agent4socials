/**
 * Normalized analytics types for cross-platform dashboard.
 * Used by GET /api/social/accounts/[id]/insights?extended=1 and /api/social/accounts/[id]/analytics.
 */

export type DemographicBreakdownItem = {
  dimensionValue: string;
  label?: string;
  value: number;
};

export type Demographics = {
  byCountry?: DemographicBreakdownItem[];
  byCity?: DemographicBreakdownItem[];
  byRegion?: DemographicBreakdownItem[];
  byAge?: DemographicBreakdownItem[];
  byGender?: DemographicBreakdownItem[];
  hint?: string;
};

export type TrafficSourceItem = {
  source: string;
  value: number;
};

export type GrowthDataPoint = {
  date: string;
  gained: number;
  lost: number;
  net?: number;
};

export type ExtendedAnalytics = {
  platform: string;
  followers: number;
  impressionsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  reachTotal?: number;
  pageViewsTotal?: number;
  profileViewsTotal?: number;
  demographics?: Demographics;
  trafficSources?: TrafficSourceItem[];
  growthTimeSeries?: GrowthDataPoint[];
  extra?: Record<string, number | number[] | Array<{ date: string; value: number }>>;
  raw?: Record<string, unknown>;
  insightsHint?: string;
  analyticsError?: string;
};
