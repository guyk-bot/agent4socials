'use client';

import React, { useMemo } from 'react';
import { FacebookOverviewTab } from './FacebookOverviewTab';
import { FacebookPageViewsTab } from './FacebookPageViewsTab';
import { FacebookPostsTab } from './FacebookPostsTab';
import { OverviewGrowthSection } from '../OverviewGrowthSection';
import type { GrowthDataPoint } from '../OverviewGrowthSection';
import type { FacebookInsights, FacebookPost } from './types';

/** Section ids for scroll-to navigation. Must match dashboard scroll nav. */
export const FACEBOOK_ANALYTICS_SECTION_IDS = {
  overview: 'overview',
  clicksTraffic: 'clicks-traffic',
  posts: 'posts',
  reelsVideos: 'reels-videos',
} as const;

export interface FacebookAnalyticsViewProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  insightsLoading: boolean;
  postsLoading: boolean;
  onUpgrade?: () => void;
  onSync?: () => void;
  /** e.g. "Subscribers" for YouTube; defaults to "Followers" */
  followersLabel?: string;
}

export function FacebookAnalyticsView({
  insights,
  posts,
  dateRange,
  insightsLoading,
  postsLoading,
  onUpgrade,
  onSync,
  followersLabel = 'Followers',
}: FacebookAnalyticsViewProps) {
  const loading = insightsLoading || postsLoading;

  const growthData = useMemo((): GrowthDataPoint[] | undefined => {
    const series = insights?.impressionsTimeSeries ?? [];
    const followerSeries = insights?.followersTimeSeries ?? [];
    const postsByDate: Record<string, number> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      postsByDate[d] = (postsByDate[d] ?? 0) + 1;
    });
    const dates = new Set<string>([
      ...series.map((s) => s.date),
      ...followerSeries.map((s) => s.date),
      ...Object.keys(postsByDate),
    ]);
    if (dates.size === 0) return undefined;
    const sorted = Array.from(dates).sort();
    return sorted.map((date) => ({
      date,
      followers: followerSeries.find((s) => s.date === date)?.value ?? 0,
      posts: postsByDate[date] ?? 0,
      views: series.find((s) => s.date === date)?.value ?? 0,
      visits: 0,
    }));
  }, [insights?.impressionsTimeSeries, insights?.followersTimeSeries, posts]);

  return (
    <div className="space-y-12 max-w-full" style={{ maxWidth: 1400 }}>
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-6 space-y-10">
        <OverviewGrowthSection
          data={growthData}
          dateRange={dateRange}
          onExport={() => {}}
        />
        <FacebookOverviewTab
          insights={insights}
          posts={posts}
          dateRange={dateRange}
          loading={loading}
          onUpgrade={onUpgrade}
          followersLabel={followersLabel}
        />
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.clicksTraffic} className="scroll-mt-6">
        <FacebookPageViewsTab
          insights={insights}
          dateRange={dateRange}
          loading={loading}
          onUpgrade={onUpgrade}
        />
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-6">
        <FacebookPostsTab
          posts={posts}
          dateRange={dateRange}
          loading={loading}
          onSync={onSync}
          onUpgrade={onUpgrade}
        />
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reelsVideos} className="scroll-mt-6">
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-1">Reels / Videos</h2>
          <p className="text-sm text-neutral-500">
            Video and Reels analytics for this account will appear here when available.
          </p>
        </div>
      </section>
    </div>
  );
}
