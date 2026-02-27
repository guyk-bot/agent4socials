'use client';

import { useMemo } from 'react';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData } from '@/context/AppDataContext';
import type { SummaryData, SummaryKPIs, SummaryPlatform, SummaryPost } from './types';

type AccountLike = { id: string; platform: string; username?: string | null };

export function useSummaryData(
  dateRange: { start: string; end: string },
  platformFilter: string[]
): SummaryData | null {
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const appData = useAppData();
  const accounts = (cachedAccounts as AccountLike[]) ?? [];

  return useMemo(() => {
    if (!appData || accounts.length === 0) return null;

    const filteredAccounts = platformFilter.length > 0
      ? accounts.filter((a) => platformFilter.includes(a.platform))
      : accounts;

    const platforms: SummaryPlatform[] = [];
    const allPosts: SummaryPost[] = [];
    const reachSparkline: number[] = [];
    const postsSparkline: number[] = [];
    const timeSeriesMap = new Map<string, { reach: number; posts: number }>();
    const dailyPublishMap = new Map<string, Record<string, number>>();
    const dailyEngageList: Array<{ date: string; likes: number; comments: number; shares: number; clicks: number }> = [];

    let totalFollowers = 0;
    let totalReach = 0;
    let totalEngagement = 0;
    let totalPostsCount = 0;

    filteredAccounts.forEach((acc) => {
      const insights = appData.getInsights(acc.id);
      const posts = appData.getPosts(acc.id) ?? [];
      const followers = insights?.followers ?? 0;
      const reach = insights?.impressionsTotal ?? 0;
      const interactions = posts.reduce((s, p) => s + (p.interactions ?? 0), 0);
      totalFollowers += followers;
      totalReach += reach;
      totalEngagement += interactions;
      totalPostsCount += posts.length;

      const series = insights?.impressionsTimeSeries ?? [];
      series.forEach((d) => {
        const existing = timeSeriesMap.get(d.date) ?? { reach: 0, posts: 0 };
        existing.reach += d.value;
        timeSeriesMap.set(d.date, existing);
      });

      if (series.length > 0) reachSparkline.push(...series.slice(-14).map((d) => d.value));
      else if (reach > 0) reachSparkline.push(reach);

      platforms.push({
        id: acc.id,
        platform: acc.platform,
        username: acc.username,
        followers,
        reach,
        engagement: interactions,
        posts: posts.length,
        impressions: reach,
        timeSeries: series,
      });

      posts.forEach((p) => {
        const date = p.publishedAt?.slice(0, 10) ?? '';
        if (date >= dateRange.start && date <= dateRange.end) {
          const prev = dailyPublishMap.get(date) ?? {};
          prev[acc.platform] = (prev[acc.platform] ?? 0) + 1;
          dailyPublishMap.set(date, prev);
          allPosts.push({
            id: p.id,
            thumbnailUrl: p.thumbnailUrl,
            caption: p.content ?? null,
            platform: p.platform,
            date: p.publishedAt,
            reach: p.impressions ?? 0,
            impressions: p.impressions ?? 0,
            engagement: p.interactions ?? 0,
            engagementRate: 0,
            mediaType: p.mediaType,
          });
        }
      });
    });

    const sortedDates = Array.from(timeSeriesMap.keys()).sort();
    sortedDates.forEach((date) => {
      const v = timeSeriesMap.get(date)!;
      postsSparkline.push(v.posts);
    });
    if (reachSparkline.length === 0 && totalReach > 0) reachSparkline.push(totalReach);
    const audienceSparkline = Array(14).fill(totalFollowers);
    const engagementSparkline = Array(14).fill(totalEngagement);

    const engagementRate = totalReach > 0 ? (totalEngagement / totalReach) * 100 : 0;

    const kpis: SummaryKPIs = {
      totalAudience: totalFollowers,
      totalReach,
      engagementRate,
      contentPublished: totalPostsCount,
      audienceSparkline,
      reachSparkline: reachSparkline.slice(-30),
      engagementSparkline,
      postsSparkline: postsSparkline.length ? postsSparkline.slice(-30) : (totalPostsCount ? [totalPostsCount] : []),
    };

    const dailyPublishing = Array.from(dailyPublishMap.entries())
      .map(([date, byPlatform]) => ({ date, count: Object.values(byPlatform).reduce((a, b) => a + b, 0), byPlatform }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const timeSeries = sortedDates.map((date) => {
      const v = timeSeriesMap.get(date)!;
      return {
        date,
        audience: totalFollowers,
        reach: v.reach,
        engagement: totalEngagement,
        posts: v.posts,
      };
    });

    const contentTypeDistribution = filteredAccounts.map((acc) => {
      const posts = appData.getPosts(acc.id) ?? [];
      const reels = posts.filter((p) => (p.mediaType ?? '').toLowerCase().includes('reel') || (p.mediaType ?? '').toLowerCase().includes('video')).length;
      const stories = 0;
      const regular = Math.max(0, posts.length - reels - stories);
      return {
        platform: acc.platform,
        segments: [
          { label: 'Posts', value: regular, color: '#94a3b8' },
          { label: 'Reels', value: reels, color: '#c084fc' },
          { label: 'Stories', value: stories, color: '#f472b6' },
        ].filter((s) => s.value > 0),
      };
    }).filter((d) => d.segments.length > 0);

    return {
      kpis,
      platforms,
      posts: allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      dailyPublishing,
      dailyEngagement: dailyEngageList,
      contentTypeDistribution,
      timeSeries,
    };
  }, [appData, accounts, dateRange.start, dateRange.end, platformFilter.join(',')]);
}
