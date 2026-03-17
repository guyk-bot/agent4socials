'use client';

import React, { useMemo } from 'react';
import { Users, Eye, FileText, Heart } from 'lucide-react';
import { AnalyticsGrid, AnalyticsGridItem } from './AnalyticsGrid';
import { AnalyticsCard } from './AnalyticsCard';
import { OverviewMetricCard } from './OverviewMetricCard';
import { VisibilityMetricsCard } from './VisibilityMetricsCard';
import { AnalyticsWatermarkedChart } from './AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from './AnalyticsUpgradeCard';
import {
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

export type PlatformId = 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'TWITTER' | 'LINKEDIN';

export interface PlatformPost {
  id: string;
  publishedAt: string;
  likeCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  interactions?: number;
  impressions?: number;
  content?: string | null;
  thumbnailUrl?: string | null;
}

export interface PlatformOverviewTabProps {
  platform: PlatformId | null;
  followers: number;
  reach: number;
  impressions: number;
  profileViews: number;
  pageViews: number;
  posts: PlatformPost[];
  dateRange: { start: string; end: string };
  followersTimeSeries: Array<{ date: string; value: number }>;
  loading: boolean;
  onUpgrade?: () => void;
  /** e.g. "Subscribers" for YouTube */
  followersLabel?: string;
}

function formatNull(value: number | undefined | null): string | number | null {
  if (value === undefined || value === null) return null;
  return value;
}

export function PlatformOverviewTab({
  platform,
  followers,
  reach,
  impressions,
  profileViews,
  pageViews,
  posts,
  dateRange,
  followersTimeSeries,
  loading,
  onUpgrade,
  followersLabel = 'Followers',
}: PlatformOverviewTabProps) {
  const start = dateRange.start ? new Date(dateRange.start) : null;
  const end = dateRange.end ? new Date(dateRange.end) : null;
  const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;
  const weeks = days ? days / 7 : 0;

  const totalInteractions = posts.reduce((s, p) => s + (p.interactions ?? 0), 0);
  const startValue = 0;
  const displayFollowersSeries = followersTimeSeries?.length
    ? followersTimeSeries
    : [{ date: dateRange.start || '', value: startValue }, { date: dateRange.end || '', value: followers }];

  const growthChartData = useMemo(() => {
    const dateSet = new Set(displayFollowersSeries.map((x) => x.date));
    const sorted = Array.from(dateSet).sort();
    let prevFollowers = followers;
    return sorted.map((date) => {
      const f = displayFollowersSeries.find((x) => x.date === date)?.value;
      if (f !== undefined) prevFollowers = f;
      return { date, followers: f ?? prevFollowers };
    });
  }, [displayFollowersSeries, followers]);

  const engagementByDate = useMemo(() => {
    const map: Record<string, { likes: number; comments: number; shares: number }> = {};
    posts.forEach((p) => {
      const d = String(p.publishedAt).slice(0, 10);
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
      const d = String(p.publishedAt).slice(0, 10);
      map[d] = (map[d] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  const visibilityMetrics = useMemo(() => {
    const max = Math.max(impressions || 0, reach || 0, pageViews || 0, 1);
    return [
      { label: 'Impressions', value: impressions || 0, percent: (impressions || 0) / max * 100 },
      { label: 'Reach', value: reach || 0, percent: (reach || 0) / max * 100 },
      { label: 'Profile Views', value: profileViews || 0, percent: (profileViews || 0) / max * 100 },
      { label: 'Page Visits', value: pageViews || 0, percent: (pageViews || 0) / max * 100 },
    ];
  }, [impressions, reach, pageViews, profileViews]);

  const showWatermark = days > 30;
  const followersChartShowYear = useMemo(() => {
    const dates = growthChartData.map((d) => d.date);
    if (dates.length <= 2) return true;
    const first = new Date(dates[0]);
    const last = new Date(dates[dates.length - 1]);
    return first.getMonth() === last.getMonth() && first.getDate() === last.getDate();
  }, [growthChartData]);

  const chartId = useMemo(() => `po-${Math.random().toString(36).slice(2, 9)}`, []);

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
          <AnalyticsGridItem span={12}><div className="h-72 rounded-2xl bg-neutral-100" /></AnalyticsGridItem>
        </AnalyticsGrid>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full" style={{ maxWidth: 1400 }}>
      {showWatermark && (
        <div className="rounded-xl border border-[#5ff6fd]/30 bg-gradient-to-r from-[#5ff6fd]/10 to-[#df44dc]/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={onUpgrade}
            className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#5ff6fd] to-[#df44dc] text-neutral-900 font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Upgrade plan
          </button>
          <p className="text-sm text-neutral-700">
            You're viewing more than 30 days. Upgrade to remove watermarks and view full history.
          </p>
        </div>
      )}
      <AnalyticsGrid>
        <AnalyticsGridItem span={3}>
          <OverviewMetricCard
            type="followers"
            label={followersLabel}
            value={formatNull(followers) ?? '—'}
            icon={<Users size={22} className="text-[#5ff6fd]" />}
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

      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsWatermarkedChart title={followersLabel} height={280} showWatermark={showWatermark}>
            <div className="w-full" style={{ height: 260 }}>
              {growthChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`${chartId}-followersGrad`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <RechartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length || !label) return null;
                        return (
                          <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                            <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                            <p className="font-medium mt-0.5">{followersLabel}: {typeof payload[0]?.value === 'number' ? payload[0].value.toLocaleString() : payload[0]?.value}</p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="followers"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill={`url(#${chartId}-followersGrad)`}
                      dot={false}
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

      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <VisibilityMetricsCard title="Visibility Metrics" metrics={visibilityMetrics} />
        </AnalyticsGridItem>
      </AnalyticsGrid>

      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsWatermarkedChart title="Engagement Over Time" height={280} showWatermark={showWatermark}>
            <div className="w-full" style={{ height: 260 }}>
              {engagementByDate.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={engagementByDate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`${chartId}-likesGrad`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#df44dc" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#df44dc" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id={`${chartId}-commentsGrad`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5ff6fd" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#5ff6fd" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id={`${chartId}-sharesGrad`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5ff6fd" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#5ff6fd" stopOpacity={0} />
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
                    <Area type="monotone" dataKey="likes" name="Likes" stroke="#df44dc" strokeWidth={2} fill={`url(#${chartId}-likesGrad)`} dot={false} isAnimationActive animationDuration={400} />
                    <Area type="monotone" dataKey="comments" name="Comments" stroke="#5ff6fd" strokeWidth={2} fill={`url(#${chartId}-commentsGrad)`} dot={false} isAnimationActive animationDuration={400} />
                    <Area type="monotone" dataKey="shares" name="Shares" stroke="#5ff6fd" strokeWidth={2} fill={`url(#${chartId}-sharesGrad)`} dot={false} isAnimationActive animationDuration={400} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No engagement data yet</div>
              )}
            </div>
          </AnalyticsWatermarkedChart>
        </AnalyticsGridItem>
      </AnalyticsGrid>

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
                        <span className="text-[#df44dc]">{(post.commentsCount ?? 0).toLocaleString()} comments</span>
                      </div>
                    </div>
                  </div>
                </AnalyticsCard>
              </AnalyticsGridItem>
            ))}
        </AnalyticsGrid>
      )}

      <AnalyticsGrid>
        <AnalyticsGridItem span={12}>
          <AnalyticsUpgradeCard
            title="Need shareable reports?"
            description="Upgrade to export analytics without watermark."
            ctaLabel="Upgrade plan"
            onCta={onUpgrade}
          />
        </AnalyticsGridItem>
      </AnalyticsGrid>
    </div>
  );
}
