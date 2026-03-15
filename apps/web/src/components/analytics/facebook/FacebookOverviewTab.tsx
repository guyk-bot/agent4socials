'use client';

import React, { useMemo } from 'react';
import { Users, Eye, FileText, Heart } from 'lucide-react';
import { AnalyticsGrid, AnalyticsGridItem } from '../AnalyticsGrid';
import { AnalyticsCard } from '../AnalyticsCard';
import { OverviewMetricCard } from '../OverviewMetricCard';
import { VisibilityMetricsCard } from '../VisibilityMetricsCard';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import {
  ComposedChart,
  Bar,
  Line,
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
      {/* Section 1 — Account Overview: 4 metric cards */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="followers"
            label="Followers"
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

      {/* Section 2 — Growth Analytics (span 8) + Visibility Metrics (span 4) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={8}>
          <AnalyticsWatermarkedChart title="Audience Growth" height={280}>
            <div className="w-full" style={{ height: 260 }}>
              {growthChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="followersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
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
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
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
                    <Bar yAxisId="right" dataKey="posts" name="Posts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="followers"
                      name="Followers"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No data for this period</div>
              )}
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
        <AnalyticsGridItem span={4}>
          <VisibilityMetricsCard title="Visibility Metrics" metrics={visibilityMetrics} />
        </AnalyticsGridItem>
      </AnalyticsGrid>

      {/* Section 4 + 5 — Engagement Over Time (span 6) + Content Activity (span 6) */}
      <AnalyticsGrid>
        <AnalyticsGridItem span={6}>
          <AnalyticsWatermarkedChart title="Engagement Over Time" height={280}>
            <div className="w-full" style={{ height: 260 }}>
              {engagementByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={engagementByDate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                    <Line type="monotone" dataKey="likes" name="Likes" stroke="#f43f5e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="comments" name="Comments" stroke="#a855f7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="shares" name="Shares" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No engagement data yet</div>
              )}
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
        <AnalyticsGridItem span={6}>
          <AnalyticsWatermarkedChart title="Publishing Activity" height={280}>
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
                    <Bar dataKey="value" name="Posts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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

      {showPermissionsNotice && onReconnect && (
        <AnalyticsGrid>
          <AnalyticsGridItem span={12}>
            <AnalyticsUpgradeCard
              title="More insights are available"
              description="Connect Facebook Page insights permissions to unlock follower trends, views, reach, and growth charts."
              ctaLabel="Reconnect account"
              onCta={onReconnect}
            />
          </AnalyticsGridItem>
        </AnalyticsGrid>
      )}
    </div>
  );
}
