'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronRight, ExternalLink, Gem, Info, MessageSquare, Star } from 'lucide-react';
import { AnalyticsDateRangePicker } from '../AnalyticsDateRangePicker';
import type { FacebookInsights, FacebookPost } from './types';
import { FACEBOOK_ANALYTICS_SECTION_IDS } from './facebook-analytics-section-ids';
import { localCalendarDateFromIso, toLocalCalendarDate } from '@/lib/calendar-date';

export { FACEBOOK_ANALYTICS_SECTION_IDS } from './facebook-analytics-section-ids';

export interface FacebookAnalyticsViewProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  insightsLoading: boolean;
  postsLoading: boolean;
  onUpgrade?: () => void;
  onSync?: () => void;
  onDateRangeChange?: (range: { start: string; end: string }) => void;
  /** Called when user taps "Reconnect Facebook" to refresh followers/views; opens connect flow. */
  onReconnectFacebook?: () => void;
  /** e.g. "Subscribers" for YouTube; defaults to "Followers" */
  followersLabel?: string;
  /** Connected account avatar from sidebar/account record. */
  accountAvatarUrl?: string | null;
}

type SectionId = (typeof FACEBOOK_ANALYTICS_SECTION_IDS)[keyof typeof FACEBOOK_ANALYTICS_SECTION_IDS];
type StoryMode = 'views' | 'engagement' | 'growth';
type StoryMetricKey = 'followers' | 'engagements' | 'videoViews' | 'contentViews' | 'pageVisits';
type ActivityPreset = 'publishing' | 'community';
type ActivityMetricKey = 'actions' | 'posts' | 'conversations';
type EngagementMetricKey = 'likes' | 'comments' | 'shares' | 'reposts';
type ContentHistoryFilter = 'all' | 'posts' | 'reels';

const COLOR = {
  pageBg: '#f6f7fb',
  section: '#ffffff',
  sectionAlt: '#f8fafc',
  card: '#ffffff',
  elevated: '#f8fafc',
  border: 'rgba(17,24,39,0.06)',
  text: '#111827',
  textSecondary: '#667085',
  textMuted: '#98a2b3',
  cyan: '#42d9f5',
  violet: '#7c6cff',
  magenta: '#d946ef',
  mint: '#31c48d',
  amber: '#f5b942',
  coral: '#ff8b7b',
};

type MetricDef = {
  key: string;
  label: string;
  section: 'overview' | 'traffic' | 'posts' | 'reels';
  source: string;
  color: string;
  formatter?: (n: number) => string;
};

const METRIC_MAP: MetricDef[] = [
  { key: 'page_media_view', label: 'Content Views', section: 'overview', source: 'page_media_view', color: COLOR.cyan },
  { key: 'page_views_total', label: 'Page Visits', section: 'overview', source: 'page_views_total', color: COLOR.cyan },
  { key: 'page_post_engagements', label: 'Engagements', section: 'overview', source: 'page_post_engagements', color: COLOR.violet },
  { key: 'page_video_views', label: 'Video Views', section: 'overview', source: 'page_video_views', color: COLOR.magenta },
  { key: 'page_video_view_time', label: 'Watch Time', section: 'reels', source: 'page_video_view_time', color: COLOR.magenta, formatter: formatDurationMs },
  { key: 'page_follows', label: 'Followers', section: 'overview', source: 'page_follows', color: COLOR.mint },
  { key: 'page_daily_follows', label: 'New followers', section: 'overview', source: 'page_daily_follows', color: COLOR.mint },
  { key: 'page_total_actions', label: 'Total Actions', section: 'traffic', source: 'page_total_actions', color: COLOR.amber },
  { key: 'page_posts_impressions', label: 'Post Impressions', section: 'traffic', source: 'page_posts_impressions', color: COLOR.cyan },
  { key: 'page_posts_impressions_nonviral', label: 'Non-viral Impressions', section: 'traffic', source: 'page_posts_impressions_nonviral', color: COLOR.violet },
  { key: 'page_posts_impressions_viral', label: 'Viral Impressions', section: 'traffic', source: 'page_posts_impressions_viral', color: COLOR.magenta },
  { key: 'post_media_view', label: 'Post Views', section: 'posts', source: 'post_media_view', color: COLOR.cyan },
  { key: 'post_impressions_unique', label: 'Unique Reach', section: 'posts', source: 'post_impressions_unique', color: COLOR.cyan },
  { key: 'post_video_views', label: 'Video Views', section: 'reels', source: 'post_video_views', color: COLOR.magenta },
  { key: 'post_video_views_organic', label: 'Organic Video Views', section: 'reels', source: 'post_video_views_organic', color: COLOR.mint },
  { key: 'post_video_avg_time_watched', label: 'Avg Watch Time', section: 'reels', source: 'post_video_avg_time_watched', color: COLOR.magenta, formatter: formatDurationMs },
  { key: 'post_clicks', label: 'Post Clicks', section: 'posts', source: 'post_clicks', color: COLOR.amber },
  { key: 'post_reactions_like_total', label: 'Likes', section: 'posts', source: 'post_reactions_like_total', color: COLOR.violet },
  { key: 'post_reactions_by_type_total', label: 'Reactions Breakdown', section: 'posts', source: 'post_reactions_by_type_total', color: COLOR.violet },
];

const STORY_METRIC_CONFIG: Record<StoryMetricKey, { label: string; color: string; mode: StoryMode }> = {
  followers: { label: 'Followers', color: COLOR.mint, mode: 'growth' },
  engagements: { label: 'Engagements', color: COLOR.violet, mode: 'engagement' },
  videoViews: { label: 'Video Views', color: COLOR.magenta, mode: 'views' },
  contentViews: { label: 'Content Views', color: COLOR.amber, mode: 'views' },
  pageVisits: { label: 'Page Visits', color: '#d72661', mode: 'views' },
};

const STORY_MODE_DEFAULT_METRICS: Record<StoryMode, StoryMetricKey[]> = {
  growth: ['followers'],
  engagement: ['engagements'],
  views: ['videoViews', 'contentViews', 'pageVisits'],
};

const ACTIVITY_METRIC_CONFIG: Record<ActivityMetricKey, { label: string; color: string }> = {
  actions: { label: 'Actions', color: COLOR.violet },
  posts: { label: 'Posts', color: COLOR.magenta },
  conversations: { label: 'Conversations', color: '#d72661' },
};

const ENGAGEMENT_METRIC_CONFIG: Record<EngagementMetricKey, { label: string; color: string }> = {
  likes: { label: 'Likes', color: COLOR.violet },
  comments: { label: 'Comments', color: COLOR.coral },
  shares: { label: 'Shares', color: COLOR.amber },
  reposts: { label: 'Reposts', color: '#111827' },
};

