'use client';

import React, { useMemo } from 'react';
import { Users, Eye, FileText, Heart } from 'lucide-react';
import { AnalyticsGrid, AnalyticsGridItem } from '../AnalyticsGrid';
import { AnalyticsCard } from '../AnalyticsCard';
import { OverviewMetricCard } from '../OverviewMetricCard';
import { VisibilityMetricsCard } from '../VisibilityMetricsCard';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { FacebookInsights, FacebookPost } from './types';

interface FacebookOverviewTabProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  loading: boolean;
  onUpgrade?: () => void;
  /** e.g. "Subscribers" for YouTube; defaults to "Followers" */
  followersLabel?: string;
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
  followersLabel = 'Followers',
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
  const startValue = netGrowth !== 0 ? Math.max(0, followers - netGrowth) : 0;
  const displayFollowersSeries = followersSeries?.length
    ? followersSeries
    : [{ date: dateRange.start || '', value: startValue }, { date: dateRange.end || '', value: followers }];
  const displayViewsSeries = hasImpressionsData
    ? impressionsSeries
    : views > 0
      ? [{ date: dateRange.start || '', value: views }, { date: dateRange.end || '', value: views }]
      : [];

  const growthChartData = useMemo(() => {
    const postsByDate: Record<string, number> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      postsByDate[d] = (postsByDate[d] ?? 0) + 1;
    });
    const dateSet = new Set(displayFollowersSeries.map((x) => x.date));
    displayFollowersSeries.forEach((x) => dateSet.add(x.date));
    const sorted = Array.from(dateSet).sort();
    let prevFollowers = followers;
    return sorted.map((date) => {
      const f = displayFollowersSeries.find((x) => x.date === date)?.value;
      if (f !== undefined) prevFollowers = f;
      return {
        date,
        followers: f ?? prevFollowers,
        posts: postsByDate[date] ?? 0,
      };
    });
  }, [displayFollowersSeries, posts, followers]);

  const engagementByDate = useMemo(() => {
    const map: Record<string, { likes: number; comments: number; shares: number }> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      if (!map[d]) map[d] = { likes: 0, comments: 0, shares: 0 };
      map[d].likes += p.likeCount ?? 0;
      map[d].comments += p.commentsCount ?? 0;
      map[d].shares += p.sharesCount ?? 0;
    });
    return Object.entries(map)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  const postsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      map[d] = (map[d] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  const visibilityMetrics = useMemo(() => {
    const max = Math.max(views || 0, reach || 0, pageVisits || 0, 1);
    return [
      { label: 'Impressions', value: views || 0, percent: (views || 0) / max * 100 },
      { label: 'Reach', value: reach || 0, percent: (reach || 0) / max * 100 },
      { label: 'Profile Views', value: insights?.profileViewsTotal ?? 0, percent: ((insights?.profileViewsTotal ?? 0) / max) * 100 },
      { label: 'Page Visits', value: pageVisits || 0, percent: (pageVisits || 0) / max * 100 },
    ];
  }, [views, reach, pageVisits, insights?.profileViewsTotal]);

  const prevFollowers = Math.max(0, followers - netGrowth);
  const trendPct = netGrowth !== 0 && prevFollowers > 0 ? `${(netGrowth / prevFollowers * 100).toFixed(1)}%` : (netGrowth !== 0 ? `${netGrowth >= 0 ? '+' : ''}${netGrowth}` : undefined);
  const showWatermark = days > 30;
  const followersChartShowYear = useMemo(() => {
    const dates = growthChartData.map((d) => d.date);
    if (dates.length <= 2) return true;
    const first = new Date(dates[0]);
    const last = new Date(dates[dates.length - 1]);
    return first.getMonth() === last.getMonth() && first.getDate() === last.getDate();
  }, [growthChartData]);

  const growthFollowersDomain = useMemo(() => {
    if (growthChartData.length === 0) return undefined;
    const values = growthChartData.map((d) => d.followers).filter((v) => typeof v === 'number');
    if (values.length === 0) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding = span < 5 ? Math.max(1, Math.ceil(span * 0.5)) : Math.max(0, Math.ceil((max - min) * 0.05));
    return [Math.max(0, min - padding), max + padding] as [number, number];
  }, [growthChartData]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse max-w-full" style={{ maxWidth: 1400 }}>
        <AnalyticsGrid>
          {[1, 2, 3, 4].map((i) => (
            <AnalyticsGridItem key={i} span={3}>
              <div className="h-28 rounded-2xl bg-neutral-100" />
            </AnalyticsGridItem>
          ))}
        </AnalyticsGrid>
        <AnalyticsGrid>
          <AnalyticsGridItem span={8}><div className="h-72 rounded-2xl bg-neutral-100" /></AnalyticsGridItem>
          <AnalyticsGridItem span={4}><div className="h-72 rounded-2xl bg-neutral-100" /></AnalyticsGridItem>
        </AnalyticsGrid>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full" style={{ maxWidth: 1400 }}>
      {showWatermark && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-indigo-800">
            You're viewing more than 30 days. Upgrade to remove watermarks and view full history.
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Upgrade plan
          </button>
        </div>
      )}
      {/* Section 1 — Account Overview: 4 metric cards */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="followers"
            label={followersLabel}
            value={formatNull(insights?.followers) ?? '—'}
            trend={netGrowth !== 0 ? { direction: netGrowth >= 0 ? 'up' : 'down', value: trendPct ?? `${netGrowth >= 0 ? '+' : ''}${netGrowth}` } : undefined}
            icon={<Users size={22} className="text-indigo-600" />}
          />
        </AnalyticsGridItem>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="reach"
            label="Reach"
            value={formatNull(reach) ?? '—'}
            icon={<Eye size={22} className="text-cyan-600" />}
          />
        </AnalyticsGridItem>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="interactions"
            label="Interactions"
            value={totalInteractions}
            icon={<Heart size={22} className="text-rose-500" />}
          />
        </AnalyticsGridItem>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="posts"
            label="Posts"
            value={posts.length}
            icon={<FileText size={22} className="text-amber-600" />}
          />
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 2 — Growth (Metricool-style: summary cards + line + content bars) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsWatermarkedChart title="Growth" height={320} showWatermark={showWatermark}>
            <div className="w-full relative" style={{ height: 300 }}>
              {/* Summary cards (top-right, like Metricool) */}
              <div className="absolute top-0 right-0 z-20 flex flex-wrap gap-2 justify-end">
                <div className="rounded-xl px-3 py-2 bg-blue-500/10 border border-blue-200/80">
                  <p className="text-lg font-bold text-blue-700 tabular-nums">{followers.toLocaleString()}</p>
                  <p className="text-xs font-medium text-blue-600">{followersLabel}</p>
                </div>
                <div className="rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-200/80">
                  <p className="text-lg font-bold text-amber-700 tabular-nums">{posts.length}</p>
                  <p className="text-xs font-medium text-amber-600">Total content</p>
                </div>
              </div>
              {growthChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthChartData} margin={{ top: 8, right: 140, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString(undefined, followersChartShowYear ? { month: 'short', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric' })
                      }
                    />
                    <YAxis
                      yAxisId="left"
                      domain={growthFollowersDomain}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v.toLocaleString()}
                    />
                    <YAxis yAxisId="right" orientation="right" hide />
                    <RechartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length || !label) return null;
                        return (
                          <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                            <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                            {payload.map((p) => (
                              <p key={p.name} className="font-medium mt-0.5">
                                {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="posts"
                      name="Posts"
                      fill="#f59e0b"
                      radius={[2, 2, 0, 0]}
                      barSize={6}
                      isAnimationActive
                      animationDuration={400}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="followers"
                      name={followersLabel}
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ fill: '#2563eb', strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 4 }}
                      isAnimationActive
                      animationDuration={400}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No data for this period</div>
              )}
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 3 — Visibility Metrics (full row) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <VisibilityMetricsCard title="Visibility Metrics" metrics={visibilityMetrics} />
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 4 — Engagement Over Time (full row) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsWatermarkedChart title="Engagement Over Time" height={280} showWatermark={showWatermark}>
            <div className="w-full" style={{ height: 260 }}>
              {engagementByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={engagementByDate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="engagementLikesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="engagementCommentsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="engagementSharesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <RechartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length || !label) return null;
                        return (
                          <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                            <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                            {payload.map((p) => (
                              <p key={p.name} className="font-medium mt-0.5">{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="likes" name="Likes" stroke="#f43f5e" strokeWidth={2} fill="url(#engagementLikesGrad)" dot={false} isAnimationActive animationDuration={400} />
                    <Area type="monotone" dataKey="comments" name="Comments" stroke="#a855f7" strokeWidth={2} fill="url(#engagementCommentsGrad)" dot={false} isAnimationActive animationDuration={400} />
                    <Area type="monotone" dataKey="shares" name="Shares" stroke="#6366f1" strokeWidth={2} fill="url(#engagementSharesGrad)" dot={false} isAnimationActive animationDuration={400} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No engagement data yet</div>
              )}
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 5 — Publishing Activity (full row) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsWatermarkedChart title="Publishing Activity" height={280} showWatermark={showWatermark}>
            <div className="w-full" style={{ height: 220 }}>
              {postsByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={postsByDate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <RechartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length || !label) return null;
                        return (
                          <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                            <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                            <p className="font-medium mt-0.5">Posts: {(payload[0]?.value ?? 0) as number}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" name="Posts" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={400} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No posts in this period</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-100">
              <div>
                <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg posts per week</p>
                <p className="text-lg font-semibold text-[#111827] tabular-nums">{weeks ? (posts.length / weeks).toFixed(1) : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Total posts</p>
                <p className="text-lg font-semibold text-[#111827] tabular-nums">{posts.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg interactions per post</p>
                <p className="text-lg font-semibold text-[#111827] tabular-nums">{posts.length ? (totalInteractions / posts.length).toFixed(0) : '—'}</p>
              </div>
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 8 — Top Performing Posts (3 columns) */}
      {posts.length > 0 && (
        <AnalyticsGrid>
          <AnalyticsGridItem span={12}>
            <p className="text-sm font-semibold text-[#111827] mb-4">Top Performing Posts</p>
          </AnalyticsGridItem>
          {[...posts]
            .sort((a, b) => (b.impressions ?? 0) + (b.interactions ?? 0) - (a.impressions ?? 0) - (a.interactions ?? 0))
            .slice(0, 6)
            .map((post) => (
              <AnalyticsGridItem key={post.id} span={4}>
                <AnalyticsCard>
                  <div className="flex gap-3">
                    {post.thumbnailUrl ? (
                      <img src={post.thumbnailUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-neutral-100 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#6b7280] line-clamp-2">{post.content || 'Post'}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs">
                        <span className="text-[#111827] font-medium">{(post.impressions ?? 0).toLocaleString()} reach</span>
                        <span className="text-rose-500">{(post.likeCount ?? 0).toLocaleString()} likes</span>
                        <span className="text-purple-500">{(post.commentsCount ?? 0).toLocaleString()} comments</span>
                      </div>
                    </div>
                  </div>
                </AnalyticsCard>
              </AnalyticsGridItem>
            ))}
        </AnalyticsGrid>
      )}

      {/* Upgrade CTA */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsUpgradeCard
            title="Need shareable reports?"
            description="Upgrade to export Facebook analytics without watermark."
            ctaLabel="Upgrade plan"
            onCta={onUpgrade}
          />
        </AnalyticsGridItem>
      </AnalyticsGrid>
    </div>
  );
}
