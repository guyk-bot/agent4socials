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
  demographics: 'demographics',
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
    const visitsSeries = insights?.pageViewsTimeSeries ?? [];
    const postsByDate: Record<string, number> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      postsByDate[d] = (postsByDate[d] ?? 0) + 1;
    });
    const dates = new Set<string>([
      ...series.map((s) => s.date),
      ...followerSeries.map((s) => s.date),
      ...visitsSeries.map((s) => s.date),
      ...Object.keys(postsByDate),
    ]);
    if (dates.size === 0) return undefined;
    const sorted = Array.from(dates).sort();
    return sorted.map((date) => ({
      date,
      followers: followerSeries.find((s) => s.date === date)?.value ?? 0,
      posts: postsByDate[date] ?? 0,
      views: series.find((s) => s.date === date)?.value ?? 0,
      visits: visitsSeries.find((s) => s.date === date)?.value ?? 0,
    }));
  }, [insights?.impressionsTimeSeries, insights?.followersTimeSeries, insights?.pageViewsTimeSeries, posts]);

  return (
    <div className="space-y-12 max-w-full" style={{ maxWidth: 1400 }}>
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-6 space-y-10">
        <OverviewGrowthSection
          data={growthData}
          growthTimeSeries={insights?.growthTimeSeries}
          dateRange={dateRange}
          onExport={() => {}}
          platform={insights?.platform}
          followingCount={insights?.followingCount}
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

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.demographics} className="scroll-mt-6">
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900 mb-1">Demografic</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Audience demographics by age, gender, and location when available.
          </p>
          {insights?.demographics && (insights.demographics.byAge?.length || insights.demographics.byGender?.length || insights.demographics.byCountry?.length) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {insights.demographics.byAge?.length ? (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Age</p>
                  <ul className="space-y-1 text-sm text-neutral-700">
                    {insights.demographics.byAge.slice(0, 8).map((item, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{item.dimensionValue ?? item.label}</span>
                        <span className="tabular-nums text-neutral-500">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {insights.demographics.byGender?.length ? (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Gender</p>
                  <ul className="space-y-1 text-sm text-neutral-700">
                    {insights.demographics.byGender.slice(0, 6).map((item, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{item.dimensionValue ?? item.label}</span>
                        <span className="tabular-nums text-neutral-500">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {insights.demographics.byCountry?.length ? (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Country</p>
                  <ul className="space-y-1 text-sm text-neutral-700">
                    {insights.demographics.byCountry.slice(0, 8).map((item, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{item.dimensionValue ?? item.label}</span>
                        <span className="tabular-nums text-neutral-500">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">{insights?.demographics?.hint ?? 'Demographics will appear here when available (e.g. after 100+ followers and with extended insights).'}</p>
          )}
        </div>
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
