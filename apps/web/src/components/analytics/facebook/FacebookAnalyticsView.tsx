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
import { ChevronRight, ExternalLink, Info, MessageSquare, Sparkles, Star } from 'lucide-react';
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
}: {
  label: string;
  value: string;
  source: string;
  color: string;
  footnote?: string;
}) {
  return (
    <div
      className="rounded-[20px] p-5 transition-all hover:-translate-y-[1px]"
      style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}
    >
      <MetricTooltip label={label} hint={`Source metric: ${source}`} />
      <p className="mt-3 text-[28px] font-semibold tracking-tight" style={{ color }}>{value}</p>
      {footnote ? <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>{footnote}</p> : null}
    </div>
  );
}

export function SparklineMetricCard(props: {
  label: string;
  source: string;
  color: string;
  value: string;
  series: Array<{ date: string; value: number }>;
  footnote?: string;
}) {
  const { label, source, color, value, footnote } = props;
  return <MetricCard label={label} source={source} color={color} value={value} footnote={footnote} />;
}

export function InsightChartCard({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: Array<{ label: string; color: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] p-6" style={{ background: COLOR.card, boxShadow: '0 2px 20px rgba(15,23,42,0.06)' }}>
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
      <div className="mt-5 h-[320px]">{children}</div>
    </div>
  );
}