const ACTIVITY_PRESET_DEFAULTS: Record<ActivityPreset, ActivityMetricKey[]> = {
  publishing: ['posts', 'actions'],
  community: ['conversations', 'actions'],
};

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Intl.NumberFormat().format(Math.round(n));
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`;
}

function formatShortDate(date: string): string {
  try {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return date;
  }
}

function formatSparseMonthTick(date: string, index: number, allDates: string[]): string {
  try {
    const d = new Date(`${date}T12:00:00Z`);
    const day = d.getDate();
    const month = d.toLocaleDateString(undefined, { month: 'short' });
    if (index <= 0) return `${month} ${day}`;
    const prev = allDates[index - 1];
    if (!prev) return `${month} ${day}`;
    const pd = new Date(`${prev}T12:00:00Z`);
    const changedMonth = d.getMonth() !== pd.getMonth() || d.getFullYear() !== pd.getFullYear();
    return changedMonth ? `${month} ${day}` : String(day);
  } catch {
    return date;
  }
}

function buildKeyDateTicks<T extends { date: string }>(
  rows: T[],
  isEvent: (row: T) => boolean,
  maxTicks = 10
): string[] {
  if (!rows.length) return [];
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  const monthStartDates: string[] = [];
  let prevMonth = '';
  for (const r of rows) {
    const monthKey = r.date.slice(0, 7);
    if (monthKey !== prevMonth) {
      monthStartDates.push(r.date);
      prevMonth = monthKey;
    }
  }

  const eventDates = rows.filter(isEvent).map((r) => r.date);
  const combined = Array.from(new Set([first, ...monthStartDates, ...eventDates, last]));

  if (combined.length <= maxTicks) return combined;

  // Evenly sample while keeping first/last.
  const sampled: string[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const idx = Math.round((i / Math.max(1, maxTicks - 1)) * (combined.length - 1));
    sampled.push(combined[idx]);
  }
  return Array.from(new Set(sampled));
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

function clampText(v: string | null | undefined, max = 120): string {
  if (!v) return '';
  const one = v.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function firstWords(v: string | null | undefined, words = 3): string {
  const one = (v ?? '').replace(/\s+/g, ' ').trim();
  if (!one) return '';
  const parts = one.split(' ').filter(Boolean);
  return parts.slice(0, words).join(' ');
}

function parseReactionTotal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).reduce<number>((s, cur) => s + (typeof cur === 'number' ? cur : 0), 0);
  }
  return 0;
}

function inRange(dateIso: string, start: string, end: string): boolean {
  const d = localCalendarDateFromIso(dateIso);
  if (!d) return false;
  return d >= start && d <= end;
}

function isReelPost(p: FacebookPost): boolean {
  const url = (p.permalinkUrl ?? '').toLowerCase();
  if (url.includes('/reel/')) return true;
  // Some Facebook video posts do not use /reel/ permalink but still expose reel/video metrics.
  if (typeof p.facebookInsights?.post_video_views === 'number') return true;
  if (typeof p.facebookInsights?.post_video_avg_time_watched === 'number') return true;
  return (p.mediaType ?? '').toUpperCase() === 'VIDEO';
}

/** Plays Meta reports per post; UI often shows one metric, API may return the other. */
function bestPostPlayCount(p: FacebookPost): number {
  const fi = p.facebookInsights ?? {};
  const pv = typeof fi.post_video_views === 'number' ? fi.post_video_views : 0;
  const pm = typeof fi.post_media_view === 'number' ? fi.post_media_view : 0;
  if (pv > 0 || pm > 0) return Math.max(pv, pm);
  return typeof fi.post_media_view === 'number'
    ? fi.post_media_view
    : typeof p.impressions === 'number'
      ? p.impressions
      : 0;
}

function isVideoishPost(p: FacebookPost): boolean {
  return isReelPost(p) || (p.mediaType ?? '').toUpperCase() === 'VIDEO' || typeof p.facebookInsights?.post_video_views === 'number';
}

/** Sum of reel/video post plays in range; Page `page_video_views` often disagrees with what you see on each reel. */
function sumPostLevelVideoPlays(posts: FacebookPost[]): number {
  return posts.reduce((s, p) => {
    if (!isVideoishPost(p)) return s;
    const fi = p.facebookInsights ?? {};
    const pv = typeof fi.post_video_views === 'number' ? fi.post_video_views : 0;
    const pm = typeof fi.post_media_view === 'number' ? fi.post_media_view : 0;
    const plays = Math.max(pv, pm);
    return s + plays;
  }, 0);
}

function seriesToMap(series: Array<{ date: string; value: number }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of series) map[p.date] = p.value;
  return map;
}

function carryForwardSeries(
  dates: string[],
  map: Record<string, number>,
  fallback = 0
): Record<string, number> {
  const out: Record<string, number> = {};
  let prev = fallback;
  for (const d of dates) {
    if (typeof map[d] === 'number') prev = map[d];
    out[d] = prev;
  }
  return out;
}

function percentChangeFromSeries(series?: Array<{ date: string; value: number }>): number | null {
  if (!series || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.value ?? 0;
  const last = sorted[sorted.length - 1]?.value ?? 0;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  // Always return a usable % for the selected timeline, even from zero baseline.
  if (first === 0) return last === 0 ? 0 : 100;
  return ((last - first) / Math.abs(first)) * 100;
}

function buildDateAxis(start: string, end: string): string[] {
  const out: string[] = [];
  const n = (s: string) => s.split('-').map(Number);
  const [ys, ms, ds] = n(start);
  const [ye, me, de] = n(end);
  if (!ys || !ms || !ds || !ye || !me || !de) return out;
  let cur = new Date(ys, ms - 1, ds);
  const last = new Date(ye, me - 1, de);
  if (cur > last) return out;
  while (cur <= last) {
    out.push(toLocalCalendarDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function MetricTooltip({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium tracking-tight" style={{ color: COLOR.textMuted }}>
      <span>{label}</span>
      <span className="inline-flex items-center" title={hint}>
        <Info size={12} />
      </span>
    </span>
  );
}

export function EmptyStateCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="rounded-[20px] border p-6 text-center"
      style={{ background: COLOR.card, borderColor: COLOR.border }}
    >
      <p className="text-sm font-medium" style={{ color: COLOR.text }}>{title}</p>
      <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>{subtitle}</p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  source,
  color,
  footnote,
  trendPercent,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  source: string;
  color: string;
  footnote?: string;
  trendPercent?: number | null;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] p-3 text-left transition-all hover:-translate-y-[1px]"
      style={{
        background: active ? `${color}10` : COLOR.card,
        boxShadow: active ? `0 0 0 1px ${color}55, 0 2px 16px rgba(15,23,42,0.06)` : '0 2px 16px rgba(15,23,42,0.05)',
      }}
    >
      <MetricTooltip label={label} hint={`Source metric: ${source}${typeof trendPercent === 'number' && Number.isFinite(trendPercent) ? `. Change in selected range: ${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%.` : ""}`} />
      <p className="mt-1.5 text-[28px] font-semibold tracking-tight" style={{ color }}>{value}</p>
      {footnote ? <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>{footnote}</p> : null}
    </button>
  );
}

export function SparklineMetricCard(props: {
  label: string;
  source: string;
  color: string;
  value: string;
  series: Array<{ date: string; value: number }>;
  footnote?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const { label, source, color, value, series, footnote, active, onClick } = props;
  const trendPercent = percentChangeFromSeries(series);
  return <MetricCard label={label} source={source} color={color} value={value} footnote={footnote} trendPercent={trendPercent} active={active} onClick={onClick} />;
}

export function InsightChartCard({
  title,
  subtitle,
  legend,
  children,
  hideHeader = false,
  flat = false,
}: {
  title: string;
  subtitle?: string;
  legend?: Array<{ label: string; color: string }>;
  children: React.ReactNode;
  hideHeader?: boolean;
  flat?: boolean;
}) {
  return (
    <div
      className={flat ? '' : 'rounded-[20px] p-5'}
      style={flat ? { background: COLOR.card } : { background: COLOR.card, boxShadow: '0 2px 20px rgba(15,23,42,0.06)' }}
    >
      {!hideHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>{title}</h3>
            {subtitle ? <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>{subtitle}</p> : null}
          </div>
          {legend?.length ? (
            <div className="flex flex-wrap gap-2">
              {legend.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`${hideHeader ? '' : 'mt-3 '}h-[300px] pb-5 relative`}>
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <span className="absolute left-[16%] top-[20%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute right-[16%] top-[20%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute left-[16%] bottom-[18%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute right-[16%] bottom-[18%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
        </div>
        <div className="relative z-[1] h-full">{children}</div>
      </div>
    </div>
  );
}

export function StackedTrafficChart({ data }: { data: Array<{ date: string; nonviral: number; viral: number }> }) {
  const trafficTicks = buildKeyDateTicks(data, (d) => (d.nonviral ?? 0) > 0 || (d.viral ?? 0) > 0, 10);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="date" ticks={trafficTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} minTickGap={18} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
          formatter={(v: number | string | undefined, n?: string) => [formatNumber(Number(v) || 0), n === 'nonviral' ? 'Non-viral' : 'Viral']}
          labelFormatter={(l) => formatShortDate(String(l))}
        />
        <Bar dataKey="nonviral" stackId="a" fill={COLOR.violet} radius={[6, 6, 0, 0]} />
        <Bar dataKey="viral" stackId="a" fill={COLOR.magenta} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopPostsGrid({
  title,
  items,
  metricLabel,
  metricColor,
}: {
  title: string;
  items: Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; value: number }>;
  metricLabel: string;
  metricColor: string;
}) {
  return (
    <div className="rounded-[20px] p-4" style={{ background: COLOR.card, boxShadow: '0 2px 14px rgba(15,23,42,0.05)' }}>
      <h4 className="text-sm font-semibold" style={{ color: COLOR.text }}>{title}</h4>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: COLOR.textMuted }}>No ranked posts in range</p>
        ) : (
          items.map((p, idx) => (
            <div key={`${p.id}-${idx}`} className="rounded-xl p-3" style={{ background: COLOR.elevated }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="h-9 w-9 rounded-md object-cover shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-md shrink-0" style={{ background: 'rgba(124,108,255,0.12)' }} />
                  )}
                  <p className="text-sm leading-5 min-w-0" style={{ color: COLOR.textSecondary }}>
                    <span className="mr-2 rounded-md px-2 py-0.5 text-xs" style={{ color: COLOR.text, background: 'rgba(124,108,255,0.14)' }}>#{idx + 1}</span>
                    {clampText(firstWords(p.content, 3) || 'View post', 76)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold" style={{ color: metricColor }}>{formatCompact(p.value)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span style={{ color: COLOR.textMuted }}>{metricLabel}</span>
                {p.permalinkUrl ? (
                  <Link href={p.permalinkUrl} target="_blank" className="inline-flex items-center gap-1" style={{ color: COLOR.textSecondary }}>
                    Open <ExternalLink size={12} />
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CommunitySummaryCard({
  conversationsCount,
  latestConversationAt,
  ratingsCount,
  latestRecommendationText,
}: {
  conversationsCount: number;
  latestConversationAt: string | null;
  ratingsCount: number;
  latestRecommendationText: string | null;
}) {
  return (
    <div className="rounded-[20px] p-5" style={{ background: COLOR.sectionAlt }}>
      <h3 className="text-base font-semibold" style={{ color: COLOR.text }}>Community and Reputation</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl p-4" style={{ background: COLOR.card }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: COLOR.textMuted }}><MessageSquare size={12} className="inline mr-1" /> Conversations</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLOR.text }}>{formatNumber(conversationsCount)}</p>
          {latestConversationAt ? (
            <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>
              {`Latest activity: ${new Date(latestConversationAt).toLocaleString()}`}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl p-4" style={{ background: COLOR.card }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: COLOR.textMuted }}><Star size={12} className="inline mr-1" /> Ratings</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLOR.text }}>{formatNumber(ratingsCount)}</p>
          {latestRecommendationText ? (
            <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>
              {clampText(latestRecommendationText, 96)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PostsPerformanceTable({
  rows,
  onOpenDetail,
}: {
  rows: Array<{
    id: string;
    date: string;
    type: 'Reel' | 'Post';
    preview: string;
    permalink?: string | null;
    views: number;
    uniqueReach: number;
    clicks: number;
    likes: number;
    reactionsTotal: number;
    watchTimeMs: number;
    reactionBreakdownRaw: unknown;
    status: 'Ready' | 'Partial';
    rawPost: FacebookPost;
  }>;
  onOpenDetail: (p: FacebookPost) => void;
}) {
  return (
    <div className="rounded-[20px] overflow-hidden" style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.06)' }}>
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.02)', color: COLOR.textMuted }}>
            <tr>
              {['Post preview', 'Publish date', 'Type', 'Views', 'Unique reach', 'Clicks', 'Likes', 'Reactions', 'Watch time', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t cursor-pointer hover:bg-[#f8fafc]" style={{ borderColor: COLOR.border }} onClick={() => onOpenDetail(r.rawPost)}>
                <td className="px-4 py-3" style={{ color: COLOR.textSecondary }}>{clampText(r.preview, 66)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.textSecondary }}>{new Date(r.date).toLocaleDateString()}</td>
                <td className="px-4 py-3"><span className="rounded-full px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.08)', color: COLOR.text }}>{r.type}</span></td>
                <td className="px-4 py-3" style={{ color: COLOR.text }}>{formatCompact(r.views)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.text }}>{formatCompact(r.uniqueReach)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.text }}>{formatCompact(r.clicks)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.text }}>{formatCompact(r.likes)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.text }}>{formatCompact(r.reactionsTotal)}</td>
                <td className="px-4 py-3" style={{ color: COLOR.textSecondary }}>{r.watchTimeMs > 0 ? formatDurationMs(r.watchTimeMs) : ' - '}</td>
                <td className="px-4 py-3"><span className="rounded-full px-2 py-1 text-xs" style={{ background: r.status === 'Ready' ? 'rgba(94,230,168,0.2)' : 'rgba(247,198,106,0.2)', color: r.status === 'Ready' ? COLOR.mint : COLOR.amber }}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-3 p-4">
        {rows.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => onOpenDetail(r.rawPost)}
            className="w-full rounded-xl border p-3 text-left"
            style={{ borderColor: COLOR.border, background: 'rgba(255,255,255,0.015)' }}
          >
            <p className="text-sm" style={{ color: COLOR.text }}>{clampText(r.preview, 80)}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: COLOR.textSecondary }}>
              <span>{new Date(r.date).toLocaleDateString()}</span>
              <span>{r.type}</span>
              <span>Views {formatCompact(r.views)}</span>
              <span>{r.watchTimeMs > 0 ? `Watch ${formatDurationMs(r.watchTimeMs)}` : 'Watch -'}</span>
              <span>Clicks {formatCompact(r.clicks)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopContentHighlights({
  byViews,
  byClicks,
  byReactions,
}: {
  byViews: Array<{ id: string; preview: string; permalink?: string | null; value: number; type: 'Reel' | 'Post' }>;
  byClicks: Array<{ id: string; preview: string; permalink?: string | null; value: number; type: 'Reel' | 'Post' }>;
  byReactions: Array<{ id: string; preview: string; permalink?: string | null; value: number; type: 'Reel' | 'Post' }>;
}) {
  const col = (
    title: string,
    metricLabel: string,
    color: string,
    rows: Array<{ id: string; preview: string; permalink?: string | null; value: number; type: 'Reel' | 'Post' }>
  ) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold" style={{ color: COLOR.text }}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: COLOR.textMuted }}>No items yet</p>
      ) : (
        rows.map((r, idx) => (
          <div key={`${title}-${r.id}-${idx}`} className="rounded-xl p-3" style={{ background: COLOR.elevated }}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm min-w-0" style={{ color: COLOR.textSecondary }}>
                <span className="mr-2 rounded-md px-2 py-0.5 text-xs" style={{ color: COLOR.text, background: 'rgba(124,108,255,0.14)' }}>#{idx + 1}</span>
                {clampText(firstWords(r.preview, 8) || 'View post', 66)}
              </p>
              <span className="shrink-0 text-sm font-semibold" style={{ color }}>{formatCompact(r.value)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs" style={{ color: COLOR.textMuted }}>
              <span>{metricLabel}</span>
              <span>{r.type}</span>
              {r.permalink ? (
                <Link href={r.permalink} target="_blank" className="inline-flex items-center gap-1" style={{ color: COLOR.textSecondary }}>
                  View <ExternalLink size={12} />
                </Link>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <section className="rounded-[20px] p-5" style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
      <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Top Content Highlights</h3>
      <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
        One editorial block showing what led in views, clicks, and reactions.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {col('Views leaders', 'Views', COLOR.cyan, byViews)}
        {col('Clicks leaders', 'Clicks', COLOR.amber, byClicks)}
        {col('Reactions leaders', 'Reactions', COLOR.violet, byReactions)}
      </div>
    </section>
  );
}

export function ReelsPerformanceGrid({
  reels,
}: {
  reels: Array<{ post: FacebookPost; views: number; organicViews: number; avgWatchMs: number }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reels.map(({ post, views, organicViews, avgWatchMs }) => (
        <div key={post.id} className="rounded-[20px] p-4" style={{ background: COLOR.card, boxShadow: '0 2px 14px rgba(15,23,42,0.06)' }}>
          <p className="text-sm font-medium" style={{ color: COLOR.text }}>{clampText(post.content || 'Untitled reel', 90)}</p>
          <p className="mt-1 text-xs" style={{ color: COLOR.textMuted }}>{new Date(post.publishedAt).toLocaleDateString()}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg p-2" style={{ background: 'rgba(95,246,253,0.09)', color: COLOR.cyan }}>Views<br /><span className="text-sm font-semibold">{formatCompact(views)}</span></div>
            <div className="rounded-lg p-2" style={{ background: 'rgba(94,230,168,0.09)', color: COLOR.mint }}>Organic<br /><span className="text-sm font-semibold">{formatCompact(organicViews)}</span></div>
            <div className="rounded-lg p-2" style={{ background: 'rgba(223,68,220,0.09)', color: COLOR.magenta }}>Avg watch<br /><span className="text-sm font-semibold">{formatDurationMs(avgWatchMs)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StickySectionNav({
  sections,
  activeSection,
}: {
  sections: Array<{ id: SectionId; label: string }>;
  activeSection: SectionId;
}) {
  return (
    <nav
      className="sticky z-30 rounded-2xl px-2 py-2 backdrop-blur-[10px]"
      style={{ top: 72, background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 10px rgba(15,23,42,0.06)' }}
      aria-label="Facebook analytics sections"
    >
      <div className="flex flex-wrap gap-2">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
            style={{
              color: COLOR.textSecondary,
              background: 'transparent',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = COLOR.text;
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,108,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(124,108,255,0.14)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = COLOR.textSecondary;
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.border = '1px solid transparent';
            }}
          >
            {sec.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function FacebookAnalyticsView({
  insights,
  posts,
  dateRange,
  insightsLoading,
  postsLoading,
  onUpgrade,
  onSync,
  onDateRangeChange,
  onReconnectFacebook,
  followersLabel,
  accountAvatarUrl,
}: FacebookAnalyticsViewProps) {
  /** Do not tie overview shell to post sync: posts load slower; show metrics immediately and refresh tables in place. */
  const overviewSkeleton = insightsLoading && !insights?.facebookAnalytics;
  const [storyMode, setStoryMode] = useState<StoryMode>('growth');
  const [selectedStoryMetrics, setSelectedStoryMetrics] = useState<StoryMetricKey[]>(STORY_MODE_DEFAULT_METRICS.growth);
  const [activityPreset, setActivityPreset] = useState<ActivityPreset>('publishing');
  const [selectedActivityMetrics, setSelectedActivityMetrics] = useState<ActivityMetricKey[]>(ACTIVITY_PRESET_DEFAULTS.publishing);
  const [selectedEngagementMetrics, setSelectedEngagementMetrics] = useState<EngagementMetricKey[]>(['likes', 'comments', 'shares', 'reposts']);
  const [activeSection, setActiveSection] = useState<SectionId>(FACEBOOK_ANALYTICS_SECTION_IDS.overview);
  const [selectedPost, setSelectedPost] = useState<FacebookPost | null>(null);
  const [historyFilter, setHistoryFilter] = useState<ContentHistoryFilter>('all');
  const sections = useMemo(
    () => [
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.overview, label: 'Overview' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.traffic, label: 'Traffic' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.posts, label: 'Posts' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.reels, label: 'Reels' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.history, label: 'History' },
    ],
    []
  );

  useEffect(() => {
    const ids = sections.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id && ids.includes(visible.target.id as SectionId)) {
          setActiveSection(visible.target.id as SectionId);
        }
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0.15, 0.45, 0.75] }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    setSelectedStoryMetrics(STORY_MODE_DEFAULT_METRICS[storyMode]);
  }, [storyMode]);

  useEffect(() => {
    setSelectedActivityMetrics(ACTIVITY_PRESET_DEFAULTS[activityPreset]);
  }, [activityPreset]);

  const bundle = insights?.facebookAnalytics;
  const profile = insights?.facebookPageProfile;
  const community = insights?.facebookCommunity;
  const profileUrl = useMemo(() => {
    const username = profile?.username?.trim();
    if (username) return `https://www.facebook.com/${username}`;
    const website = profile?.website?.trim();
    if (website) return website;
    return null;
  }, [profile?.username, profile?.website]);
  const postsInRange = useMemo(
    () => posts.filter((p) => inRange(p.publishedAt, dateRange.start, dateRange.end)),
    [posts, dateRange.end, dateRange.start]
  );
  const dateAxis = useMemo(() => buildDateAxis(dateRange.start, dateRange.end), [dateRange.end, dateRange.start]);
  const series = bundle?.series;
  const totalFollowers = profile?.followers_count ?? profile?.fan_count ?? insights?.followers ?? 0;
  const liveConversationCount =
    ((insights as unknown as { facebookLiveConversationsCount?: number })?.facebookLiveConversationsCount ?? 0);
  const liveConversationDates =
    ((insights as unknown as { facebookLiveConversationDates?: string[] })?.facebookLiveConversationDates ?? []);
  const conversationActivityCount = Math.max(community?.conversationsCount ?? 0, liveConversationCount);
  const isCardSelected = (metric: StoryMetricKey): boolean => selectedStoryMetrics.includes(metric);
  const toggleStoryMetric = (metric: StoryMetricKey) => {
    setSelectedStoryMetrics((prev) => {
      if (prev.includes(metric)) {
        return prev.filter((m) => m !== metric);
      }
      return [...prev, metric];
    });
  };
  const newFollowers = bundle?.totals.dailyFollows ?? 0;
  const contentViews = bundle?.totals.contentViews ?? 0;
  const pageVisits = bundle?.totals.pageTabViews ?? 0;
  const engagements = bundle?.totals.engagement ?? 0;
  const actionsSeries = (bundle?.series.totalActions?.length ?? 0) > 0 ? bundle?.series.totalActions : (bundle?.series.engagement ?? []);
  const actionsTotal = (bundle?.totals.totalActions ?? 0) > 0 ? (bundle?.totals.totalActions ?? 0) : engagements;
  const pageVideoViews = bundle?.totals.videoViews ?? 0;
  const postVideoPlaysInRange = useMemo(() => sumPostLevelVideoPlays(postsInRange), [postsInRange]);
  const videoViews = Math.max(pageVideoViews, postVideoPlaysInRange);
  const postImpressions = bundle?.totals.postImpressions ?? 0;
  const nonviralImpressions = bundle?.totals.postImpressionsNonviral ?? 0;
  const viralImpressions = bundle?.totals.postImpressionsViral ?? 0;
  const uniqueReachProxy = postsInRange.reduce((s, p) => s + (p.facebookInsights?.post_impressions_unique ?? 0), 0);

  const chartByMode = useMemo(() => {
    const mediaRaw = seriesToMap(series?.contentViews ?? []);
    const visitsRaw = seriesToMap(series?.pageTabViews ?? []);
    const videoViewsRaw = seriesToMap(series?.videoViews ?? []);
    const engagementRaw = seriesToMap(series?.engagement ?? []);
    const followsRaw = seriesToMap(series?.follows ?? []);
    const media = carryForwardSeries(dateAxis, mediaRaw, 0);
    const visits = carryForwardSeries(dateAxis, visitsRaw, 0);
    const videoViewsSeries = carryForwardSeries(dateAxis, videoViewsRaw, 0);
    const engagement = carryForwardSeries(dateAxis, engagementRaw, 0);
    const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers);
    return dateAxis.map((date) => ({
      date,
      followers: follows[date] ?? 0,
      engagements: engagement[date] ?? 0,
      videoViews: videoViewsSeries[date] ?? 0,
      contentViews: media[date] ?? 0,
      pageVisits: visits[date] ?? 0,
    }));
  }, [dateAxis, series?.contentViews, series?.engagement, series?.follows, series?.pageTabViews, series?.videoViews, totalFollowers]);

  const stackedTraffic = useMemo(() => {
    const nonviral = seriesToMap(series?.postImpressionsNonviral ?? []);
    const viral = seriesToMap(series?.postImpressionsViral ?? []);
    return dateAxis.map((date) => ({ date, nonviral: nonviral[date] ?? 0, viral: viral[date] ?? 0 }));
  }, [dateAxis, series?.postImpressionsNonviral, series?.postImpressionsViral]);

  const viewVsVisit = useMemo(() => {
    const media = seriesToMap(series?.contentViews ?? []);
    const visits = seriesToMap(series?.pageTabViews ?? []);
    return dateAxis.map((date) => ({ date, views: media[date] ?? 0, visits: visits[date] ?? 0 }));
  }, [dateAxis, series?.contentViews, series?.pageTabViews]);

  const postsRows = useMemo(() => {
    return postsInRange.map((p) => {
      const fi = p.facebookInsights ?? {};
      const reactions = parseReactionTotal(fi.post_reactions_by_type_total);
      const isReel = isReelPost(p);
      const hasCore = typeof fi.post_media_view === 'number' || typeof fi.post_impressions_unique === 'number';
      return {
        id: p.id,
        date: p.publishedAt,
        type: isReel ? ('Reel' as const) : ('Post' as const),
        preview: p.content ?? '',
        permalink: p.permalinkUrl,
        views: bestPostPlayCount(p),
        uniqueReach: fi.post_impressions_unique ?? 0,
        clicks: fi.post_clicks ?? 0,
        likes: fi.post_reactions_like_total ?? p.likeCount ?? 0,
        reactionsTotal: reactions || (fi.post_reactions_like_total ?? p.likeCount ?? 0),
        watchTimeMs: fi.post_video_avg_time_watched ?? 0,
        reactionBreakdownRaw: fi.post_reactions_by_type_total,
        status: hasCore ? ('Ready' as const) : ('Partial' as const),
        rawPost: p,
      };
    });
  }, [postsInRange]);

  const reelsRows = useMemo(() => {
    return postsRows
      .filter((r) => r.type === 'Reel')
      .map((r) => ({
        post: r.rawPost,
        views: bestPostPlayCount(r.rawPost),
        organicViews: r.rawPost.facebookInsights?.post_video_views_organic ?? 0,
        avgWatchMs: r.rawPost.facebookInsights?.post_video_avg_time_watched ?? 0,
      }));
  }, [postsRows]);

  const reelsChartData = useMemo(() => {
    return reelsRows.map((r) => ({
      date: r.post.publishedAt.slice(0, 10),
      views: r.views,
      watchSeconds: r.avgWatchMs / 1000,
    }));
  }, [reelsRows]);

  const storyTicks = useMemo(
    () => buildKeyDateTicks(chartByMode, (d) => selectedStoryMetrics.some((metric) => (d[metric] ?? 0) > 0), 10),
    [chartByMode, selectedStoryMetrics]
  );
  const trafficTicks = useMemo(
    () => buildKeyDateTicks(stackedTraffic, (d) => (d.nonviral ?? 0) > 0 || (d.viral ?? 0) > 0, 10),
    [stackedTraffic]
  );
  const viewVisitTicks = useMemo(
    () => buildKeyDateTicks(viewVsVisit, (d) => (d.views ?? 0) > 0 || (d.visits ?? 0) > 0, 10),
    [viewVsVisit]
  );
  const reelsTicks = useMemo(
    () => buildKeyDateTicks(reelsChartData, (d) => (d.views ?? 0) > 0 || (d.watchSeconds ?? 0) > 0, 10),
    [reelsChartData]
  );

  const avgPostsPerWeek = postsInRange.length / Math.max(1, dateAxis.length / 7);
  const avgClicksPerPost = postsRows.reduce((s, r) => s + r.clicks, 0) / Math.max(1, postsRows.length);
  const avgReactionsPerPost = postsRows.reduce((s, r) => s + r.reactionsTotal, 0) / Math.max(1, postsRows.length);
  const engagementRate = engagements / Math.max(1, postImpressions);
  const videoViewRate = videoViews / Math.max(1, contentViews);
  const viralShare = viralImpressions / Math.max(1, postImpressions);
  const avgWatchMs = reelsRows.reduce((s, r) => s + r.avgWatchMs, 0) / Math.max(1, reelsRows.length);
  const totalOrganicVideoViews = reelsRows.reduce((s, r) => s + r.organicViews, 0);
  const totalReelVideoViews = reelsRows.reduce((s, r) => s + r.views, 0);
  const viewToClickEfficiency =
    reelsRows.reduce((s, r) => s + (r.post.facebookInsights?.post_clicks ?? 0), 0) / Math.max(1, totalReelVideoViews);
  const storyModeHoverHint = useMemo(() => {
    const fmt = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'n/a');
    return {
      growth: `Followers: ${fmt(percentChangeFromSeries(series?.follows ?? []))}`,
      engagement: `Engagements: ${fmt(percentChangeFromSeries(series?.engagement ?? []))}`,
      views: `Video Views: ${fmt(percentChangeFromSeries(series?.videoViews ?? []))} | Content Views: ${fmt(percentChangeFromSeries(series?.contentViews ?? []))} | Page Visits: ${fmt(percentChangeFromSeries(series?.pageTabViews ?? []))}`,
    } as const;
  }, [series?.contentViews, series?.engagement, series?.follows, series?.pageTabViews, series?.videoViews]);
  const likesTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_reactions_like_total ?? post.likeCount ?? 0), 0), [postsInRange]);
  const commentsTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_comments ?? 0), 0), [postsInRange]);
  const sharesTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_shares ?? 0), 0), [postsInRange]);
  const repostsTotal = sharesTotal;
  const totalActions = actionsTotal;
  const engagementData = useMemo(() => {
    const likesByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + (post.facebookInsights?.post_reactions_like_total ?? post.likeCount ?? 0);
      return acc;
    }, {});
    const commentsByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + (post.facebookInsights?.post_comments ?? 0);
      return acc;
    }, {});
    const sharesByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + (post.facebookInsights?.post_shares ?? 0);
      return acc;
    }, {});
    return dateAxis.map((date) => ({
      date,
      likes: likesByDate[date] ?? 0,
      comments: commentsByDate[date] ?? 0,
      shares: sharesByDate[date] ?? 0,
      reposts: sharesByDate[date] ?? 0,
    }));
  }, [dateAxis, postsInRange]);
  const engagementTicks = useMemo(
    () => buildKeyDateTicks(engagementData, (d) => (d.likes ?? 0) > 0 || (d.comments ?? 0) > 0 || (d.shares ?? 0) > 0 || (d.reposts ?? 0) > 0, 10),
    [engagementData]
  );
  const operationalData = useMemo(() => {
    const actionsRaw = seriesToMap(actionsSeries ?? []);
    const actions = carryForwardSeries(dateAxis, actionsRaw, 0);
    const hasActionPoints = Object.keys(actionsRaw).length > 0;
    const postsByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});
    const conversationsByDate = liveConversationDates.reduce<Record<string, number>>((acc, d) => {
      const key = String(d).slice(0, 10);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return dateAxis.map((date) => ({
      date,
      actions: hasActionPoints ? (actions[date] ?? 0) : (date === (dateAxis[dateAxis.length - 1] ?? '') ? totalActions : 0),
      posts: postsByDate[date] ?? 0,
      conversations: conversationsByDate[date] ?? 0,
    }));
  }, [actionsSeries, dateAxis, liveConversationDates, postsInRange, totalActions]);
  const operationalTicks = useMemo(
    () => buildKeyDateTicks(operationalData, (d) => (d.actions ?? 0) > 0 || (d.posts ?? 0) > 0 || (d.conversations ?? 0) > 0, 10),
    [operationalData]
  );

  const topByViews = [...postsRows].sort((a, b) => b.views - a.views).slice(0, 3).map((p) => ({ ...p, value: p.views, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const topByClicks = [...postsRows].sort((a, b) => b.clicks - a.clicks).slice(0, 3).map((p) => ({ ...p, value: p.clicks, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const topByReactions = [...postsRows].sort((a, b) => b.reactionsTotal - a.reactionsTotal).slice(0, 3).map((p) => ({ ...p, value: p.reactionsTotal, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const allPostsRows = useMemo(() => {
    return posts.map((p) => {
      const fi = p.facebookInsights ?? {};
      const reactions = parseReactionTotal(fi.post_reactions_by_type_total);
      const isReel = isReelPost(p);
      const hasCore = typeof fi.post_media_view === 'number' || typeof fi.post_impressions_unique === 'number';
      return {
        id: p.id,
        date: p.publishedAt,
        type: isReel ? ('Reel' as const) : ('Post' as const),
        preview: p.content ?? '',
        permalink: p.permalinkUrl,
        views: bestPostPlayCount(p),
        uniqueReach: fi.post_impressions_unique ?? 0,
        clicks: fi.post_clicks ?? 0,
        likes: fi.post_reactions_like_total ?? p.likeCount ?? 0,
        reactionsTotal: reactions || (fi.post_reactions_like_total ?? p.likeCount ?? 0),
        watchTimeMs: fi.post_video_avg_time_watched ?? 0,
        reactionBreakdownRaw: fi.post_reactions_by_type_total,
        status: hasCore ? ('Ready' as const) : ('Partial' as const),
        rawPost: p,
      };
    });
  }, [posts]);
  const allReelsRows = useMemo(() => {
    return allPostsRows
      .filter((r) => r.type === 'Reel')
      .map((r) => ({
        post: r.rawPost,
        views: bestPostPlayCount(r.rawPost),
        organicViews: r.rawPost.facebookInsights?.post_video_views_organic ?? 0,
        avgWatchMs: r.rawPost.facebookInsights?.post_video_avg_time_watched ?? 0,
      }));
  }, [allPostsRows]);
  const contentHistoryRows = useMemo(() => {
    if (historyFilter === 'posts') return allPostsRows.filter((r) => r.type === 'Post');
    if (historyFilter === 'reels') return allPostsRows.filter((r) => r.type === 'Reel');
    return allPostsRows;
  }, [allPostsRows, historyFilter]);

  return (
    <div className="p-0 md:p-0.5 space-y-3" style={{ background: COLOR.pageBg, maxWidth: 1400 }}>
      {onUpgrade ? (
        <section
          className="-mt-1 rounded-2xl px-4 py-2 md:px-4.5 md:py-2.5 flex flex-wrap items-center justify-between gap-2"
          style={{ background: 'linear-gradient(90deg, rgba(66,217,245,0.08), rgba(124,108,255,0.07), rgba(217,70,239,0.07))' }}
        >
          <p className="text-sm" style={{ color: COLOR.textSecondary }}>
            Unlock more than 30 days of history without watermarks and more helpful features...
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: '#ffffff', color: COLOR.violet, boxShadow: '0 1px 8px rgba(15,23,42,0.08)' }}
          >
            <Gem size={14} className="text-violet-500" aria-hidden />
            Upgrade
          </button>
        </section>
      ) : null}

      <section className="rounded-[20px] p-3 md:p-3.5" style={{ background: COLOR.section }}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2.5">
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Facebook profile"
                className="shrink-0"
              >
                <div
                  className="h-11 w-11 overflow-hidden rounded-full"
                  style={{ display: accountAvatarUrl ? 'block' : 'none' }}
                >
                  {accountAvatarUrl ? (
                    <img
                      src={accountAvatarUrl}
                      alt={profile?.name ? `${profile.name} avatar` : 'Account avatar'}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const wrap = e.currentTarget.parentElement as HTMLElement | null;
                        if (wrap) wrap.style.display = 'none';
                        const fallback = wrap?.parentElement?.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                </div>
              </a>
            ) : (
              <div
                className="h-11 w-11 shrink-0 overflow-hidden rounded-full"
                style={{ display: accountAvatarUrl ? 'block' : 'none' }}
              >
                {accountAvatarUrl ? (
                  <img
                    src={accountAvatarUrl}
                    alt={profile?.name ? `${profile.name} avatar` : 'Account avatar'}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const wrap = e.currentTarget.parentElement as HTMLElement | null;
                      if (wrap) wrap.style.display = 'none';
                      const fallback = wrap?.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
              </div>
            )}
            <div
              className="h-11 w-11 rounded-full items-center justify-center text-base font-semibold"
              style={{
                background: '#eef2ff',
                color: COLOR.violet,
                display: accountAvatarUrl ? 'none' : 'flex',
              }}
            >
              {(profile?.name || profile?.username || 'FB').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: COLOR.text }}>
                {profile?.name || insights?.facebookPageProfile?.username || followersLabel || 'Facebook Page'}
              </h1>
              <p className="text-sm" style={{ color: COLOR.textSecondary }}>
                @{profile?.username || 'unknown'}{profile?.category ? `  •  ${profile.category}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onDateRangeChange ? (
              <AnalyticsDateRangePicker start={dateRange.start} end={dateRange.end} onChange={onDateRangeChange} />
            ) : (
              <span className="rounded-xl border px-2.5 py-1 text-xs" style={{ borderColor: COLOR.border, color: COLOR.textSecondary }}>
                {dateRange.start} to {dateRange.end}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2">
          <StickySectionNav sections={sections} activeSection={activeSection} />
        </div>
        {postsLoading && !insightsLoading ? (
          <p className="mt-2.5 text-xs font-medium animate-pulse" style={{ color: COLOR.textSecondary }}>
            Updating posts and reels from Facebook, tables will refresh when sync finishes.
          </p>
        ) : null}
      </section>

      {overviewSkeleton ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-[20px] animate-pulse" style={{ background: COLOR.card }} />
          ))}
        </div>
      ) : null}

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-28 space-y-4">
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance</h3>
          </div>
          <div className="mb-1 flex gap-2">
            {(['growth', 'engagement', 'views'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStoryMode(mode)}
                title={`Change in selected range: ${storyModeHoverHint[mode]}`}
                aria-label={`${mode === 'views' ? 'Views' : mode === 'engagement' ? 'Engagement' : 'Growth'} mode. Change in selected range: ${storyModeHoverHint[mode]}`}
                className="rounded-lg px-3 py-1.5 text-sm"
                style={{
                  background: storyMode === mode ? 'rgba(139,124,255,0.2)' : 'rgba(255,255,255,0.03)',
                  color: storyMode === mode ? COLOR.text : COLOR.textSecondary,
                  border: `1px solid ${storyMode === mode ? COLOR.violet : COLOR.border}`,
                }}
              >
                {mode === 'views' ? 'Views' : mode === 'engagement' ? 'Engagement' : 'Growth'}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SparklineMetricCard
              label="Followers"
              source="fan_count/followers_count"
              color={COLOR.mint}
              value={formatCompact(totalFollowers)}
              series={series?.follows ?? []}
              active={isCardSelected('followers')}
              onClick={() => toggleStoryMetric('followers')}
            />
            <SparklineMetricCard
              label="Engagements"
              source="page_post_engagements"
              color={COLOR.violet}
              value={formatCompact(engagements)}
              series={series?.engagement ?? []}
              active={isCardSelected('engagements')}
              onClick={() => toggleStoryMetric('engagements')}
            />
            <SparklineMetricCard
              label="Video Views"
              source="page_video_views, post_video_views, post_media_view"
              color={COLOR.magenta}
              value={formatCompact(videoViews)}
              series={series?.videoViews ?? []}
              active={isCardSelected('videoViews')}
              onClick={() => toggleStoryMetric('videoViews')}
            />
            <SparklineMetricCard
              label="Content Views"
              source="page_media_view"
              color={COLOR.amber}
              value={formatCompact(contentViews)}
              series={series?.contentViews ?? []}
              active={isCardSelected('contentViews')}
              onClick={() => toggleStoryMetric('contentViews')}
            />
            <SparklineMetricCard
              label="Page Visits"
              source="page_views_total"
              color="#d72661"
              value={formatCompact(pageVisits)}
              series={series?.pageTabViews ?? []}
              active={isCardSelected('pageVisits')}
              onClick={() => toggleStoryMetric('pageVisits')}
            />
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedStoryMetrics.map((metric) => (
                <span
                  key={metric}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: STORY_METRIC_CONFIG[metric].color }} />
                  {STORY_METRIC_CONFIG[metric].label}
                </span>
              ))}
            </div>
          </div>
          <InsightChartCard title="Performance" hideHeader flat>
          {selectedStoryMetrics.length === 0 ? (
            <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
              <div className="absolute inset-0 z-[2] flex items-center justify-center">
                <div
                  className="rounded-2xl px-5 py-3 text-sm font-medium text-center max-w-[560px] w-[min(560px,92%)]"
                  style={{ background: 'rgba(255,255,255,1)', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}
                >
                  Select at least one metric card to display performance data.
                </div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartByMode}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" ticks={storyTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [formatNumber(Number(v) || 0), n && n in STORY_METRIC_CONFIG ? STORY_METRIC_CONFIG[n as StoryMetricKey].label : String(n ?? '')]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedStoryMetrics.map((metric) => (
                  <Line key={metric} type="monotone" dataKey={metric} stroke={STORY_METRIC_CONFIG[metric].color} strokeWidth={2.2} dot={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          </InsightChartCard>
        </div>

        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Engagement</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Likes"
              source="post_reactions_like_total"
              color={ENGAGEMENT_METRIC_CONFIG.likes.color}
              value={formatCompact(likesTotal)}
              active={selectedEngagementMetrics.includes('likes')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('likes') ? prev.filter((m) => m !== 'likes') : [...prev, 'likes'])}
            />
            <MetricCard
              label="Comments"
              source="post_comments"
              color={ENGAGEMENT_METRIC_CONFIG.comments.color}
              value={formatCompact(commentsTotal)}
              active={selectedEngagementMetrics.includes('comments')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('comments') ? prev.filter((m) => m !== 'comments') : [...prev, 'comments'])}
            />
            <MetricCard
              label="Shares"
              source="post_shares"
              color={ENGAGEMENT_METRIC_CONFIG.shares.color}
              value={formatCompact(sharesTotal)}
              active={selectedEngagementMetrics.includes('shares')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
            />
            <MetricCard
              label="Reposts"
              source="Proxy from post_shares"
              color={ENGAGEMENT_METRIC_CONFIG.reposts.color}
              value={formatCompact(repostsTotal)}
              active={selectedEngagementMetrics.includes('reposts')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('reposts') ? prev.filter((m) => m !== 'reposts') : [...prev, 'reposts'])}
            />
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedEngagementMetrics.map((m) => (
                <span
                  key={m}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ENGAGEMENT_METRIC_CONFIG[m].color }} />
                  {ENGAGEMENT_METRIC_CONFIG[m].label}
                </span>
              ))}
            </div>
          </div>
          <InsightChartCard title="Engagement" hideHeader flat>
          {selectedEngagementMetrics.length === 0 ? (
            <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
              <div className="absolute inset-0 z-[2] flex items-center justify-center">
                <div
                  className="rounded-2xl px-5 py-3 text-sm font-medium text-center max-w-[560px] w-[min(560px,92%)]"
                  style={{ background: 'rgba(255,255,255,1)', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}
                >
                  Select at least one metric card to display engagement data.
                </div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" ticks={engagementTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [
                    formatNumber(Number(v) || 0),
                    n === 'likes' ? 'Likes' : n === 'comments' ? 'Comments' : n === 'shares' ? 'Shares' : 'Reposts',
                  ]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedEngagementMetrics.includes('likes') ? <Line type="monotone" dataKey="likes" stroke={ENGAGEMENT_METRIC_CONFIG.likes.color} strokeWidth={2} dot={false} /> : null}
                {selectedEngagementMetrics.includes('comments') ? <Line type="monotone" dataKey="comments" stroke={ENGAGEMENT_METRIC_CONFIG.comments.color} strokeWidth={2} dot={false} /> : null}
                {selectedEngagementMetrics.includes('shares') ? <Line type="monotone" dataKey="shares" stroke={ENGAGEMENT_METRIC_CONFIG.shares.color} strokeWidth={2} dot={false} /> : null}
                {selectedEngagementMetrics.includes('reposts') ? <Line type="monotone" dataKey="reposts" stroke={ENGAGEMENT_METRIC_CONFIG.reposts.color} strokeWidth={2} dot={false} /> : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          </InsightChartCard>
        </div>

        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Activity</h3>
          </div>
          <div className="flex gap-2">
              {(['publishing', 'community'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setActivityPreset(preset)}
                  className="rounded-lg px-3 py-1.5 text-sm"
                  style={{
                    background: activityPreset === preset ? 'rgba(139,124,255,0.2)' : 'rgba(255,255,255,0.03)',
                    color: activityPreset === preset ? COLOR.text : COLOR.textSecondary,
                    border: `1px solid ${activityPreset === preset ? COLOR.violet : COLOR.border}`,
                  }}
                >
                  {preset === 'publishing' ? 'Publishing' : 'Community'}
                </button>
              ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Actions"
            source={(bundle?.series.totalActions?.length ?? 0) > 0 ? 'page_total_actions' : 'page_post_engagements (fallback)'}
            color={ACTIVITY_METRIC_CONFIG.actions.color}
            value={formatCompact(totalActions)}
            active={selectedActivityMetrics.includes('actions')}
            onClick={() => setSelectedActivityMetrics((prev) => prev.includes('actions') ? prev.filter((m) => m !== 'actions') : [...prev, 'actions'])}
          />
          <MetricCard
            label="Posts"
            source="Derived from posts feed"
            color={ACTIVITY_METRIC_CONFIG.posts.color}
            value={formatCompact(postsInRange.length)}
            active={selectedActivityMetrics.includes('posts')}
            onClick={() => setSelectedActivityMetrics((prev) => prev.includes('posts') ? prev.filter((m) => m !== 'posts') : [...prev, 'posts'])}
          />
          <MetricCard
            label="Conversations"
            source="Messenger conversations"
            color={ACTIVITY_METRIC_CONFIG.conversations.color}
            value={formatCompact(conversationActivityCount)}
            active={selectedActivityMetrics.includes('conversations')}
            onClick={() => setSelectedActivityMetrics((prev) => prev.includes('conversations') ? prev.filter((m) => m !== 'conversations') : [...prev, 'conversations'])}
          />
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedActivityMetrics.map((m) => (
                <span
                  key={m}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ACTIVITY_METRIC_CONFIG[m].color }} />
                  {ACTIVITY_METRIC_CONFIG[m].label}
                </span>
              ))}
            </div>
          </div>
          <InsightChartCard title="Activity" hideHeader flat>
          {selectedActivityMetrics.length === 0 ? (
            <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
              <div className="absolute inset-0 z-[2] flex items-center justify-center">
                <div
                  className="rounded-2xl px-5 py-3 text-sm font-medium text-center max-w-[560px] w-[min(560px,92%)]"
                  style={{ background: 'rgba(255,255,255,1)', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}
                >
                  Select at least one metric card to display activity data.
                </div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={operationalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" ticks={operationalTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [
                    formatNumber(Number(v) || 0),
                    n === 'actions'
                      ? 'Actions'
                      : n === 'posts'
                      ? 'Posts'
                      : n === 'conversations'
                        ? 'Conversations'
                        : '',
                  ]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedActivityMetrics.includes('actions') ? <Line type="monotone" dataKey="actions" stroke={ACTIVITY_METRIC_CONFIG.actions.color} strokeWidth={2} dot={false} /> : null}
                {selectedActivityMetrics.includes('posts') ? <Line type="monotone" dataKey="posts" stroke={ACTIVITY_METRIC_CONFIG.posts.color} strokeWidth={2} dot={false} /> : null}
                {selectedActivityMetrics.includes('conversations') ? <Line type="monotone" dataKey="conversations" stroke={ACTIVITY_METRIC_CONFIG.conversations.color} strokeWidth={2} dot={false} /> : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          </InsightChartCard>
        </div>

        <CommunitySummaryCard
          conversationsCount={conversationActivityCount}
          latestConversationAt={community?.latestConversationAt ?? null}
          ratingsCount={community?.ratingsCount ?? 0}
          latestRecommendationText={community?.latestRecommendationText ?? null}
        />
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.traffic} className="scroll-mt-28 space-y-6">
        <div>
          <h2 className="text-[28px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Traffic</h2>
          <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
            Diagnose distribution quality across non-viral and viral attention sources.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Post Impressions" source="page_posts_impressions" color={COLOR.cyan} value={formatCompact(postImpressions)} />
          <MetricCard label="Non-viral Impressions" source="page_posts_impressions_nonviral" color={COLOR.violet} value={formatCompact(nonviralImpressions)} />
          <MetricCard label="Viral Impressions" source="page_posts_impressions_viral" color={COLOR.magenta} value={formatCompact(viralImpressions)} />
          <MetricCard label="Unique Reach Proxy" source="Sum of post_impressions_unique" color={COLOR.amber} value={formatCompact(uniqueReachProxy)} footnote="Derived from post-layer metrics" />
        </div>

        <InsightChartCard
          title="Visibility Composition"
          subtitle="Stacked non-viral and viral impressions over time."
          legend={[{ label: 'Non-viral', color: COLOR.violet }, { label: 'Viral', color: COLOR.magenta }]}
        >
          {stackedTraffic.some((d) => d.nonviral > 0 || d.viral > 0) ? (
            <StackedTrafficChart data={stackedTraffic} />
          ) : (
            <EmptyStateCard title="No traffic composition yet" subtitle="Meta has not returned viral and non-viral rows for this date range." />
          )}
        </InsightChartCard>

        <InsightChartCard
          title="Content Views vs Page Visits"
          legend={[{ label: 'Content Views', color: COLOR.amber }, { label: 'Page Visits', color: '#d72661' }]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={viewVsVisit}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" ticks={viewVisitTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} minTickGap={18} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} formatter={(v: number | string | undefined) => formatNumber(Number(v) || 0)} labelFormatter={(l) => formatShortDate(String(l))} />
              <Line type="monotone" dataKey="views" stroke={COLOR.amber} strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="visits" stroke={'#d72661'} strokeWidth={2.2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </InsightChartCard>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Engagement Rate" source="page_post_engagements / page_posts_impressions" color={COLOR.violet} value={formatPercent(engagementRate)} footnote="Derived metric" />
          <MetricCard label="Video View Rate" source="page_video_views / page_media_view" color={COLOR.magenta} value={formatPercent(videoViewRate)} footnote="Derived metric" />
          <MetricCard label="Viral Share of Impressions" source="viral / total impressions" color={COLOR.cyan} value={formatPercent(viralShare)} footnote="Derived metric" />
        </div>

        <div className="rounded-[20px] border p-4 text-sm" style={{ background: COLOR.card, borderColor: COLOR.border, color: COLOR.textSecondary }}>
          <p><span style={{ color: COLOR.text }}>Insight note:</span> Non-viral impressions represent direct and organic post visibility. Viral impressions represent social amplification and redistribution.</p>
        </div>
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-28 space-y-6">
        <div>
          <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Posts</h2>
          <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
            Explore which posts drove views, clicks, and reactions.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Total Posts" source="Derived from posts in date range" color={COLOR.text} value={formatCompact(postsInRange.length)} />
          <MetricCard label="Avg Clicks per Post" source="post_clicks" color={COLOR.amber} value={avgClicksPerPost.toFixed(1)} />
          <MetricCard label="Avg Reactions per Post" source="post_reactions_like_total / breakdown" color={COLOR.violet} value={avgReactionsPerPost.toFixed(1)} />
        </div>
        <TopContentHighlights
          byViews={topByViews.map((p) => ({ id: p.id, preview: p.preview, permalink: p.permalink, value: p.value, type: p.type }))}
          byClicks={topByClicks.map((p) => ({ id: p.id, preview: p.preview, permalink: p.permalink, value: p.value, type: p.type }))}
          byReactions={topByReactions.map((p) => ({ id: p.id, preview: p.preview, permalink: p.permalink, value: p.value, type: p.type }))}
        />

        {postsRows.length > 0 ? (
          <PostsPerformanceTable rows={postsRows} onOpenDetail={setSelectedPost} />
        ) : postsLoading ? (
          <div className="rounded-[20px] border p-6 space-y-3" style={{ background: COLOR.card, borderColor: COLOR.border }}>
            <p className="text-sm font-medium" style={{ color: COLOR.text }}>Loading posts for this range…</p>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(15,23,42,0.06)' }} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyStateCard title="No posts in this range" subtitle="Try a wider date range or sync the account posts again." />
        )}

      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-6">
        <div>
          <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Reels</h2>
          <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
            Video performance intelligence with watch quality and organic share.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Reel Count" source="Permalink contains /reel/" color={COLOR.text} value={formatCompact(reelsRows.length)} />
          <MetricCard label="Total Video Views" source="post_video_views" color={COLOR.magenta} value={formatCompact(totalReelVideoViews)} />
          <MetricCard label="Avg Watch Time" source="Mean post_video_avg_time_watched" color={COLOR.magenta} value={formatDurationMs(avgWatchMs)} />
        </div>

        <InsightChartCard title="Reel Performance" subtitle="Bars for views, line for average watch time (seconds)." legend={[{ label: 'Views', color: COLOR.magenta }, { label: 'Avg Watch (s)', color: COLOR.amber }]}>
          {reelsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={reelsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                <XAxis dataKey="date" ticks={reelsTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} minTickGap={18} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} formatter={(v: number | string | undefined, n?: string) => [n === 'watchSeconds' ? `${(Number(v) || 0).toFixed(1)}s` : formatNumber(Number(v) || 0), n === 'watchSeconds' ? 'Avg Watch' : 'Views']} />
                <Bar yAxisId="left" dataKey="views" fill={COLOR.magenta} radius={[6, 6, 0, 0]} />
                <Line yAxisId="right" dataKey="watchSeconds" stroke={COLOR.amber} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyStateCard title="No reels in this period" subtitle="Reel analytics appears after reels are discovered in your post inventory." />
          )}
        </InsightChartCard>

        <ReelsPerformanceGrid reels={reelsRows} />
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.history} className="scroll-mt-28 space-y-4">
        <div>
          <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Content History</h2>
          <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
            Unified archive for posts and reels with filters for faster investigation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'all', label: 'All' },
            { id: 'posts', label: 'Posts' },
            { id: 'reels', label: 'Reels' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setHistoryFilter(f.id)}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: historyFilter === f.id ? 'rgba(124,108,255,0.14)' : '#ffffff',
                color: historyFilter === f.id ? COLOR.violet : COLOR.textSecondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {contentHistoryRows.length > 0 ? (
          <PostsPerformanceTable rows={contentHistoryRows} onOpenDetail={setSelectedPost} />
        ) : postsLoading ? (
          <div className="rounded-[20px] border p-6 space-y-3" style={{ background: COLOR.card, borderColor: COLOR.border }}>
            <p className="text-sm font-medium" style={{ color: COLOR.text }}>Loading content history…</p>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: 'rgba(15,23,42,0.06)' }} />
              ))}
            </div>
          </div>
        ) : (
          <PostsPerformanceTable rows={contentHistoryRows} onOpenDetail={setSelectedPost} />
        )}
      </section>

      {selectedPost ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setSelectedPost(null)}>
          <aside
            className="h-full w-full max-w-lg overflow-y-auto border-l p-5"
            style={{ background: '#ffffff', borderColor: COLOR.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Post Details</h3>
              <button type="button" onClick={() => setSelectedPost(null)} style={{ color: COLOR.textSecondary }}>Close</button>
            </div>
            <p className="mt-3 text-sm leading-6" style={{ color: COLOR.textSecondary }}>{selectedPost.content || 'No caption'}</p>
            <p className="mt-2 text-xs" style={{ color: COLOR.textMuted }}>
              {new Date(selectedPost.publishedAt).toLocaleString()}
            </p>
            {selectedPost.permalinkUrl ? (
              <Link href={selectedPost.permalinkUrl} target="_blank" className="mt-3 inline-flex items-center gap-1 text-sm" style={{ color: COLOR.cyan }}>
                Open permalink <ExternalLink size={14} />
              </Link>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {Object.entries(selectedPost.facebookInsights ?? {}).map(([key, val]) => (
                <div key={key} className="rounded-xl border p-3" style={{ borderColor: COLOR.border }}>
                  <p className="text-[11px]" style={{ color: COLOR.textMuted }}>{key}</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: COLOR.text }}>
                    {typeof val === 'number' ? (key.includes('time') ? formatDurationMs(val) : formatNumber(val)) : String(val)}
                  </p>
                </div>
              ))}
            </div>
            {selectedPost.facebookInsights?.post_reactions_by_type_total && typeof selectedPost.facebookInsights.post_reactions_by_type_total === 'object' ? (
              <div className="mt-5 rounded-xl border p-4" style={{ borderColor: COLOR.border }}>
                <p className="text-sm font-semibold" style={{ color: COLOR.text }}>Reactions composition</p>
                <div className="mt-3 space-y-2">
                  {Object.entries(selectedPost.facebookInsights.post_reactions_by_type_total as Record<string, unknown>).map(([k, v]) => {
                    const n = typeof v === 'number' ? v : 0;
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-xs" style={{ color: COLOR.textSecondary }}>
                          <span>{k}</span>
                          <span>{formatNumber(n)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full" style={{ background: 'rgba(15,23,42,0.08)' }}>
                          <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (n / Math.max(1, parseReactionTotal(selectedPost.facebookInsights?.post_reactions_by_type_total))) * 100)}%`, background: COLOR.violet }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {process.env.NODE_ENV !== 'production' ? (
        <details className="rounded-[20px] border p-4" style={{ background: COLOR.card, borderColor: COLOR.border }}>
          <summary className="cursor-pointer text-sm font-medium" style={{ color: COLOR.textSecondary }}>
            Debug metrics mapping
          </summary>
          <div className="mt-3 space-y-2 text-xs" style={{ color: COLOR.textSecondary }}>
            {METRIC_MAP.map((m) => (
              <p key={m.key}>
                <span style={{ color: COLOR.text }}>{m.label}</span> - {m.key} ({m.section})
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {insights?.insightsHint ? (
        <div className="rounded-[16px] border px-4 py-3 text-sm" style={{ borderColor: 'rgba(255,138,122,0.45)', color: COLOR.coral, background: 'rgba(255,138,122,0.08)' }}>
          {insights.insightsHint}
          {onReconnectFacebook ? (
            <button type="button" onClick={onReconnectFacebook} className="ml-2 inline-flex items-center gap-1 underline">
              Reconnect <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
