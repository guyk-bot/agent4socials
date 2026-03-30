'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronRight, ExternalLink, Gem, MessageSquare, Star } from 'lucide-react';
import { AnalyticsDateRangePicker } from '../AnalyticsDateRangePicker';
import type { FacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';
import type { FacebookInsights, FacebookPost } from './types';
import { FACEBOOK_ANALYTICS_SECTION_IDS } from './facebook-analytics-section-ids';
import { localCalendarDateFromIso, toLocalCalendarDate } from '@/lib/calendar-date';
import { formatMetricNumber as formatNumber } from '@/lib/metric-format';

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
  /** False until the first GET /insights response for this account (avoids flashing zeros on Instagram and other non-Facebook platforms). */
  hasApiInsightsFetched?: boolean;
  /** e.g. "Subscribers" for YouTube; defaults to "Followers" */
  followersLabel?: string;
  /** Connected account avatar from sidebar/account record. */
  accountAvatarUrl?: string | null;
  /** @handle from connected account (Instagram, etc.) when Graph page profile is not present. */
  accountUsername?: string | null;
}

type SectionId = (typeof FACEBOOK_ANALYTICS_SECTION_IDS)[keyof typeof FACEBOOK_ANALYTICS_SECTION_IDS];
type StoryMode = 'views' | 'engagement' | 'growth';
type StoryMetricKey = 'followers' | 'engagements' | 'videoViews' | 'contentViews' | 'pageVisits';
type ActivityMetricKey = 'actions' | 'posts' | 'conversations';
type EngagementMetricKey = 'likes' | 'comments' | 'shares' | 'reposts';
type TrafficMetricKey = 'postImpressions' | 'nonviral' | 'viral' | 'uniqueReachProxy';
type ReelMetricKey = 'views' | 'watchTime' | 'avgWatch' | 'clicks' | 'likes' | 'comments' | 'shares' | 'reposts';
type ReelPresetKey = 'performance' | 'engagement' | 'watch';
type ContentHistoryFilter = 'all' | 'posts' | 'reels';

const AUDIENCE_COUNTRY_PIE_COLORS = [
  '#42d9f5',
  '#7c6cff',
  '#d946ef',
  '#31c48d',
  '#f5b942',
  '#ff8b7b',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

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

/** Neon outline for metrics sourced from TikTok Open API (user.info, video/list, creator_info). */
const TIKTOK_API_CARD_CLASS =
  'ring-2 ring-[#facc15] shadow-[0_0_22px_rgba(250,204,21,0.5)] bg-[rgba(250,204,21,0.07)]';

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
  pageVisits: { label: 'Page Visits', color: COLOR.coral, mode: 'views' },
};

const STORY_MODE_DEFAULT_METRICS: Record<StoryMode, StoryMetricKey[]> = {
  growth: ['followers'],
  engagement: ['engagements'],
  views: ['videoViews', 'contentViews', 'pageVisits'],
};

const ACTIVITY_METRIC_CONFIG: Record<ActivityMetricKey, { label: string; color: string }> = {
  actions: { label: 'Actions', color: COLOR.violet },
  posts: { label: 'Posts', color: COLOR.magenta },
  conversations: { label: 'Conversations', color: COLOR.amber },
};

const ENGAGEMENT_METRIC_CONFIG: Record<EngagementMetricKey, { label: string; color: string }> = {
  likes: { label: 'Likes', color: COLOR.violet },
  comments: { label: 'Comments', color: COLOR.coral },
  shares: { label: 'Shares', color: COLOR.amber },
  reposts: { label: 'Reposts', color: '#111827' },
};

const TRAFFIC_METRIC_CONFIG: Record<TrafficMetricKey, { label: string; color: string }> = {
  postImpressions: { label: 'Post Impressions', color: COLOR.cyan },
  nonviral: { label: 'Non-viral Impressions', color: COLOR.violet },
  viral: { label: 'Viral Impressions', color: COLOR.magenta },
  uniqueReachProxy: { label: 'Unique Reach Proxy', color: COLOR.amber },
};

// Shared bar geometry across Engagement/Traffic/Reels so overlap behavior is consistent.
// barGap = -(barSize/2) makes each next selected series cross at the midpoint of previous one.
const UNIFIED_BAR_SIZE = 22;
// Use slightly stronger overlap than 50% to make the crossing visually clear at all widths.
const UNIFIED_BAR_GAP = -12;
const UNIFIED_BAR_CATEGORY_GAP = 10;

const REEL_METRIC_CONFIG: Record<ReelMetricKey, { label: string; color: string }> = {
  views: { label: 'Total Video Views', color: COLOR.magenta },
  watchTime: { label: 'Watch Time', color: COLOR.mint },
  avgWatch: { label: 'Avg Watch Time', color: COLOR.cyan },
  clicks: { label: 'Clicks', color: '#ef4444' },
  likes: { label: 'Likes', color: COLOR.violet },
  comments: { label: 'Comments', color: COLOR.coral },
  shares: { label: 'Shares', color: COLOR.amber },
  reposts: { label: 'Reposts', color: '#111827' },
};

const REEL_PRESET_METRICS: Record<ReelPresetKey, ReelMetricKey[]> = {
  performance: ['views', 'watchTime', 'avgWatch'],
  engagement: ['clicks', 'likes', 'comments', 'shares', 'reposts'],
  watch: ['watchTime', 'avgWatch'],
};

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

function formatPostCardDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

/** Pinterest CDN often rejects hotlinked images when a referrer is sent. */
function pinterestCdnImgProps(url: string | null | undefined): React.ImgHTMLAttributes<HTMLImageElement> {
  const u = typeof url === 'string' ? url : '';
  if (u.includes('pinimg.com') || u.includes('pinterest.com')) {
    return { referrerPolicy: 'no-referrer' };
  }
  return {};
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

function toFiniteNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function bestCount(primary: number | undefined | null, fallback: number | undefined | null): number {
  const a = typeof primary === 'number' && Number.isFinite(primary) ? primary : 0;
  const b = typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0;
  return Math.max(a, b);
}

function normalizeAvgWatchMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // Some integrations surface microseconds for avg watch; convert to ms when implausibly high.
  if (raw > 5 * 60 * 1000) return raw / 1000;
  return raw;
}

function getWatchTimes(post: FacebookPost): { watchTimeMs: number; avgWatchMs: number } {
  const fi = (post.facebookInsights ?? {}) as Record<string, unknown>;
  const avgWatchMs = normalizeAvgWatchMs(toFiniteNumber(fi.post_video_avg_time_watched));
  const totalWatchRaw = toFiniteNumber(fi.post_video_view_time);
  if (totalWatchRaw > 0) {
    return { watchTimeMs: totalWatchRaw, avgWatchMs };
  }
  // Fallback when API sends only avg watch metric.
  const views = Math.max(0, bestPostPlayCount(post));
  if (avgWatchMs > 0 && views > 0) {
    return { watchTimeMs: avgWatchMs * views, avgWatchMs };
  }
  return { watchTimeMs: 0, avgWatchMs };
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
  if ((p.platform ?? '').toUpperCase() === 'TIKTOK') return true;
  return isReelPost(p) || (p.mediaType ?? '').toUpperCase() === 'VIDEO' || typeof p.facebookInsights?.post_video_views === 'number';
}

/** Sum of reel/video post plays in range; Page `page_video_views` often disagrees with what you see on each reel. */
function sumPostLevelVideoPlays(posts: FacebookPost[]): number {
  return posts.reduce((s, p) => {
    if ((p.platform ?? '').toUpperCase() === 'TIKTOK') {
      return s + Math.max(0, p.impressions ?? bestPostPlayCount(p));
    }
    if (!isVideoishPost(p)) return s;
    const fi = p.facebookInsights ?? {};
    const pv = typeof fi.post_video_views === 'number' ? fi.post_video_views : 0;
    const pm = typeof fi.post_media_view === 'number' ? fi.post_media_view : 0;
    const plays = Math.max(pv, pm);
    return s + plays;
  }, 0);
}

function sumMetricSeriesPoints(s: Array<{ date: string; value: number }>): number {
  return s.reduce((a, p) => a + (typeof p.value === 'number' ? p.value : 0), 0);
}

