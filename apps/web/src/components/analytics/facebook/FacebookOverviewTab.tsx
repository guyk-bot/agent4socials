'use client';

import React from 'react';
import { Users, Eye, FileText, Heart, Share2, TrendingUp } from 'lucide-react';
import { AnalyticsKpiCard } from '../AnalyticsKpiCard';
import { AnalyticsSectionHeader } from '../AnalyticsSectionHeader';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import type { FacebookInsights, FacebookPost } from './types';

interface FacebookOverviewTabProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  loading: boolean;
  onUpgrade?: () => void;
  onReconnect?: () => void;
  showPermissionsNotice?: boolean;
}

function formatNull(value: number | undefined | null): string | number | null {
  if (value === undefined || value === null) return null;
  return value;
}

export function FacebookOverviewTab({
  insights,
  posts,
  dateRange,
  loading,
  onUpgrade,
  onReconnect,
  showPermissionsNotice,
}: FacebookOverviewTabProps) {
  const start = dateRange.start ? new Date(dateRange.start) : null;
  const end = dateRange.end ? new Date(dateRange.end) : null;
  const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;
  const weeks = days ? days / 7 : 0;

  const followers = insights?.followers ?? 0;
  const views = insights?.impressionsTotal ?? 0;
  const pageVisits = insights?.pageViewsTotal ?? insights?.profileViewsTotal ?? 0;
  const reach = insights?.reachTotal ?? 0;
  const totalInteractions = posts.reduce((s, p) => s + (p.interactions ?? 0), 0);
  const growthSeries = insights?.growthTimeSeries ?? [];
  const netGrowth = growthSeries.reduce((s, p) => s + (p.net ?? p.gained - (p.lost ?? 0)), 0);

  const impressionsSeries = insights?.impressionsTimeSeries ?? [];
  const hasImpressionsData = impressionsSeries.length > 0 && impressionsSeries.some((d) => d.value > 0);
  const followersSeries = (insights as { followersTimeSeries?: Array<{ date: string; value: number }> })?.followersTimeSeries;
  const displayFollowersSeries = followersSeries?.length
    ? followersSeries
    : [{ date: dateRange.start || '', value: followers }, { date: dateRange.end || '', value: followers }];
  const displayViewsSeries = hasImpressionsData
    ? impressionsSeries
    : views > 0
      ? [{ date: dateRange.start || '', value: views }, { date: dateRange.end || '', value: views }]
      : [];

  if (loading) {
    return (
      <div className="space-y-10 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-neutral-100" />
          <div className="h-72 rounded-2xl bg-neutral-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10" style={{ maxWidth: 1400 }}>
      {/* Section A — Key summary cards */}
      <section>
        <AnalyticsSectionHeader title="Key metrics" subtitle="Summary for the selected period." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <AnalyticsKpiCard
            label="Followers"
            value={formatNull(insights?.followers)}
            trend={netGrowth !== 0 ? { direction: netGrowth >= 0 ? 'up' : 'down', value: `${netGrowth >= 0 ? '+' : ''}${netGrowth} this period` } : undefined}
            accent="audience"
            icon={<Users size={20} />}
          />
          <AnalyticsKpiCard
            label="Views"
            value={formatNull(views)}
            subtitle="Page impressions"
            accent="visibility"
            icon={<Eye size={20} />}
          />
          <AnalyticsKpiCard
            label="Page Visits"
            value={formatNull(pageVisits) || '—'}
            accent="visibility"
          />
          <AnalyticsKpiCard
            label="Published Content"
            value={posts.length}
            subtitle={weeks ? `${(posts.length / weeks).toFixed(1)} per week` : undefined}
            accent="content"
            icon={<FileText size={20} />}
          />
          <AnalyticsKpiCard
            label="Interactions"
            value={totalInteractions}
            subtitle={posts.length ? `Avg ${(totalInteractions / posts.length).toFixed(0)} per post` : undefined}
            accent="engagement"
            icon={<Heart size={20} />}
          />
          <AnalyticsKpiCard
            label="Reach"
            value={formatNull(reach) || '—'}
            subtitle="Engaged users"
            accent="engagement"
            icon={<Share2 size={20} />}
          />
        </div>
      </section>

      {/* Section B — Audience & visibility trends */}
      <section>
        <AnalyticsSectionHeader
          title="Audience & visibility"
          subtitle="Track how your Facebook audience and page visibility evolve over time."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsWatermarkedChart title="Audience trend" height={260}>
            <InteractiveLineChart
              data={displayFollowersSeries}
              height={240}
              valueLabel="Followers"
              color="#10b981"
              crosshair
            />
          </AnalyticsWatermarkedChart>
          <AnalyticsWatermarkedChart title="Visibility trend" height={260}>
            <InteractiveLineChart
              data={displayViewsSeries.length ? displayViewsSeries : [{ date: dateRange.start || '', value: 0 }, { date: dateRange.end || '', value: 0 }]}
              height={240}
              valueLabel="Views"
              color="#6366f1"
              crosshair
            />
          </AnalyticsWatermarkedChart>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg daily new followers</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{days ? (netGrowth / days).toFixed(1) : '—'}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Daily page views</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{days && pageVisits ? (pageVisits / days).toFixed(1) : '—'}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Posts per week</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{weeks ? (posts.length / weeks).toFixed(1) : '—'}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg interactions per post</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{posts.length ? (totalInteractions / posts.length).toFixed(0) : '—'}</p>
          </div>
        </div>
      </section>

      {/* Section C — Content activity snapshot */}
      <section>
        <AnalyticsSectionHeader title="Publishing performance" subtitle="How your posted content performed during the selected period." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <AnalyticsKpiCard label="Total posts" value={posts.length} accent="content" />
          <AnalyticsKpiCard label="Avg. interactions per post" value={posts.length ? (totalInteractions / posts.length).toFixed(0) : '—'} accent="engagement" />
          <AnalyticsKpiCard label="Total views on posts" value={posts.reduce((s, p) => s + (p.impressions ?? 0), 0)} accent="visibility" />
          <AnalyticsKpiCard label="Avg reach per post" value={posts.length && reach ? (reach / posts.length).toFixed(0) : '—'} accent="visibility" />
          <AnalyticsKpiCard label="Total reactions" value={posts.reduce((s, p) => s + (p.likeCount ?? 0), 0)} accent="engagement" />
        </div>
      </section>

      {/* Section D — Export CTA */}
      <section>
        <AnalyticsUpgradeCard
          title="Need shareable reports?"
          description="Upgrade to export Facebook analytics without watermark."
          ctaLabel="Upgrade plan"
          onCta={onUpgrade}
        />
      </section>

      {showPermissionsNotice && onReconnect && (
        <AnalyticsUpgradeCard
          title="More insights are available"
          description="Connect Facebook Page insights permissions to unlock follower trends, views, reach, and growth charts."
          ctaLabel="Reconnect account"
          onCta={onReconnect}
        />
      )}
    </div>
  );
}