export function StackedTrafficChart({ data }: { data: Array<{ date: string; nonviral: number; viral: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
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
          <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>
            {latestConversationAt
              ? `Latest activity: ${new Date(latestConversationAt).toLocaleString()}`
              : 'No Messenger threads in cache yet. We pull these when analytics loads or when posts sync; ensure the Page token includes messaging permissions.'}
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: COLOR.card }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: COLOR.textMuted }}><Star size={12} className="inline mr-1" /> Ratings</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLOR.text }}>{formatNumber(ratingsCount)}</p>
          <p className="mt-1 text-xs" style={{ color: COLOR.textSecondary }}>
            {latestRecommendationText
              ? clampText(latestRecommendationText, 96)
              : 'No reviews in cache yet. We pull Page ratings when analytics loads or when posts sync.'}
          </p>
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
              color: activeSection === sec.id ? COLOR.text : COLOR.textSecondary,
              background: activeSection === sec.id ? 'rgba(124,108,255,0.12)' : 'transparent',
              border: activeSection === sec.id ? `1px solid rgba(124,108,255,0.24)` : '1px solid transparent',
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
  const overviewSkeleton = insightsLoading;
  const [storyMode, setStoryMode] = useState<StoryMode>('views');
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

  const bundle = insights?.facebookAnalytics;
  const profile = insights?.facebookPageProfile;
  const community = insights?.facebookCommunity;
  const postsInRange = useMemo(
    () => posts.filter((p) => inRange(p.publishedAt, dateRange.start, dateRange.end)),
    [posts, dateRange.end, dateRange.start]
  );
  const dateAxis = useMemo(() => buildDateAxis(dateRange.start, dateRange.end), [dateRange.end, dateRange.start]);
  const series = bundle?.series;
  const totalFollowers = profile?.followers_count ?? profile?.fan_count ?? insights?.followers ?? 0;
  const newFollowers = bundle?.totals.dailyFollows ?? 0;
  const contentViews = bundle?.totals.contentViews ?? 0;
  const pageVisits = bundle?.totals.pageTabViews ?? 0;
  const engagements = bundle?.totals.engagement ?? 0;
  const pageVideoViews = bundle?.totals.videoViews ?? 0;
  const postVideoPlaysInRange = useMemo(() => sumPostLevelVideoPlays(postsInRange), [postsInRange]);
  const videoViews = Math.max(pageVideoViews, postVideoPlaysInRange);
  const postImpressions = bundle?.totals.postImpressions ?? 0;
  const nonviralImpressions = bundle?.totals.postImpressionsNonviral ?? 0;
  const viralImpressions = bundle?.totals.postImpressionsViral ?? 0;
  const totalActions = bundle?.totals.totalActions ?? 0;
  const uniqueReachProxy = postsInRange.reduce((s, p) => s + (p.facebookInsights?.post_impressions_unique ?? 0), 0);

  const chartByMode = useMemo(() => {
    const mediaRaw = seriesToMap(series?.contentViews ?? []);
    const visitsRaw = seriesToMap(series?.pageTabViews ?? []);
    const engagementRaw = seriesToMap(series?.engagement ?? []);
    const followsRaw = seriesToMap(series?.follows ?? []);
    const dailyFollowsRaw = seriesToMap(series?.dailyFollows ?? []);
    const media = carryForwardSeries(dateAxis, mediaRaw, 0);
    const visits = carryForwardSeries(dateAxis, visitsRaw, 0);
    const engagement = carryForwardSeries(dateAxis, engagementRaw, 0);
    const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers);
    const dailyFollows = carryForwardSeries(dateAxis, dailyFollowsRaw, 0);
    return dateAxis.map((date) => ({
      date,
      primary:
        storyMode === 'views'
          ? media[date] ?? 0
          : storyMode === 'engagement'
            ? engagement[date] ?? 0
            : follows[date] ?? 0,
      secondary:
        storyMode === 'views'
          ? visits[date] ?? 0
          : storyMode === 'engagement'
            ? 0
            : dailyFollows[date] ?? 0,
    }));
  }, [dateAxis, series?.contentViews, series?.dailyFollows, series?.engagement, series?.follows, series?.pageTabViews, storyMode]);

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
    <div className="p-0.5 md:p-1 space-y-6" style={{ background: COLOR.pageBg, maxWidth: 1400 }}>
      {onUpgrade ? (
        <section
          className="rounded-2xl px-4 py-2.5 md:px-5 md:py-3 flex flex-wrap items-center justify-between gap-2.5"
          style={{ background: 'linear-gradient(90deg, rgba(66,217,245,0.08), rgba(124,108,255,0.07), rgba(217,70,239,0.07))' }}
        >
          <p className="text-sm" style={{ color: COLOR.textSecondary }}>
            Unlock more than 30 days of history without watermarks and more..
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: '#ffffff', color: COLOR.violet, boxShadow: '0 1px 8px rgba(15,23,42,0.08)' }}
          >
            <Sparkles size={14} />
            Upgrade
          </button>
        </section>
      ) : null}

      <section className="rounded-[20px] p-3.5 md:p-4" style={{ background: COLOR.section }}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2.5">
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
        <div className="mt-3">
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-[20px] animate-pulse" style={{ background: COLOR.card }} />
          ))}
        </div>
      ) : null}

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-28 space-y-6">
        <div>
          <h2 className="text-[28px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Overview</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SparklineMetricCard label="Followers" source="fan_count/followers_count" color={COLOR.mint} value={formatCompact(totalFollowers)} series={series?.follows ?? []} footnote="Page total" />
          <SparklineMetricCard label="Followers" source="page_daily_follows" color={COLOR.mint} value={formatCompact(newFollowers)} series={series?.dailyFollows ?? []} footnote="New in selected range" />
          <SparklineMetricCard label="Content Views" source="page_media_view" color={COLOR.cyan} value={formatCompact(contentViews)} series={series?.contentViews ?? []} />
          <SparklineMetricCard label="Page Visits" source="page_views_total" color={COLOR.cyan} value={formatCompact(pageVisits)} series={series?.pageTabViews ?? []} />
          <SparklineMetricCard label="Engagements" source="page_post_engagements" color={COLOR.violet} value={formatCompact(engagements)} series={series?.engagement ?? []} />
          <SparklineMetricCard
            label="Video Views"
            source="page_video_views, post_video_views, post_media_view"
            color={COLOR.magenta}
            value={formatCompact(videoViews)}
            series={series?.videoViews ?? []}
            footnote={
              postVideoPlaysInRange > pageVideoViews
                ? 'Uses post and reel play counts when they are higher than Page video views for this range.'
                : undefined
            }
          />
        </div>

        <InsightChartCard
          title="Performance Story"
          subtitle="Switch perspective between visibility, engagement, and growth."
          legend={
            storyMode === 'views'
              ? [{ label: 'Content Views', color: COLOR.cyan }, { label: 'Page Visits', color: COLOR.violet }]
              : storyMode === 'engagement'
                ? [{ label: 'Engagements', color: COLOR.violet }]
                : [{ label: 'Followers', color: COLOR.mint }, { label: 'New followers', color: COLOR.amber }]
          }
        >
          <div className="mb-3 flex gap-2">
            {(['views', 'engagement', 'growth'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStoryMode(mode)}
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartByMode}>
              <defs>
                <linearGradient id="primaryStory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={storyMode === 'growth' ? COLOR.mint : storyMode === 'views' ? COLOR.cyan : COLOR.violet} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={storyMode === 'growth' ? COLOR.mint : storyMode === 'views' ? COLOR.cyan : COLOR.violet} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                formatter={(v: number | string | undefined, n?: string) => [formatNumber(Number(v) || 0), n === 'primary' ? (storyMode === 'views' ? 'Content Views' : storyMode === 'engagement' ? 'Engagements' : 'Followers') : (storyMode === 'views' ? 'Page Visits' : 'New followers')]}
                labelFormatter={(l) => formatShortDate(String(l))}
              />
              <Area type="monotone" dataKey="primary" stroke={storyMode === 'growth' ? COLOR.mint : storyMode === 'views' ? COLOR.cyan : COLOR.violet} fill="url(#primaryStory)" strokeWidth={2.2} />
              {storyMode !== 'engagement' ? <Line type="monotone" dataKey="secondary" stroke={storyMode === 'views' ? COLOR.violet : COLOR.amber} strokeWidth={2} dot={false} /> : null}
            </AreaChart>
          </ResponsiveContainer>
        </InsightChartCard>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Total Actions" source="page_total_actions" color={COLOR.amber} value={formatCompact(totalActions)} />
          <MetricCard label="Total Posts in Range" source="Derived from posts feed" color={COLOR.text} value={formatCompact(postsInRange.length)} footnote={`${postsInRange.filter((p) => (p.permalinkUrl ?? '').includes('/reel/')).length} reels`} />
          <MetricCard
            label="Conversation Activity"
            source="facebook_conversations cache"
            color={COLOR.violet}
            value={formatCompact(community?.conversationsCount ?? 0)}
            footnote={community?.latestConversationAt ? `Latest: ${new Date(community.latestConversationAt).toLocaleString()}` : 'Synced from Messenger; see Community section below'}
          />
        </div>

        <CommunitySummaryCard
          conversationsCount={community?.conversationsCount ?? 0}
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
          legend={[{ label: 'Content Views', color: COLOR.cyan }, { label: 'Page Visits', color: COLOR.violet }]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={viewVsVisit}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} formatter={(v: number | string | undefined) => formatNumber(Number(v) || 0)} labelFormatter={(l) => formatShortDate(String(l))} />
              <Line type="monotone" dataKey="views" stroke={COLOR.cyan} strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="visits" stroke={COLOR.violet} strokeWidth={2.2} dot={false} />
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
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
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
              {Array.from({ length: 6 }).map((_, i) => (
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