function aggregatePostsByDayValue(
  posts: FacebookPost[],
  getValue: (p: FacebookPost) => number
): Array<{ date: string; value: number }> {
  const m: Record<string, number> = {};
  for (const p of posts) {
    const d = localCalendarDateFromIso(p.publishedAt);
    if (!d) continue;
    m[d] = (m[d] ?? 0) + getValue(p);
  }
  return Object.entries(m)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Instagram accounts never get Meta Page `facebookAnalytics`. Map IG account insights + per-post metrics
 * into the same bundle shape so overview/traffic/reels widgets populate.
 */
function buildInstagramSyntheticFacebookBundle(
  insights: FacebookInsights,
  postsInRange: FacebookPost[]
): FacebookFrontendAnalyticsBundle {
  const contentViews = [...(insights.impressionsTimeSeries ?? [])];
  const pageTabViews = [...(insights.pageViewsTimeSeries ?? [])];
  const follows = insights.followersTimeSeries ?? [];

  const engagementByDate = new Map<string, number>();
  const videoViewsByDate = new Map<string, number>();
  const videoTimeMsByDate = new Map<string, number>();

  for (const p of postsInRange) {
    const d = localCalendarDateFromIso(p.publishedAt);
    if (!d) continue;
    const eb = p.engagementBreakdown;
    const eng =
      eb?.totalEngagement ?? (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0);
    if (eng > 0) engagementByDate.set(d, (engagementByDate.get(d) ?? 0) + eng);

    if (!isVideoishPost(p)) continue;
    const plays = bestPostPlayCount(p);
    if (plays > 0) videoViewsByDate.set(d, (videoViewsByDate.get(d) ?? 0) + plays);
    const { watchTimeMs } = getWatchTimes(p);
    if (watchTimeMs > 0) videoTimeMsByDate.set(d, (videoTimeMsByDate.get(d) ?? 0) + watchTimeMs);
  }

  const sortSeries = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

  const engagement = sortSeries(engagementByDate);
  const videoViews = sortSeries(videoViewsByDate);
  const videoViewTime = sortSeries(videoTimeMsByDate);

  const dailyFollows: Array<{ date: string; value: number }> = [];
  if (follows.length >= 2) {
    for (let i = 1; i < follows.length; i++) {
      const prev = follows[i - 1].value;
      const cur = follows[i].value;
      dailyFollows.push({ date: follows[i].date, value: Math.max(0, cur - prev) });
    }
  }

  const postImpressions = contentViews.length > 0 ? contentViews : [];
  const engagementTotal = sumMetricSeriesPoints(engagement);
  const sourceKeys: string[] = [];
  if (contentViews.length) sourceKeys.push('impressions');
  if (pageTabViews.length) sourceKeys.push('profile_views');
  if (engagement.length) sourceKeys.push('post_engagement_proxy');
  if (videoViews.length) sourceKeys.push('post_video_views');

  return {
    followers: insights.followers ?? 0,
    series: {
      contentViews,
      pageTabViews,
      engagement,
      videoViews,
      videoViewTime,
      follows,
      dailyFollows,
      totalActions: engagement,
      postImpressions,
      postImpressionsNonviral: [],
      postImpressionsViral: [],
    },
    totals: {
      contentViews: sumMetricSeriesPoints(contentViews),
      pageTabViews: sumMetricSeriesPoints(pageTabViews),
      engagement: engagementTotal,
      videoViews: sumMetricSeriesPoints(videoViews),
      videoViewTime: sumMetricSeriesPoints(videoViewTime),
      follows: follows.length >= 2 ? Math.max(0, follows[follows.length - 1].value - follows[0].value) : 0,
      dailyFollows: sumMetricSeriesPoints(dailyFollows),
      totalActions: engagementTotal,
      postImpressions: sumMetricSeriesPoints(postImpressions),
      postImpressionsNonviral: 0,
      postImpressionsViral: 0,
    },
    sourceGraphMetricsIncluded: sourceKeys,
  };
}

function seriesToMap(series: Array<{ date: string; value: number }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of series) map[p.date] = p.value;
  return map;
}

function mergeSeriesMapsMax(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  }
  return out;
}

function mapToSortedSeries(map: Record<string, number>): Array<{ date: string; value: number }> {
  return Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

const SKELETON_GRADIENT_CARD = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
  boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
} as const;
const SKELETON_CHART = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
  boxShadow: '0 14px 30px rgba(15,23,42,0.09)',
} as const;

/** Full-section placeholders while insights are loading (all platforms). */
function AnalyticsTrafficSkeleton() {
  return (
    <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
      <div className="h-6 w-28 rounded-md animate-pulse bg-neutral-200/90" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[20px] animate-pulse" style={SKELETON_GRADIENT_CARD} />
        ))}
      </div>
      <div className="h-[300px] rounded-xl animate-pulse" style={SKELETON_CHART} />
      <div className="mt-6 rounded-xl border p-4 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.sectionAlt }}>
        <div className="h-5 w-48 rounded-md animate-pulse bg-neutral-200/80" />
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="h-[220px] w-full lg:w-[min(100%,420px)] shrink-0 rounded-xl animate-pulse bg-neutral-200/50" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg animate-pulse bg-neutral-200/40" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPostsSkeleton() {
  return (
    <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
      <div className="h-9 w-32 rounded-md animate-pulse bg-neutral-200/90" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[20px] animate-pulse" style={SKELETON_GRADIENT_CARD} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl animate-pulse bg-neutral-200/50" />
        ))}
      </div>
    </div>
  );
}

function AnalyticsReelsSkeleton() {
  return (
    <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
      <div className="h-9 w-28 rounded-md animate-pulse bg-neutral-200/90" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-[88px] rounded-lg animate-pulse bg-neutral-200/70" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[20px] animate-pulse" style={SKELETON_GRADIENT_CARD} />
        ))}
      </div>
      <div className="h-[300px] rounded-xl animate-pulse" style={SKELETON_CHART} />
    </div>
  );
}

function AnalyticsHistorySkeleton() {
  return (
    <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
      <div className="h-9 w-52 rounded-md animate-pulse bg-neutral-200/90" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-16 rounded-full animate-pulse bg-neutral-200/70" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(15,23,42,0.06)' }} />
        ))}
      </div>
    </div>
  );
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

