'use client';

import React, { useMemo } from 'react';
import { FacebookOverviewTab } from './FacebookOverviewTab';
import { FacebookPageViewsTab } from './FacebookPageViewsTab';
import { FacebookPostsTab } from './FacebookPostsTab';
import { OverviewGrowthSection } from '../OverviewGrowthSection';
import type { GrowthDataPoint } from '../OverviewGrowthSection';
import type { FacebookInsights, FacebookPost } from './types';

/** Section ids for scroll-to navigation. Must match dashboard scroll nav. Facebook does not provide demographics via API so that tab is omitted. */
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
  /** Called when user taps "Reconnect Facebook" to refresh followers/views; opens connect flow. */
  onReconnectFacebook?: () => void;
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
  onReconnectFacebook,
  followersLabel = 'Followers',
}: FacebookAnalyticsViewProps) {
  const loading = insightsLoading || postsLoading;
  const showReconnectCta = insights && (insights.followers === 0 && insights.impressionsTotal === 0) && onReconnectFacebook;

  const growthData = useMemo((): GrowthDataPoint[] | undefined => {
    const start = dateRange?.start;
    const end = dateRange?.end;
    if (!start || !end) return undefined;
    const series = insights?.impressionsTimeSeries ?? [];
    const followerSeries = insights?.followersTimeSeries ?? [];
    const followingSeries = insights?.followingTimeSeries;
    const visitsSeries = insights?.pageViewsTimeSeries ?? [];
    const postsByDate: Record<string, number> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      postsByDate[d] = (postsByDate[d] ?? 0) + 1;
    });

    const allDates: string[] = [];
    const dStart = new Date(start + 'T12:00:00');
    const dEnd = new Date(end + 'T12:00:00');
    for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    if (allDates.length === 0) return undefined;

    const followerMap: Record<string, number> = {};
    followerSeries.forEach((s) => {
      if (s.date >= start && s.date <= end) followerMap[s.date] = s.value;
    });
    const followingMap: Record<string, number> = {};
    followingSeries?.forEach((s) => {
      if (s.date >= start && s.date <= end) followingMap[s.date] = s.value;
    });
    const viewsMap: Record<string, number> = {};
    series.forEach((s) => {
      if (s.date >= start && s.date <= end) viewsMap[s.date] = s.value;
    });
    const visitsMap: Record<string, number> = {};
    visitsSeries.forEach((s) => {
      if (s.date >= start && s.date <= end) visitsMap[s.date] = s.value;
    });

    const sortedFollower = [...followerSeries].sort((a, b) => b.date.localeCompare(a.date));
    const baselineFollowers = followerMap[start] ?? sortedFollower.find((s) => s.date <= start)?.value ?? 0;
    const sortedFollowing = followingSeries?.length ? [...followingSeries].sort((a, b) => b.date.localeCompare(a.date)) : [];
    const baselineFollowing = followingMap[start] ?? sortedFollowing.find((s) => s.date <= start)?.value ?? insights?.followingCount ?? null;
    const sortedViews = [...series].sort((a, b) => b.date.localeCompare(a.date));
    const baselineViewsVal = viewsMap[start] ?? sortedViews.find((s) => s.date <= start)?.value ?? 0;
    const sortedVisits = [...visitsSeries].sort((a, b) => b.date.localeCompare(a.date));
    const baselineVisitsVal = visitsMap[start] ?? sortedVisits.find((s) => s.date <= start)?.value ?? 0;

    let prevF = baselineFollowers;
    let prevFollowing: number | null = baselineFollowing ?? null;
    let prevViews = baselineViewsVal;
    let prevVisits = baselineVisitsVal;
    return allDates.map((date) => {
      const f = followerMap[date] ?? prevF;
      const fol = followingMap[date] ?? prevFollowing;
      if (fol != null) prevFollowing = fol;
      const v = viewsMap[date] ?? prevViews;
      const vis = visitsMap[date] ?? prevVisits;
      prevF = f;
      prevViews = v;
      prevVisits = vis;
      return {
        date,
        followers: f,
        views: v,
        visits: vis,
        posts: postsByDate[date] ?? 0,
        ...(fol != null ? { following: fol } : insights?.followingCount != null ? { following: insights.followingCount } : {}),
      };
    });
  }, [dateRange?.start, dateRange?.end, insights?.impressionsTimeSeries, insights?.followersTimeSeries, insights?.pageViewsTimeSeries, insights?.followingCount, insights?.followingTimeSeries, posts]);

  return (
    <div className="space-y-12 max-w-full" style={{ maxWidth: 1400 }}>
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-6 space-y-10">
        {(insights?.insightsHint || showReconnectCta) && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm text-violet-900">
            <p className="font-medium">
              {insights?.insightsHint ?? 'Followers and views come from your Facebook Page. Connect with the right permissions to see them here.'}
            </p>
            {showReconnectCta && (
              <button
                type="button"
                onClick={onReconnectFacebook}
                className="mt-3 px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors"
              >
                Reconnect Facebook to see followers and views
              </button>
            )}
          </div>
        )}
        <OverviewGrowthSection
          data={growthData}
          growthTimeSeries={insights?.growthTimeSeries}
          dateRange={dateRange}
          onExport={() => {}}
          platform={insights?.platform}
          followingCount={insights?.followingCount}
          firstConnectedAt={insights?.firstConnectedAt}
          isBootstrap={insights?.isBootstrap}
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