/** Daily-rate metrics (impressions, engagements, views): one value per day in range; gaps are 0, not forward-filled. */
function dailyValuesOnAxis(dates: string[], map: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dates) {
    const v = map[d];
    out[d] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
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

function MinWidthBarShape(props: { x?: number; y?: number; width?: number; height?: number; fill?: string; radius?: [number, number, number, number] }) {
  const x = typeof props.x === 'number' ? props.x : 0;
  const y = typeof props.y === 'number' ? props.y : 0;
  const width = typeof props.width === 'number' ? props.width : 0;
  const height = typeof props.height === 'number' ? props.height : 0;
  const fill = props.fill ?? COLOR.violet;
  const minWidth = 10;
  const adjustedWidth = Math.max(width, minWidth);
  const adjustedX = x - ((adjustedWidth - width) / 2);
  const normalizedHeight = Math.abs(height);
  const normalizedY = height >= 0 ? y : y + height;

  const fallbackRadius: [number, number, number, number] = [6, 6, 0, 0];

  return (
    <Rectangle
      x={adjustedX}
      y={normalizedY}
      width={adjustedWidth}
      height={normalizedHeight}
      fill={fill}
      radius={props.radius ?? fallbackRadius}
      opacity={normalizedHeight > 0 ? 1 : 0}
    />
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
  tiktokApiHighlight,
}: {
  label: string;
  value: string;
  source: string;
  color: string;
  footnote?: string;
  trendPercent?: number | null;
  active?: boolean;
  onClick?: () => void;
  /** TikTok Open API–sourced metric (yellow neon ring). */
  tiktokApiHighlight?: boolean;
}) {
  const hint = `Source metric: ${source}${typeof trendPercent === 'number' && Number.isFinite(trendPercent) ? `. Change in selected range: ${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%.` : ''}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`rounded-[12px] px-3 py-1.5 text-left transition-all hover:-translate-y-[1px] ${tiktokApiHighlight ? TIKTOK_API_CARD_CLASS : ''}`}
      style={{
        background: active ? `${color}10` : COLOR.card,
        boxShadow: active ? '0 2px 16px rgba(15,23,42,0.06)' : '0 2px 16px rgba(15,23,42,0.05)',
      }}
    >
      <span className="text-xs font-medium tracking-tight" style={{ color: COLOR.textMuted }}>{label}</span>
      <p className="mt-1 text-[24px] font-semibold tracking-tight" style={{ color }}>{value}</p>
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
  tiktokApiHighlight?: boolean;
}) {
  const { label, source, color, value, series, footnote, active, onClick, tiktokApiHighlight } = props;
  const trendPercent = percentChangeFromSeries(series);
  return (
    <MetricCard
      label={label}
      source={source}
      color={color}
      value={value}
      footnote={footnote}
      trendPercent={trendPercent}
      active={active}
      onClick={onClick}
      tiktokApiHighlight={tiktokApiHighlight}
    />
  );
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
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
          <span className="absolute left-[16%] top-[20%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute right-[16%] top-[20%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute left-[16%] bottom-[30%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
          <span className="absolute right-[16%] bottom-[30%] text-[15px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.24)' }}>Agent4Socials</span>
        </div>
        <div className="relative z-10 h-full">{children}</div>
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
        <Bar dataKey="nonviral" stackId="a" fill={COLOR.violet} radius={[6, 6, 0, 0]} shape={<MinWidthBarShape />} />
        <Bar dataKey="viral" stackId="a" fill={COLOR.magenta} radius={[6, 6, 0, 0]} shape={<MinWidthBarShape />} />
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
                      {...pinterestCdnImgProps(p.thumbnailUrl)}
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
                <span className="shrink-0 text-sm font-semibold" style={{ color: metricColor }}>{formatNumber(p.value)}</span>
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
    avgWatchMs: number;
    reactionBreakdownRaw: unknown;
    status: 'Ready' | 'Partial';
    rawPost: FacebookPost;
  }>;
  onOpenDetail: (p: FacebookPost) => void;
}) {
  return (
    <div className="rounded-[20px] overflow-hidden" style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.06)' }}>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.02)', color: COLOR.textMuted }}>
            <tr>
              {[
                { label: 'Post preview', className: 'w-[240px]' },
                { label: 'Publish date', className: 'w-[132px]' },
                { label: 'Type', className: 'w-[60px]' },
                { label: 'Views', className: 'w-[58px]' },
                { label: 'Unique reach', className: 'w-[66px]' },
                { label: 'Clicks', className: 'w-[52px]' },
                { label: 'Likes', className: 'w-[52px]' },
                { label: 'Reactions', className: 'w-[76px]' },
                { label: 'Watch time', className: 'w-[84px]' },
                { label: 'Avg watch', className: 'w-[68px]' },
              ].map((h) => (
                <th
                  key={h.label}
                  className={`py-3 text-left font-medium ${h.className} ${h.label === 'Watch time' ? 'pl-5 pr-3' : 'px-3'}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t cursor-pointer hover:bg-[#f8fafc]" style={{ borderColor: COLOR.border }} onClick={() => onOpenDetail(r.rawPost)}>
                <td className="px-3 py-3" style={{ color: COLOR.textSecondary }}>
                  <div className="flex items-center gap-3 min-w-0">
                    {r.rawPost.thumbnailUrl ? (
                      <img
                        src={r.rawPost.thumbnailUrl}
                        alt=""
                        className="w-9 h-9 rounded object-cover shrink-0"
                        {...pinterestCdnImgProps(r.rawPost.thumbnailUrl)}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded shrink-0" style={{ background: 'rgba(124,108,255,0.12)' }} />
                    )}
                    <div className="min-w-0">
                      <p
                        className="text-[13px] leading-snug line-clamp-4"
                        style={{ color: COLOR.textSecondary }}
                        title={(r.preview || '').trim() || undefined}
                      >
                        {(r.preview || '').trim() || '—'}
                      </p>
                      {r.permalink ? (
                        <Link
                          href={r.permalink}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs mt-1"
                          style={{ color: COLOR.textSecondary }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open <ExternalLink size={12} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-xs leading-tight" style={{ color: COLOR.textSecondary }}>
                  {formatPostCardDateTime(r.date) || new Date(r.date).toLocaleDateString()}
                </td>
                <td className="px-3 py-3"><span className="rounded-full px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.08)', color: COLOR.text }}>{r.type}</span></td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.views)}</td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.uniqueReach)}</td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.clicks)}</td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.likes)}</td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.reactionsTotal)}</td>
                <td className="pl-5 pr-3 py-3" style={{ color: COLOR.textSecondary }}>{r.watchTimeMs > 0 ? formatDurationMs(r.watchTimeMs) : ' - '}</td>
                <td className="px-3 py-3" style={{ color: COLOR.textSecondary }}>{r.avgWatchMs > 0 ? formatDurationMs(r.avgWatchMs) : ' - '}</td>
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
            <div className="flex items-start gap-2">
              {r.rawPost.thumbnailUrl ? (
                <img
                  src={r.rawPost.thumbnailUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover shrink-0"
                  {...pinterestCdnImgProps(r.rawPost.thumbnailUrl)}
                />
              ) : (
                <div className="w-10 h-10 rounded shrink-0" style={{ background: 'rgba(124,108,255,0.12)' }} />
              )}
              <div className="min-w-0">
                <p className="text-sm line-clamp-5 leading-snug" style={{ color: COLOR.text }} title={(r.preview || '').trim() || undefined}>
                  {(r.preview || '').trim() || '—'}
                </p>
                {r.permalink ? (
                  <Link
                    href={r.permalink}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs mt-1"
                    style={{ color: COLOR.textSecondary }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open <ExternalLink size={12} />
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: COLOR.textSecondary }}>
              <span>{formatPostCardDateTime(r.date) || new Date(r.date).toLocaleDateString()}</span>
              <span>{r.type}</span>
              <span>Views {formatNumber(r.views)}</span>
              <span>{r.watchTimeMs > 0 ? `Watch ${formatDurationMs(r.watchTimeMs)}` : 'Watch -'}</span>
              <span>{r.avgWatchMs > 0 ? `Avg ${formatDurationMs(r.avgWatchMs)}` : 'Avg -'}</span>
              <span>Clicks {formatNumber(r.clicks)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type TopHighlightRow = {
  id: string;
  preview: string;
  permalink?: string | null;
  type: 'Reel' | 'Post';
  thumbnailUrl?: string | null;
  views: number;
  clicks: number;
  reactions: number;
  /** ISO or parseable publish time */
  publishedAt: string;
};

function TopContentHighlights({
  byViews,
  byClicks,
  byReactions,
}: {
  byViews: TopHighlightRow[];
  byClicks: TopHighlightRow[];
  byReactions: TopHighlightRow[];
}) {
  const rankBadge = (idx: number) => `/rank-badges/${Math.min(3, idx + 1)}.svg`;
  const col = (title: string, metricLabel: 'Views' | 'Clicks' | 'Reactions', rows: TopHighlightRow[]) => (
    <div className="space-y-3">
      <p className="text-base font-semibold tracking-tight" style={{ color: COLOR.text }}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: COLOR.textMuted }}>No items yet</p>
      ) : (
        rows.map((r, idx) => (
          <div key={`${title}-${r.id}-${idx}`} className="rounded-xl p-3" style={{ background: COLOR.elevated }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-[104px] pt-1">
                <div className="relative isolate mt-1 h-[92px] w-[92px]">
                  <div className="absolute inset-0 overflow-hidden rounded-xl border" style={{ borderColor: COLOR.border, background: '#f3f4f6' }}>
                    {r.thumbnailUrl ? (
                      <img
                        src={r.thumbnailUrl}
                        alt="Post thumbnail"
                        className="h-full w-full object-cover"
                        {...pinterestCdnImgProps(r.thumbnailUrl)}
                      />
                    ) : null}
                    {r.permalink ? (
                      <Link
                        href={r.permalink}
                        target="_blank"
                        className="absolute right-1.5 bottom-1.5 z-[1] inline-flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: 'rgba(17,24,39,0.72)', color: '#ffffff' }}
                        aria-label="Open post"
                      >
                        <ExternalLink size={11} />
                      </Link>
                    ) : null}
                  </div>
                  <img
                    src={rankBadge(idx)}
                    alt={`Rank ${idx + 1}`}
                    className="pointer-events-none absolute z-10 h-11 w-11 -translate-x-2 -translate-y-2 object-contain drop-shadow-md sm:h-12 sm:w-12 sm:-translate-x-2.5 sm:-translate-y-2.5"
                    style={{ left: 0, top: 0 }}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1 min-h-[92px] flex flex-col">
                <p className="text-[11px] leading-4 tabular-nums shrink-0" style={{ color: COLOR.textMuted }}>
                  {formatPostCardDateTime(r.publishedAt) || '—'}
                </p>
                <p
                  className="mt-1 min-h-0 text-[13px] leading-[18px] line-clamp-4"
                  style={{ color: COLOR.textSecondary }}
                  title={(r.preview || '').trim() || undefined}
                >
                  {(r.preview || '').trim() || 'View post'}
                </p>
                <div className="mt-auto pt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: COLOR.textMuted }}>
                  <span style={metricLabel === 'Views' ? { color: COLOR.text, fontWeight: 700, fontSize: 13 } : undefined}>Views {formatNumber(r.views)}</span>
                  <span style={metricLabel === 'Clicks' ? { color: COLOR.text, fontWeight: 700, fontSize: 13 } : undefined}>Clicks {formatNumber(r.clicks)}</span>
                  <span style={metricLabel === 'Reactions' ? { color: COLOR.text, fontWeight: 700, fontSize: 13 } : undefined}>Reactions {formatNumber(r.reactions)}</span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <section className="rounded-[20px] p-5" style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
      <div className="grid gap-4 lg:grid-cols-3">
        {col('Views leaders', 'Views', byViews)}
        {col('Clicks leaders', 'Clicks', byClicks)}
        {col('Reactions leaders', 'Reactions', byReactions)}
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
            <div className="rounded-lg p-2" style={{ background: 'rgba(95,246,253,0.09)', color: COLOR.cyan }}>Views<br /><span className="text-sm font-semibold">{formatNumber(views)}</span></div>
            <div className="rounded-lg p-2" style={{ background: 'rgba(94,230,168,0.09)', color: COLOR.mint }}>Organic<br /><span className="text-sm font-semibold">{formatNumber(organicViews)}</span></div>
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
  hasApiInsightsFetched = true,
  followersLabel,
  accountAvatarUrl,
  accountUsername,
}: FacebookAnalyticsViewProps) {
  /**
   * Full analytics shell (Overview, Traffic, Posts, Reels, History): first insights fetch (hasApiInsightsFetched false), or Facebook Page waiting for Graph bundle.
   * When the parent still has insights === null from the API, hasApiInsightsFetched is false so we do not flash zeros on any section.
   * Date-range refetches keep prior insights so hasApiInsightsFetched stays true and the UI stays stable.
   */
  const overviewSkeleton =
    insightsLoading &&
    (!hasApiInsightsFetched || (insights?.platform === 'FACEBOOK' && !insights?.facebookAnalytics));
  const [storyMode, setStoryMode] = useState<StoryMode>('growth');
  const [selectedStoryMetrics, setSelectedStoryMetrics] = useState<StoryMetricKey[]>(STORY_MODE_DEFAULT_METRICS.growth);
  const [selectedActivityMetrics, setSelectedActivityMetrics] = useState<ActivityMetricKey[]>(['posts', 'actions']);
  const [selectedEngagementMetrics, setSelectedEngagementMetrics] = useState<EngagementMetricKey[]>(['likes', 'comments', 'shares', 'reposts']);
  const [selectedTrafficMetrics, setSelectedTrafficMetrics] = useState<TrafficMetricKey[]>(['postImpressions', 'nonviral', 'viral', 'uniqueReachProxy']);
  const [selectedReelMetrics, setSelectedReelMetrics] = useState<ReelMetricKey[]>(['views', 'avgWatch']);
  const [reelPreset, setReelPreset] = useState<ReelPresetKey>('performance');
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

  const profile = insights?.facebookPageProfile;
  const isInstagram = insights?.platform?.toUpperCase() === 'INSTAGRAM';
  const isTikTok = insights?.platform?.toUpperCase() === 'TIKTOK';
  const tiktokUser = insights?.tiktokUser;
  const tiktokCreatorInfo = insights?.tiktokCreatorInfo;
  const igMetricSeries = insights?.facebookPageMetricSeries;
  const community = insights?.facebookCommunity;
  const resolvedUsername = (profile?.username ?? accountUsername ?? '').trim().replace(/^@/, '');
  const headerAvatarUrl = isTikTok ? (tiktokCreatorInfo?.creatorAvatarUrl ?? accountAvatarUrl) : accountAvatarUrl;

  const profileUrl = useMemo(() => {
    const plat = insights?.platform?.toUpperCase();
    const username = profile?.username?.trim().replace(/^@/, '') || accountUsername?.trim().replace(/^@/, '');
    if (plat === 'TIKTOK' && username) {
      return `https://www.tiktok.com/@${username}`;
    }
    if (plat === 'YOUTUBE' && username) {
      return `https://www.youtube.com/@${username}`;
    }
    if (plat === 'LINKEDIN' && username) {
      return `https://www.linkedin.com/in/${username}`;
    }
    if (plat === 'TWITTER' && username) {
      return `https://x.com/${username}`;
    }
    if (plat === 'INSTAGRAM' && username) {
      return `https://www.instagram.com/${username}/`;
    }
    if (plat === 'PINTEREST' && username) {
      return `https://www.pinterest.com/${username}/`;
    }
    if (username && plat === 'FACEBOOK') return `https://www.facebook.com/${username}`;
    if (profile?.username?.trim()) return `https://www.facebook.com/${profile.username.trim()}`;
    const website = profile?.website?.trim();
    if (website) return website;
    return null;
  }, [accountUsername, insights?.platform, profile?.username, profile?.website]);
  const postsInRange = useMemo(
    () => posts.filter((p) => inRange(p.publishedAt, dateRange.start, dateRange.end)),
    [posts, dateRange.end, dateRange.start]
  );
  const tiktokViewsInRange = useMemo(
    () => postsInRange.reduce((s, p) => s + (p.impressions ?? bestPostPlayCount(p)), 0),
    [postsInRange]
  );
  const tiktokEngagementsInRange = useMemo(
    () =>
      postsInRange.reduce((s, p) => s + (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0), 0),
    [postsInRange]
  );
  const videoPlaysDailySeries = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of postsInRange) {
      const d = localCalendarDateFromIso(p.publishedAt);
      map[d] = (map[d] ?? 0) + bestPostPlayCount(p);
    }
    return Object.entries(map)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [postsInRange]);
  const dateAxis = useMemo(() => buildDateAxis(dateRange.start, dateRange.end), [dateRange.end, dateRange.start]);
  const bundle = useMemo(() => {
    const native = insights?.facebookAnalytics;
    if (native) return native;
    if (insights && String(insights.platform).toUpperCase() === 'INSTAGRAM') {
      return buildInstagramSyntheticFacebookBundle(insights, postsInRange);
    }
    return undefined;
  }, [insights, postsInRange]);
  const series = bundle?.series;
  const latestFollowersFromSeries = insights?.followersTimeSeries?.length
    ? (insights.followersTimeSeries[insights.followersTimeSeries.length - 1]?.value ?? 0)
    : 0;
  const totalFollowers = isTikTok
    ? (tiktokUser?.followerCount ?? insights?.followers ?? 0)
    : Math.max(
        profile?.followers_count ?? 0,
        profile?.fan_count ?? 0,
        insights?.followers ?? 0,
        latestFollowersFromSeries
      );
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
  const contentViews = isTikTok
    ? tiktokViewsInRange
    : isInstagram
      ? Math.max(0, insights.impressionsTotal ?? 0, bundle?.totals.contentViews ?? 0)
      : (bundle?.totals.contentViews ?? 0);
  const pageVisits = isTikTok
    ? 0
    : isInstagram
      ? Math.max(0, insights.profileViewsTotal ?? bundle?.totals.pageTabViews ?? 0)
      : (bundle?.totals.pageTabViews ?? 0);
  const engagements = isTikTok
    ? tiktokEngagementsInRange
    : isInstagram
      ? Math.max(0, insights?.accountsEngaged ?? 0, bundle?.totals.engagement ?? 0)
      : (bundle?.totals.engagement ?? 0);
  const actionsSeries = (bundle?.series.totalActions?.length ?? 0) > 0 ? bundle?.series.totalActions : (bundle?.series.engagement ?? []);
  const actionsTotal = (bundle?.totals.totalActions ?? 0) > 0 ? (bundle?.totals.totalActions ?? 0) : engagements;
  const pageVideoViews = bundle?.totals.videoViews ?? 0;
  const postVideoPlaysInRange = useMemo(() => sumPostLevelVideoPlays(postsInRange), [postsInRange]);
  const igAccountVideoViewsTotal = insights?.instagramAccountVideoViewsTotal ?? 0;
  const videoViews = isTikTok
    ? tiktokViewsInRange
    : Math.max(pageVideoViews, postVideoPlaysInRange, isInstagram ? igAccountVideoViewsTotal : 0);
  const postImpressions = bundle?.totals.postImpressions ?? 0;
  const nonviralImpressions = bundle?.totals.postImpressionsNonviral ?? 0;
  const viralImpressions = bundle?.totals.postImpressionsViral ?? 0;
  const uniqueReachProxy = postsInRange.reduce((s, p) => s + (p.facebookInsights?.post_impressions_unique ?? 0), 0);

  const chartByMode = useMemo(() => {
    if (isTikTok) {
      const viewsByDate: Record<string, number> = {};
      const engagementByDate: Record<string, number> = {};
      for (const p of postsInRange) {
        const d = localCalendarDateFromIso(p.publishedAt);
        if (!d) continue;
        viewsByDate[d] = (viewsByDate[d] ?? 0) + (p.impressions ?? bestPostPlayCount(p));
        engagementByDate[d] =
          (engagementByDate[d] ?? 0) + (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0);
      }
      const followsRaw: Record<string, number> = {};
      const likesRaw: Record<string, number> = {};
      const videoCountRaw: Record<string, number> = {};
      dateAxis.forEach((d) => {
        followsRaw[d] = totalFollowers;
        likesRaw[d] = tiktokUser?.likesCount ?? 0;
        videoCountRaw[d] = tiktokUser?.videoCount ?? 0;
      });
      const media = carryForwardSeries(dateAxis, likesRaw, 0);
      const visits = carryForwardSeries(dateAxis, videoCountRaw, 0);
      const videoViewsSeries = carryForwardSeries(dateAxis, viewsByDate, 0);
      const engagement = carryForwardSeries(dateAxis, engagementByDate, 0);
      const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers);
      return dateAxis.map((date) => ({
        date,
        followers: follows[date] ?? 0,
        engagements: engagement[date] ?? 0,
        videoViews: videoViewsSeries[date] ?? 0,
        contentViews: media[date] ?? 0,
        pageVisits: visits[date] ?? 0,
      }));
    }
    let mediaRaw: Record<string, number>;
    let visitsRaw: Record<string, number>;
    let videoViewsRaw: Record<string, number>;
    let engagementRaw: Record<string, number>;
    let followsRaw: Record<string, number>;

    if (isInstagram) {
      const ms = igMetricSeries;
      const mergedImpressionsSeries = insights?.impressionsTimeSeries?.length
        ? insights.impressionsTimeSeries
        : ms?.impressions ?? [];
      if (ms && Object.keys(ms).length > 0) {
        mediaRaw = seriesToMap(mergedImpressionsSeries);
        const msProfileViews = seriesToMap(ms.profile_views ?? []);
        const msAccountsEngaged = seriesToMap(ms.accounts_engaged ?? []);
        visitsRaw = Object.keys(msProfileViews).length > 0 ? msProfileViews : seriesToMap(series?.pageTabViews ?? []);
        engagementRaw = Object.keys(msAccountsEngaged).length > 0 ? msAccountsEngaged : seriesToMap(series?.engagement ?? []);
        followsRaw = insights?.followersTimeSeries?.length
          ? seriesToMap(insights.followersTimeSeries)
          : seriesToMap(series?.follows ?? []);
        videoViewsRaw = mergeSeriesMapsMax(seriesToMap(ms.views ?? []), seriesToMap(videoPlaysDailySeries));
      } else {
        mediaRaw = seriesToMap(insights?.impressionsTimeSeries ?? []);
        visitsRaw = {};
        engagementRaw = {};
        followsRaw = insights?.followersTimeSeries?.length
          ? seriesToMap(insights.followersTimeSeries)
          : seriesToMap(series?.follows ?? []);
        videoViewsRaw = seriesToMap(videoPlaysDailySeries);
      }
    } else {
      mediaRaw = seriesToMap(series?.contentViews ?? []);
      visitsRaw = seriesToMap(series?.pageTabViews ?? []);
      videoViewsRaw = seriesToMap(series?.videoViews ?? []);
      engagementRaw = seriesToMap(series?.engagement ?? []);
      followsRaw = seriesToMap(series?.follows ?? []);
    }

    const media = dailyValuesOnAxis(dateAxis, mediaRaw);
    const visits = dailyValuesOnAxis(dateAxis, visitsRaw);
    const videoViewsSeries = dailyValuesOnAxis(dateAxis, videoViewsRaw);
    const engagement = dailyValuesOnAxis(dateAxis, engagementRaw);
    const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers);
    return dateAxis.map((date) => ({
      date,
      followers: follows[date] ?? 0,
      engagements: engagement[date] ?? 0,
      videoViews: videoViewsSeries[date] ?? 0,
      contentViews: media[date] ?? 0,
      pageVisits: visits[date] ?? 0,
    }));
  }, [
    isTikTok,
    isInstagram,
    igMetricSeries,
    dateAxis,
    postsInRange,
    series?.contentViews,
    series?.engagement,
    series?.follows,
    series?.pageTabViews,
    series?.videoViews,
    insights?.followersTimeSeries,
    insights?.impressionsTimeSeries,
    videoPlaysDailySeries,
    totalFollowers,
  ]);

  const growthSparklineSeries = useMemo(() => {
    if (isTikTok) {
      const viewsSeries = aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p));
      const engSeries = aggregatePostsByDayValue(
        postsInRange,
        (p) => (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0)
      );
      const start = dateRange.start.slice(0, 10);
      const end = dateRange.end.slice(0, 10);
      const ff = totalFollowers;
      const profileLikes = tiktokUser?.likesCount ?? 0;
      const profileVideos = tiktokUser?.videoCount ?? 0;
      return {
        follows: [
          { date: start, value: ff },
          { date: end, value: ff },
        ],
        engagement: engSeries,
        videoViews: viewsSeries,
        contentViews: [
          { date: start, value: profileLikes },
          { date: end, value: profileLikes },
        ],
        pageVisits: [
          { date: start, value: profileVideos },
          { date: end, value: profileVideos },
        ],
      };
    }
    if (!isInstagram) {
      return {
        follows: series?.follows ?? [],
        engagement: series?.engagement ?? [],
        videoViews: series?.videoViews ?? [],
        contentViews: series?.contentViews ?? [],
        pageVisits: series?.pageTabViews ?? [],
      };
    }
    const ms = igMetricSeries;
    const contentSpark = insights?.impressionsTimeSeries?.length
      ? insights.impressionsTimeSeries
      : ms?.impressions?.length
        ? ms.impressions
        : (insights?.impressionsTimeSeries ?? []);
    const videoSparkMap = mergeSeriesMapsMax(
      seriesToMap(ms?.views ?? []),
      seriesToMap(videoPlaysDailySeries)
    );
    return {
      follows: insights?.followersTimeSeries ?? series?.follows ?? [],
      engagement: ms?.accounts_engaged ?? [],
      videoViews: mapToSortedSeries(videoSparkMap),
      contentViews: contentSpark,
      pageVisits: ms?.profile_views ?? [],
    };
  }, [
    isTikTok,
    isInstagram,
    igMetricSeries,
    series?.follows,
    series?.engagement,
    series?.videoViews,
    series?.contentViews,
    series?.pageTabViews,
    insights?.followersTimeSeries,
    insights?.impressionsTimeSeries,
    videoPlaysDailySeries,
    postsInRange,
    dateRange.end,
    dateRange.start,
    totalFollowers,
    tiktokUser?.likesCount,
    tiktokUser?.videoCount,
  ]);

  const stackedTraffic = useMemo(() => {
    const nonviral = seriesToMap(series?.postImpressionsNonviral ?? []);
    const viral = seriesToMap(series?.postImpressionsViral ?? []);
    return dateAxis.map((date) => ({ date, nonviral: nonviral[date] ?? 0, viral: viral[date] ?? 0 }));
  }, [dateAxis, series?.postImpressionsNonviral, series?.postImpressionsViral]);

  const uniqueReachByDate = useMemo(() => {
    const map: Record<string, number> = {};
    postsInRange.forEach((p) => {
      const d = localCalendarDateFromIso(p.publishedAt);
      map[d] = (map[d] ?? 0) + (p.facebookInsights?.post_impressions_unique ?? 0);
    });
    return map;
  }, [postsInRange]);
  const trafficTimelineData = useMemo(() => {
    const postImpressionsMap = seriesToMap(series?.postImpressions ?? []);
    const nonviralMap = seriesToMap(series?.postImpressionsNonviral ?? []);
    const viralMap = seriesToMap(series?.postImpressionsViral ?? []);
    return dateAxis.map((date) => {
      const nonviral = nonviralMap[date] ?? 0;
      const viral = viralMap[date] ?? 0;
      const postImpressionsFromApi = postImpressionsMap[date] ?? 0;
      return {
        date,
        postImpressions: postImpressionsFromApi > 0 ? postImpressionsFromApi : nonviral + viral,
        nonviral,
        viral,
        uniqueReachProxy: uniqueReachByDate[date] ?? 0,
      };
    });
  }, [dateAxis, series?.postImpressions, series?.postImpressionsNonviral, series?.postImpressionsViral, uniqueReachByDate]);

  const postsRows = useMemo(() => {
    return postsInRange.map((p) => {
      const fi = p.facebookInsights ?? {};
      const reactions = parseReactionTotal(fi.post_reactions_by_type_total);
      const isReel = isReelPost(p);
      const hasCore = typeof fi.post_media_view === 'number' || typeof fi.post_impressions_unique === 'number';
      const { watchTimeMs, avgWatchMs } = getWatchTimes(p);
      return {
        id: p.id,
        date: p.publishedAt,
        type: isReel ? ('Reel' as const) : ('Post' as const),
        preview: p.content ?? '',
        permalink: p.permalinkUrl,
        views: bestPostPlayCount(p),
        uniqueReach: fi.post_impressions_unique ?? 0,
        clicks: fi.post_clicks ?? 0,
        likes: bestCount(fi.post_reactions_like_total, p.likeCount),
        reactionsTotal: reactions || bestCount(fi.post_reactions_like_total, p.likeCount),
        watchTimeMs,
        avgWatchMs,
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
        avgWatchMs: r.avgWatchMs ?? 0,
        watchTimeMs: r.watchTimeMs ?? 0,
      }));
  }, [postsRows]);

  const reelsChartData = useMemo(() => {
    return reelsRows.map((r) => {
      const date = r.post.publishedAt.slice(0, 10);
      return {
        date,
        views: r.views,
        watchTimeMinutes: (r.watchTimeMs ?? 0) / 60000,
        avgWatchSeconds: r.avgWatchMs / 1000,
        clicks: r.post.facebookInsights?.post_clicks ?? 0,
        likes: bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount),
        comments: r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0,
        shares: r.post.facebookInsights?.post_shares ?? r.post.sharesCount ?? 0,
        reposts: r.post.repostsCount ?? r.post.facebookInsights?.post_shares ?? 0,
        thumbnailUrl: r.post.thumbnailUrl ?? null,
      };
    });
  }, [reelsRows]);

  const selectedStoryMetricsForMode = useMemo(
    () => selectedStoryMetrics.filter((metric) => STORY_METRIC_CONFIG[metric].mode === storyMode),
    [selectedStoryMetrics, storyMode]
  );
  const storyTicks = useMemo(
    () => buildKeyDateTicks(chartByMode, (d) => selectedStoryMetricsForMode.some((metric) => (d[metric] ?? 0) > 0), 10),
    [chartByMode, selectedStoryMetricsForMode]
  );
  const trafficTicks = useMemo(
    () => buildKeyDateTicks(trafficTimelineData, (d) => (d.postImpressions ?? 0) > 0 || (d.nonviral ?? 0) > 0 || (d.viral ?? 0) > 0 || (d.uniqueReachProxy ?? 0) > 0, 10),
    [trafficTimelineData]
  );
  const audienceCountryPieData = useMemo(() => {
    const rows = insights?.audienceByCountry?.rows ?? [];
    return rows.map((r) => ({ name: r.country, value: r.value, percent: r.percent }));
  }, [insights?.audienceByCountry?.rows]);
  const reelsTicks = useMemo(
    () => buildKeyDateTicks(reelsChartData, (d) => (d.views ?? 0) > 0 || (d.watchTimeMinutes ?? 0) > 0 || (d.avgWatchSeconds ?? 0) > 0, 10),
    [reelsChartData]
  );

  const avgPostsPerWeek = postsInRange.length / Math.max(1, dateAxis.length / 7);
  const avgClicksPerPost = postsRows.reduce((s, r) => s + r.clicks, 0) / Math.max(1, postsRows.length);
  const avgReactionsPerPost = postsRows.reduce((s, r) => s + r.reactionsTotal, 0) / Math.max(1, postsRows.length);
  const totalReelWatchTimeMs = postsRows.filter((r) => r.type === 'Reel').reduce((s, r) => s + r.watchTimeMs, 0);
  const reelClicks = reelsRows.reduce((s, r) => s + (r.post.facebookInsights?.post_clicks ?? 0), 0);
  const reelLikes = reelsRows.reduce((s, r) => s + bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount), 0);
  const reelComments = reelsRows.reduce((s, r) => s + (r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0), 0);
  const reelShares = reelsRows.reduce((s, r) => s + (r.post.facebookInsights?.post_shares ?? r.post.sharesCount ?? 0), 0);
  const reelReposts = reelsRows.reduce((s, r) => s + (r.post.repostsCount ?? r.post.facebookInsights?.post_shares ?? 0), 0);
  const totalOrganicVideoViews = reelsRows.reduce((s, r) => s + r.organicViews, 0);
  const totalReelVideoViews = reelsRows.reduce((s, r) => s + r.views, 0);
  const avgWatchMs = totalReelVideoViews > 0 ? totalReelWatchTimeMs / totalReelVideoViews : 0;
  const viewToClickEfficiency =
    reelsRows.reduce((s, r) => s + (r.post.facebookInsights?.post_clicks ?? 0), 0) / Math.max(1, totalReelVideoViews);
  const storyModeHoverHint = useMemo(() => {
    const fmt = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'n/a');
    const follows = growthSparklineSeries.follows;
    const engagement = growthSparklineSeries.engagement;
    const videoViewsS = growthSparklineSeries.videoViews;
    const contentViewsS = growthSparklineSeries.contentViews;
    const pageTabS = growthSparklineSeries.pageVisits;
    return {
      growth: `Followers: ${fmt(percentChangeFromSeries(follows))}`,
      engagement: `Engagements: ${fmt(percentChangeFromSeries(engagement))}`,
      views: `Video Views: ${fmt(percentChangeFromSeries(videoViewsS))} | Content Views: ${fmt(percentChangeFromSeries(contentViewsS))} | Page Visits: ${fmt(percentChangeFromSeries(pageTabS))}`,
    } as const;
  }, [growthSparklineSeries]);
  const likesTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + bestCount(post.facebookInsights?.post_reactions_like_total, post.likeCount ?? post.engagementBreakdown?.reactions), 0), [postsInRange]);
  const commentsTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_comments ?? post.commentsCount ?? post.engagementBreakdown?.comments ?? 0), 0), [postsInRange]);
  const sharesTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_shares ?? post.sharesCount ?? post.engagementBreakdown?.shares ?? 0), 0), [postsInRange]);
  const repostsTotal = useMemo(() => postsInRange.reduce((sum, post) => sum + (post.repostsCount ?? post.facebookInsights?.post_shares ?? post.sharesCount ?? 0), 0), [postsInRange]);
  const totalActions = actionsTotal;
  const engagementData = useMemo(() => {
    const likesByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + bestCount(post.facebookInsights?.post_reactions_like_total, post.likeCount ?? post.engagementBreakdown?.reactions);
      return acc;
    }, {});
    const commentsByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + (post.facebookInsights?.post_comments ?? post.commentsCount ?? post.engagementBreakdown?.comments ?? 0);
      return acc;
    }, {});
    const sharesByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + (post.facebookInsights?.post_shares ?? post.sharesCount ?? post.engagementBreakdown?.shares ?? 0);
      return acc;
    }, {});
    return dateAxis.map((date) => ({
      date,
      likes: likesByDate[date] ?? 0,
      comments: commentsByDate[date] ?? 0,
      shares: sharesByDate[date] ?? 0,
      reposts: postsInRange
        .filter((post) => localCalendarDateFromIso(post.publishedAt) === date)
        .reduce((sum, post) => sum + (post.repostsCount ?? post.facebookInsights?.post_shares ?? post.sharesCount ?? 0), 0),
    }));
  }, [dateAxis, postsInRange]);
  const engagementTicks = useMemo(
    () => buildKeyDateTicks(engagementData, (d) => (d.likes ?? 0) > 0 || (d.comments ?? 0) > 0 || (d.shares ?? 0) > 0 || (d.reposts ?? 0) > 0, 10),
    [engagementData]
  );
  const operationalData = useMemo(() => {
    const actionsRaw = seriesToMap(actionsSeries ?? []);
    // Use per-day values for Actions so the line reflects daily fluctuation
    // instead of turning into a step/flat line from carry-forwarded totals.
    const actions = dailyValuesOnAxis(dateAxis, actionsRaw);
    const hasActionPoints = Object.values(actionsRaw).some((value) => Number(value) > 0);
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
    const distributedActionsByDate: Record<string, number> = {};
    if (hasActionPoints) {
      dateAxis.forEach((date) => {
        distributedActionsByDate[date] = actions[date] ?? 0;
      });
    } else if (totalActions > 0) {
      const postWeightTotal = Object.values(postsByDate).reduce((sum, value) => sum + value, 0);
      const convoWeightTotal = Object.values(conversationsByDate).reduce((sum, value) => sum + value, 0);
      if (postWeightTotal > 0) {
        dateAxis.forEach((date) => {
          distributedActionsByDate[date] = ((postsByDate[date] ?? 0) / postWeightTotal) * totalActions;
        });
      } else if (convoWeightTotal > 0) {
        dateAxis.forEach((date) => {
          distributedActionsByDate[date] = ((conversationsByDate[date] ?? 0) / convoWeightTotal) * totalActions;
        });
      } else {
        const lastDate = dateAxis[dateAxis.length - 1] ?? '';
        dateAxis.forEach((date) => {
          distributedActionsByDate[date] = date === lastDate ? totalActions : 0;
        });
      }
    }
    return dateAxis.map((date) => ({
      date,
      actions: distributedActionsByDate[date] ?? 0,
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
      const { watchTimeMs, avgWatchMs } = getWatchTimes(p);
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
        watchTimeMs,
        avgWatchMs,
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
                title={
                  insights?.platform === 'PINTEREST'
                    ? 'Open Pinterest profile'
                    : insights?.platform === 'INSTAGRAM'
                      ? 'Open Instagram profile'
                      : insights?.platform === 'TIKTOK'
                        ? 'Open TikTok profile'
                        : insights?.platform === 'YOUTUBE'
                          ? 'Open YouTube profile'
                          : insights?.platform === 'LINKEDIN'
                            ? 'Open LinkedIn profile'
                            : insights?.platform === 'TWITTER'
                              ? 'Open X profile'
                        : 'Open Facebook profile'
                }
                className="shrink-0"
              >
                <div
                  className="h-11 w-11 overflow-hidden rounded-full"
                  style={{ display: headerAvatarUrl ? 'block' : 'none' }}
                >
                  {headerAvatarUrl ? (
                    <img
                      src={headerAvatarUrl}
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
                style={{ display: headerAvatarUrl ? 'block' : 'none' }}
              >
                {headerAvatarUrl ? (
                  <img
                    src={headerAvatarUrl}
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
                display: headerAvatarUrl ? 'none' : 'flex',
              }}
            >
              {(
                profile?.name ||
                resolvedUsername ||
                (insights?.platform === 'PINTEREST'
                  ? 'PI'
                  : insights?.platform === 'INSTAGRAM'
                    ? 'IG'
                    : insights?.platform === 'YOUTUBE'
                      ? 'YT'
                      : insights?.platform === 'TIKTOK'
                        ? 'TT'
                        : 'FB')
              ).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: COLOR.text }}>
                {isTikTok
                  ? (tiktokCreatorInfo?.creatorNickname ?? tiktokUser?.displayName ?? resolvedUsername ?? 'TikTok')
                  : profile?.name?.trim() ||
                    resolvedUsername ||
                    (insights?.platform === 'INSTAGRAM'
                      ? 'Instagram'
                      : insights?.platform === 'PINTEREST'
                        ? 'Pinterest'
                        : insights?.platform === 'YOUTUBE'
                          ? 'YouTube'
                          : 'Facebook Page')}
              </h1>
              <p className="text-sm" style={{ color: COLOR.textSecondary }}>
                @
                {isTikTok ? (tiktokCreatorInfo?.creatorUsername ?? resolvedUsername ?? 'unknown') : resolvedUsername || 'unknown'}
                {profile?.category ? `  •  ${profile.category}` : ''}
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
            {insights?.platform === 'PINTEREST'
              ? 'Updating pins from Pinterest, tables will refresh when sync finishes.'
              : insights?.platform === 'TIKTOK'
                ? 'Syncing videos from TikTok, tables will refresh when sync finishes.'
                : 'Updating posts and reels from Facebook, tables will refresh when sync finishes.'}
          </p>
        ) : null}
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-28 space-y-4">
        {overviewSkeleton ? (
          <>
            <div
              className="rounded-[20px] border p-4 sm:p-5 space-y-4"
              style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}
            >
              <div className="h-6 w-36 max-w-[50%] rounded-md animate-pulse bg-neutral-200/90" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 w-[88px] rounded-lg animate-pulse bg-neutral-200/80" />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-[20px] animate-pulse"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
                      boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
                    }}
                  />
                ))}
              </div>
              <div
                className="h-[300px] rounded-xl animate-pulse"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
                  boxShadow: '0 14px 30px rgba(15,23,42,0.09)',
                }}
              />
            </div>
            <div
              className="rounded-[20px] border p-4 sm:p-5 space-y-4"
              style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}
            >
              <div className="h-6 w-32 max-w-[45%] rounded-md animate-pulse bg-neutral-200/90" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-[20px] animate-pulse"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
                      boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
                    }}
                  />
                ))}
              </div>
              <div
                className="h-[300px] rounded-xl animate-pulse"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
                  boxShadow: '0 14px 30px rgba(15,23,42,0.09)',
                }}
              />
            </div>
            <div
              className="rounded-[20px] border p-4 sm:p-5 space-y-4"
              style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}
            >
              <div className="h-6 w-28 max-w-[40%] rounded-md animate-pulse bg-neutral-200/90" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-[20px] animate-pulse"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95))',
                      boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
                    }}
                  />
                ))}
              </div>
              <div
                className="h-[300px] rounded-xl animate-pulse"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
                  boxShadow: '0 14px 30px rgba(15,23,42,0.09)',
                }}
              />
            </div>
          </>
        ) : (
        <>
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance</h3>
          </div>
          <div className="mb-5 flex gap-2">
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
          {isTikTok ? (
            <>
              <div className="mb-3 rounded-xl border border-[#ca8a04]/50 bg-[rgba(250,204,21,0.09)] px-3 py-2 text-xs text-neutral-800">
                <span className="font-semibold text-[#854d0e]">TikTok Open API</span> — Yellow outline = data from{' '}
                <code className="rounded bg-neutral-200/80 px-1 font-mono text-[11px]">user.info</code>,{' '}
                <code className="rounded bg-neutral-200/80 px-1 font-mono text-[11px]">video/list</code> (synced posts), or{' '}
                <code className="rounded bg-neutral-200/80 px-1 font-mono text-[11px]">post/publish/creator_info</code>. Sparklines use the selected date range where applicable.
              </div>
              {tiktokCreatorInfo ? (
                <div className={`mb-3 rounded-[16px] p-4 space-y-2 ${TIKTOK_API_CARD_CLASS}`}>
                  <p className="text-sm font-semibold text-neutral-900">Creator &amp; publish settings</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm text-neutral-800">
                    {typeof tiktokCreatorInfo.maxVideoPostDurationSec === 'number' ? (
                      <p>
                        <span className="text-neutral-500">Max upload length · </span>
                        {Math.round(tiktokCreatorInfo.maxVideoPostDurationSec / 60)} min (
                        {tiktokCreatorInfo.maxVideoPostDurationSec}s)
                      </p>
                    ) : null}
                    {tiktokCreatorInfo.privacyLevelOptions && tiktokCreatorInfo.privacyLevelOptions.length > 0 ? (
                      <p>
                        <span className="text-neutral-500">Privacy options · </span>
                        {tiktokCreatorInfo.privacyLevelOptions.join(', ')}
                      </p>
                    ) : null}
                    <p>
                      <span className="text-neutral-500">Interaction toggles · </span>
                      comments {tiktokCreatorInfo.commentDisabled ? 'off' : 'on'}, duets{' '}
                      {tiktokCreatorInfo.duetDisabled ? 'off' : 'on'}, stitch {tiktokCreatorInfo.stitchDisabled ? 'off' : 'on'}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SparklineMetricCard
                  label="Followers"
                  source="user.info (stats) · follower_count"
                  color={COLOR.mint}
                  value={formatNumber(totalFollowers)}
                  series={growthSparklineSeries.follows}
                  active={isCardSelected('followers')}
                  onClick={() => toggleStoryMetric('followers')}
                  tiktokApiHighlight
                />
                <SparklineMetricCard
                  label="Profile likes"
                  source="user.info (stats) · likes_count (lifetime on account)"
                  color={COLOR.violet}
                  value={
                    typeof tiktokUser?.likesCount === 'number' ? formatNumber(tiktokUser.likesCount) : '—'
                  }
                  series={growthSparklineSeries.contentViews}
                  active={isCardSelected('contentViews')}
                  onClick={() => toggleStoryMetric('contentViews')}
                  tiktokApiHighlight
                />
                <SparklineMetricCard
                  label="Public videos"
                  source="user.info (stats) · video_count"
                  color={COLOR.magenta}
                  value={
                    typeof tiktokUser?.videoCount === 'number' ? formatNumber(tiktokUser.videoCount) : '—'
                  }
                  series={growthSparklineSeries.pageVisits}
                  active={isCardSelected('pageVisits')}
                  onClick={() => toggleStoryMetric('pageVisits')}
                  tiktokApiHighlight
                />
                <SparklineMetricCard
                  label="Total video views"
                  source="video/list · view_count summed from synced videos (all-time)"
                  color={COLOR.amber}
                  value={formatNumber(insights?.impressionsTotal ?? 0)}
                  series={growthSparklineSeries.videoViews}
                  footnote="Sparkline = views in selected range; headline = all-time synced total"
                  active={isCardSelected('videoViews')}
                  onClick={() => toggleStoryMetric('videoViews')}
                  tiktokApiHighlight
                />
                <SparklineMetricCard
                  label="Engagements (range)"
                  source="video/list · like_count + comment_count + shares on posts in range"
                  color={COLOR.coral}
                  value={formatNumber(tiktokEngagementsInRange)}
                  series={growthSparklineSeries.engagement}
                  active={isCardSelected('engagements')}
                  onClick={() => toggleStoryMetric('engagements')}
                  tiktokApiHighlight
                />
              </div>
            </>
          ) : (
          <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SparklineMetricCard
              label="Followers"
              source={isInstagram ? 'Instagram profile (followers_count)' : 'fan_count/followers_count'}
              color={COLOR.mint}
              value={formatNumber(totalFollowers)}
              series={growthSparklineSeries.follows}
              active={isCardSelected('followers')}
              onClick={() => toggleStoryMetric('followers')}
            />
            <SparklineMetricCard
              label="Engagements"
              source={isInstagram ? 'accounts_engaged' : 'page_post_engagements'}
              color={COLOR.violet}
              value={formatNumber(engagements)}
              series={growthSparklineSeries.engagement}
              active={isCardSelected('engagements')}
              onClick={() => toggleStoryMetric('engagements')}
            />
            <SparklineMetricCard
              label="Video Views"
              source={
                isInstagram
                  ? 'Synced post and reel plays in range'
                  : 'page_video_views, post_video_views, post_media_view'
              }
              color={COLOR.magenta}
              value={formatNumber(videoViews)}
              series={growthSparklineSeries.videoViews}
              active={isCardSelected('videoViews')}
              onClick={() => toggleStoryMetric('videoViews')}
            />
            <SparklineMetricCard
              label="Content Views"
              source={isInstagram ? 'impressions (media)' : 'page_media_view'}
              color={COLOR.amber}
              value={formatNumber(contentViews)}
              series={growthSparklineSeries.contentViews}
              active={isCardSelected('contentViews')}
              onClick={() => toggleStoryMetric('contentViews')}
            />
            <SparklineMetricCard
              label="Page Visits"
              source={isInstagram ? 'profile_views' : 'page_views_total'}
              color={COLOR.coral}
              value={formatNumber(pageVisits)}
              series={growthSparklineSeries.pageVisits}
              active={isCardSelected('pageVisits')}
              onClick={() => toggleStoryMetric('pageVisits')}
            />
          </div>
          )}
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedStoryMetricsForMode.map((metric) => (
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
          {selectedStoryMetricsForMode.length === 0 ? (
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
                <YAxis
                  domain={[0, 'auto']}
                  allowDecimals={selectedStoryMetricsForMode.some((metric) => metric !== 'followers')}
                  tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [formatNumber(Number(v) || 0), n && n in STORY_METRIC_CONFIG ? STORY_METRIC_CONFIG[n as StoryMetricKey].label : String(n ?? '')]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedStoryMetricsForMode.map((metric) => (
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
              source={isTikTok ? 'video/list · like_count (synced posts)' : 'post_reactions_like_total'}
              color={ENGAGEMENT_METRIC_CONFIG.likes.color}
              value={formatNumber(likesTotal)}
              active={selectedEngagementMetrics.includes('likes')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('likes') ? prev.filter((m) => m !== 'likes') : [...prev, 'likes'])}
              tiktokApiHighlight={isTikTok}
            />
            <MetricCard
              label="Comments"
              source={isTikTok ? 'video/list · comment_count (synced posts)' : 'post_comments'}
              color={ENGAGEMENT_METRIC_CONFIG.comments.color}
              value={formatNumber(commentsTotal)}
              active={selectedEngagementMetrics.includes('comments')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('comments') ? prev.filter((m) => m !== 'comments') : [...prev, 'comments'])}
              tiktokApiHighlight={isTikTok}
            />
            <MetricCard
              label="Shares"
              source={isTikTok ? 'video/list · share_count when present (synced)' : 'post_shares'}
              color={ENGAGEMENT_METRIC_CONFIG.shares.color}
              value={formatNumber(sharesTotal)}
              active={selectedEngagementMetrics.includes('shares')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
              tiktokApiHighlight={isTikTok}
            />
            <MetricCard
              label="Reposts"
              source={isTikTok ? 'Not in standard video/list fields; often 0' : 'Proxy from post_shares'}
              color={ENGAGEMENT_METRIC_CONFIG.reposts.color}
              value={formatNumber(repostsTotal)}
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
            <div className="h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={engagementData}
                barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                barGap={UNIFIED_BAR_GAP}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" ticks={engagementTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                <YAxis domain={[0, (dataMax: number) => Math.max(4, Math.ceil((dataMax || 0) + 1))]} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  shared
                  cursor={{ fill: 'rgba(107,114,128,0.20)' }}
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [
                    formatNumber(Number(v) || 0),
                    n === 'likes' ? 'Likes' : n === 'comments' ? 'Comments' : n === 'shares' ? 'Shares' : 'Reposts',
                  ]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedEngagementMetrics.includes('likes') ? <Bar dataKey="likes" fill={ENGAGEMENT_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedEngagementMetrics.includes('comments') ? <Bar dataKey="comments" fill={ENGAGEMENT_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedEngagementMetrics.includes('shares') ? <Bar dataKey="shares" fill={ENGAGEMENT_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedEngagementMetrics.includes('reposts') ? <Bar dataKey="reposts" fill={ENGAGEMENT_METRIC_CONFIG.reposts.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}
          </InsightChartCard>
        </div>

        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Activity</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Actions"
            source={(bundle?.series.totalActions?.length ?? 0) > 0 ? 'page_total_actions' : 'page_post_engagements (fallback)'}
            color={ACTIVITY_METRIC_CONFIG.actions.color}
            value={formatNumber(totalActions)}
            active={selectedActivityMetrics.includes('actions')}
            onClick={() => setSelectedActivityMetrics((prev) => prev.includes('actions') ? prev.filter((m) => m !== 'actions') : [...prev, 'actions'])}
          />
          <MetricCard
            label="Posts"
            source="Derived from posts feed"
            color={ACTIVITY_METRIC_CONFIG.posts.color}
            value={formatNumber(postsInRange.length)}
            active={selectedActivityMetrics.includes('posts')}
            onClick={() => setSelectedActivityMetrics((prev) => prev.includes('posts') ? prev.filter((m) => m !== 'posts') : [...prev, 'posts'])}
          />
          <MetricCard
            label="Conversations"
            source="Messenger conversations"
            color={ACTIVITY_METRIC_CONFIG.conversations.color}
            value={formatNumber(conversationActivityCount)}
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
        </>
        )}

      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.traffic} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsTrafficSkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Traffic</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Post Impressions"
              source="page_posts_impressions"
              color={COLOR.cyan}
              value={formatNumber(postImpressions)}
              active={selectedTrafficMetrics.includes('postImpressions')}
              onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('postImpressions') ? prev.filter((m) => m !== 'postImpressions') : [...prev, 'postImpressions'])}
            />
            <MetricCard
              label="Non-viral Impressions"
              source="page_posts_impressions_nonviral"
              color={COLOR.violet}
              value={formatNumber(nonviralImpressions)}
              active={selectedTrafficMetrics.includes('nonviral')}
              onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('nonviral') ? prev.filter((m) => m !== 'nonviral') : [...prev, 'nonviral'])}
            />
            <MetricCard
              label="Viral Impressions"
              source="page_posts_impressions_viral"
              color={COLOR.magenta}
              value={formatNumber(viralImpressions)}
              active={selectedTrafficMetrics.includes('viral')}
              onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('viral') ? prev.filter((m) => m !== 'viral') : [...prev, 'viral'])}
            />
            <MetricCard
              label="Unique Reach Proxy"
              source="Sum of post_impressions_unique"
              color={COLOR.amber}
              value={formatNumber(uniqueReachProxy)}
              active={selectedTrafficMetrics.includes('uniqueReachProxy')}
              onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('uniqueReachProxy') ? prev.filter((m) => m !== 'uniqueReachProxy') : [...prev, 'uniqueReachProxy'])}
            />
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedTrafficMetrics.map((m) => (
                <span
                  key={m}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: TRAFFIC_METRIC_CONFIG[m].color }} />
                  {TRAFFIC_METRIC_CONFIG[m].label}
                </span>
              ))}
            </div>
          </div>
          <InsightChartCard title="Visibility Composition" hideHeader flat>
            {selectedTrafficMetrics.length === 0 ? (
              <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
                <div className="absolute inset-0 z-[2] flex items-center justify-center">
                  <div
                    className="rounded-2xl px-5 py-3 text-sm font-medium text-center max-w-[560px] w-[min(560px,92%)]"
                    style={{ background: 'rgba(255,255,255,1)', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}
                  >
                    Select at least one metric card to display traffic data.
                  </div>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trafficTimelineData}
                  barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                  barGap={UNIFIED_BAR_GAP}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" ticks={trafficTicks} tickFormatter={formatShortDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                    formatter={(v: number | string | undefined, n?: string) => [formatNumber(Number(v) || 0), n && n in TRAFFIC_METRIC_CONFIG ? TRAFFIC_METRIC_CONFIG[n as TrafficMetricKey].label : String(n ?? '')]}
                    labelFormatter={(l) => formatShortDate(String(l))}
                  />
                  {selectedTrafficMetrics.includes('postImpressions') ? <Bar dataKey="postImpressions" fill={COLOR.cyan} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  {selectedTrafficMetrics.includes('nonviral') ? <Bar dataKey="nonviral" fill={COLOR.violet} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  {selectedTrafficMetrics.includes('uniqueReachProxy') ? <Bar dataKey="uniqueReachProxy" fill={COLOR.amber} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  {selectedTrafficMetrics.includes('viral') ? <Bar dataKey="viral" fill={COLOR.magenta} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                </BarChart>
              </ResponsiveContainer>
            )}
          </InsightChartCard>

          <div className="mt-6 rounded-xl border p-4 sm:p-5" style={{ borderColor: COLOR.border, background: COLOR.sectionAlt }}>
            <h4 className="text-base font-semibold mb-1" style={{ color: COLOR.text }}>
              Audience by country
            </h4>
            <p className="text-xs mb-4" style={{ color: COLOR.textSecondary }}>
              {insights?.audienceByCountry?.label ??
                'Share of your audience by country (from Meta demographics when available).'}
            </p>
            {audienceCountryPieData.length > 0 ? (
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="w-full lg:w-[min(100%,420px)] h-[280px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={audienceCountryPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={100}
                        paddingAngle={2}
                        labelLine={false}
                        label={({ name, percent: p }) =>
                          `${String(name).slice(0, 14)}${String(name).length > 14 ? '…' : ''} ${((Number(p) || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {audienceCountryPieData.map((_, i) => (
                          <Cell key={i} fill={AUDIENCE_COUNTRY_PIE_COLORS[i % AUDIENCE_COUNTRY_PIE_COLORS.length]} stroke="rgba(255,255,255,0.85)" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                        formatter={(value: number | string | undefined, _n, item) => {
                          const payload = (item as { payload?: { percent?: number } })?.payload;
                          const pct = payload?.percent;
                          const v = Number(value) || 0;
                          return [`${formatNumber(v)}${typeof pct === 'number' ? ` (${pct}% of chart)` : ''}`, 'Audience'];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: COLOR.textSecondary }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-2 text-sm min-w-0" style={{ color: COLOR.text }}>
                  {audienceCountryPieData.slice(0, 12).map((row, i) => (
                    <li key={row.name} className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2 last:border-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: AUDIENCE_COUNTRY_PIE_COLORS[i % AUDIENCE_COUNTRY_PIE_COLORS.length] }} />
                        <span className="truncate font-medium">{row.name}</span>
                      </span>
                      <span className="tabular-nums shrink-0" style={{ color: COLOR.textSecondary }}>
                        {formatNumber(row.value)} <span className="text-neutral-400">({row.percent}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm py-6 text-center" style={{ color: COLOR.textSecondary }}>
                No country breakdown yet. Meta returns this when your account has enough follower or engaged-audience demographics. Try again after more activity, or confirm insights permissions when you reconnect.
              </p>
            )}
          </div>
        </div>
        )}
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsPostsSkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div>
            <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Posts</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Total Posts" source="Derived from posts in date range" color={COLOR.text} value={formatNumber(postsInRange.length)} />
            <MetricCard label="Avg Clicks per Post" source="post_clicks" color={COLOR.text} value={avgClicksPerPost.toFixed(1)} />
            <MetricCard label="Avg Reactions per Post" source="post_reactions_like_total / breakdown" color={COLOR.text} value={avgReactionsPerPost.toFixed(1)} />
          </div>
          <TopContentHighlights
            byViews={topByViews.map((p) => ({
              id: p.id,
              preview: p.preview,
              permalink: p.permalink,
              type: p.type,
              thumbnailUrl: p.rawPost.thumbnailUrl ?? null,
              views: p.views,
              clicks: p.clicks,
              reactions: p.reactionsTotal,
              publishedAt: p.date,
            }))}
            byClicks={topByClicks.map((p) => ({
              id: p.id,
              preview: p.preview,
              permalink: p.permalink,
              type: p.type,
              thumbnailUrl: p.rawPost.thumbnailUrl ?? null,
              views: p.views,
              clicks: p.clicks,
              reactions: p.reactionsTotal,
              publishedAt: p.date,
            }))}
            byReactions={topByReactions.map((p) => ({
              id: p.id,
              preview: p.preview,
              permalink: p.permalink,
              type: p.type,
              thumbnailUrl: p.rawPost.thumbnailUrl ?? null,
              views: p.views,
              clicks: p.clicks,
              reactions: p.reactionsTotal,
              publishedAt: p.date,
            }))}
          />
        </div>
        )}

      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsReelsSkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div>
            <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Reels</h2>
          </div>
        <div className="flex gap-2">
          {([
            { id: 'performance', label: 'Performance' },
            { id: 'engagement', label: 'Engagement' },
            { id: 'watch', label: 'Watch' },
          ] as const).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setReelPreset(preset.id);
                setSelectedReelMetrics(REEL_PRESET_METRICS[preset.id]);
              }}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{
                background: reelPreset === preset.id ? 'rgba(139,124,255,0.2)' : 'rgba(255,255,255,0.03)',
                color: reelPreset === preset.id ? COLOR.text : COLOR.textSecondary,
                border: `1px solid ${reelPreset === preset.id ? COLOR.violet : COLOR.border}`,
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Video Views"
            source="post_video_views"
            color={REEL_METRIC_CONFIG.views.color}
            value={formatNumber(totalReelVideoViews)}
            active={selectedReelMetrics.includes('views')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('views') ? prev.filter((m) => m !== 'views') : [...prev, 'views'])}
          />
          <MetricCard
            label="Watch Time"
            source="post_video_view_time"
            color={REEL_METRIC_CONFIG.watchTime.color}
            value={formatDurationMs(totalReelWatchTimeMs)}
            active={selectedReelMetrics.includes('watchTime')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('watchTime') ? prev.filter((m) => m !== 'watchTime') : [...prev, 'watchTime'])}
          />
          <MetricCard
            label="Avg Watch Time"
            source="Mean post_video_avg_time_watched"
            color={REEL_METRIC_CONFIG.avgWatch.color}
            value={formatDurationMs(avgWatchMs)}
            active={selectedReelMetrics.includes('avgWatch')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('avgWatch') ? prev.filter((m) => m !== 'avgWatch') : [...prev, 'avgWatch'])}
          />
          <MetricCard
            label="Clicks"
            source="post_clicks"
            color={REEL_METRIC_CONFIG.clicks.color}
            value={formatNumber(reelClicks)}
            active={selectedReelMetrics.includes('clicks')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('clicks') ? prev.filter((m) => m !== 'clicks') : [...prev, 'clicks'])}
          />
          <MetricCard
            label="Likes"
            source="post_reactions_like_total"
            color={REEL_METRIC_CONFIG.likes.color}
            value={formatNumber(reelLikes)}
            active={selectedReelMetrics.includes('likes')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('likes') ? prev.filter((m) => m !== 'likes') : [...prev, 'likes'])}
          />
          <MetricCard
            label="Comments"
            source="post_comments"
            color={REEL_METRIC_CONFIG.comments.color}
            value={formatNumber(reelComments)}
            active={selectedReelMetrics.includes('comments')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('comments') ? prev.filter((m) => m !== 'comments') : [...prev, 'comments'])}
          />
          <MetricCard
            label="Shares"
            source="post_shares"
            color={REEL_METRIC_CONFIG.shares.color}
            value={formatNumber(reelShares)}
            active={selectedReelMetrics.includes('shares')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
          />
          <MetricCard
            label="Reposts"
            source="repostsCount"
            color={REEL_METRIC_CONFIG.reposts.color}
            value={formatNumber(reelReposts)}
            active={selectedReelMetrics.includes('reposts')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('reposts') ? prev.filter((m) => m !== 'reposts') : [...prev, 'reposts'])}
          />
        </div>

        <InsightChartCard
          title="Reel Performance"
          legend={selectedReelMetrics.map((m) => ({ label: REEL_METRIC_CONFIG[m].label, color: REEL_METRIC_CONFIG[m].color }))}
        >
          {reelsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reelsChartData}
                barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                barGap={UNIFIED_BAR_GAP}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} interval={0} tick={{ fill: COLOR.textMuted, fontSize: 11 }} minTickGap={0} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(107,114,128,0.20)' }}
                  content={(props) => {
                    const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ dataKey?: string; value?: number; payload?: { thumbnailUrl?: string | null } }>; label?: string };
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload;
                    const kv = payload
                      .filter((p) => typeof p.value === 'number' && typeof p.dataKey === 'string')
                      .map((p) => ({ key: p.dataKey as ReelMetricKey | 'watchTimeMinutes' | 'avgWatchSeconds', value: p.value ?? 0 }));
                    return (
                      <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: '#ffffff', borderColor: COLOR.border }}>
                        <p className="font-medium mb-1.5" style={{ color: COLOR.text }}>{formatShortDate(String(label ?? ''))}</p>
                        {row?.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="mb-2 h-10 w-10 rounded object-cover" /> : null}
                        {kv.map((item) => (
                          <p key={item.key} style={{ color: COLOR.textSecondary }}>
                            {(item.key === 'watchTimeMinutes' ? 'Watch Time' : item.key === 'avgWatchSeconds' ? 'Avg Watch' : REEL_METRIC_CONFIG[item.key as ReelMetricKey]?.label ?? item.key)}: {item.key === 'watchTimeMinutes' ? `${item.value.toFixed(1)}m` : item.key === 'avgWatchSeconds' ? `${item.value.toFixed(1)}s` : formatNumber(item.value)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {selectedReelMetrics.includes('views') ? <Bar dataKey="views" fill={REEL_METRIC_CONFIG.views.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('clicks') ? <Bar dataKey="clicks" fill={REEL_METRIC_CONFIG.clicks.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('likes') ? <Bar dataKey="likes" fill={REEL_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('comments') ? <Bar dataKey="comments" fill={REEL_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('shares') ? <Bar dataKey="shares" fill={REEL_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('reposts') ? <Bar dataKey="reposts" fill={REEL_METRIC_CONFIG.reposts.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('watchTime') ? <Bar dataKey="watchTimeMinutes" fill={REEL_METRIC_CONFIG.watchTime.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('avgWatch') ? <Bar dataKey="avgWatchSeconds" fill={REEL_METRIC_CONFIG.avgWatch.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] rounded-[20px] border flex flex-col items-center justify-center text-center px-6" style={{ background: COLOR.card, borderColor: COLOR.border }}>
              <p className="text-sm font-semibold" style={{ color: COLOR.text }}>No reels in this period</p>
              <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                Reel analytics appears after reels are discovered in your post inventory.
              </p>
            </div>
          )}
        </InsightChartCard>
        </div>
        )}
      </section>

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.history} className="scroll-mt-28 space-y-4">
        {overviewSkeleton ? (
          <AnalyticsHistorySkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div>
            <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>Content History</h2>
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
        </div>
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
