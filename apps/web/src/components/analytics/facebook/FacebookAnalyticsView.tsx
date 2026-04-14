'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ChevronRight, ExternalLink, MessageSquare, RefreshCw, Sparkles, Star } from 'lucide-react';
import { AnalyticsDateRangePicker } from '../AnalyticsDateRangePicker';
import { LinkedInCommunityApiJsonPanel } from '../LinkedInCommunityApiJsonPanel';
import { AnalyticsLocalJsonPanel } from '../AnalyticsLocalJsonPanel';
import type { FacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';
import type { FacebookInsights, FacebookPost } from './types';
import { FACEBOOK_ANALYTICS_SECTION_IDS } from './facebook-analytics-section-ids';
import { localCalendarDateFromIso, toLocalCalendarDate } from '@/lib/calendar-date';
import { formatMetricNumber as formatNumber } from '@/lib/metric-format';
import { isLegacyInstagramInsightsUnavailableHint } from '@/lib/strip-legacy-insights-hint';
import {
  buildYoutubePrimaryPermalink,
  classifyYoutubeVideoFormat,
  hasYoutubeShortsCreatorSignals,
} from '@/lib/youtube-video-format';

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
  /** LinkedIn: used to load raw Community Management API debug JSON on the analytics page. */
  socialAccountId?: string | null;
}

type SectionId = (typeof FACEBOOK_ANALYTICS_SECTION_IDS)[keyof typeof FACEBOOK_ANALYTICS_SECTION_IDS];
type StoryMode = 'views' | 'engagement' | 'growth';
type StoryMetricKey =
  | 'followers'
  | 'engagements'
  | 'videoViews'
  | 'contentViews'
  | 'pageVisits'
  | 'subscriberNet';
type ActivityMetricKey = 'actions' | 'posts' | 'conversations' | 'subscriberNet';
type EngagementMetricKey = 'likes' | 'comments' | 'shares' | 'reposts';

/** Bottom → top stack order for the Engagement chart (must match `<Bar />` order). */
const ENGAGEMENT_STACK_ORDER_META: readonly EngagementMetricKey[] = ['likes', 'comments', 'shares', 'reposts'];
const ENGAGEMENT_STACK_ORDER_TIKTOK: readonly EngagementMetricKey[] = ['likes', 'comments', 'shares'];
type TrafficMetricKey = 'postImpressions' | 'nonviral' | 'viral' | 'uniqueReachProxy';
type ReelMetricKey = 'views' | 'watchTime' | 'avgWatch' | 'clicks' | 'likes' | 'comments' | 'shares' | 'reposts';
type ReelPresetKey = 'performance' | 'engagement' | 'watch';
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
  /** Former “cyan” analytics accent; kept as key `cyan` for metric map compatibility. */
  cyan: '#6366f1',
  /** True cyan for non-viral traffic (distinct from post impressions indigo above). */
  trafficNonviralCyan: '#06b6d4',
  violet: '#7c6cff',
  magenta: '#d946ef',
  mint: '#31c48d',
  amber: '#f5b942',
  coral: '#ff8b7b',
};

/** Neon outline for metrics sourced from TikTok Open API (user.info, video/list, creator_info). */
const TIKTOK_API_CARD_CLASS =
  'ring-2 ring-[#facc15] shadow-[0_0_22px_rgba(250,204,21,0.5)] bg-[rgba(250,204,21,0.07)]';

/** Outline for metrics sourced from Instagram Graph API (IG User /insights). */
const INSTAGRAM_GRAPH_API_CARD_CLASS =
  'ring-2 ring-[#e4405f] shadow-[0_0_18px_rgba(228,64,95,0.32)] bg-[rgba(228,64,95,0.06)]';

/** Icon-first “open on platform” control (Content History, top posts, etc.). */
const ANALYTICS_OPEN_ON_PLATFORM_BTN_CLASS =
  'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors hover:opacity-90';

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
  { key: 'page_posts_impressions_nonviral', label: 'Non-viral Impressions', section: 'traffic', source: 'page_posts_impressions_nonviral', color: COLOR.trafficNonviralCyan },
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
  subscriberNet: { label: 'Subscriber net', color: COLOR.cyan, mode: 'growth' },
};

const STORY_MODE_DEFAULT_METRICS: Record<StoryMode, StoryMetricKey[]> = {
  growth: ['followers'],
  engagement: ['engagements'],
  views: ['videoViews', 'contentViews', 'pageVisits'],
};

/** When combined with followers/engagements, these metrics often need their own Y scale (TikTok views, IG impressions). */
const STORY_METRICS_HIGH_MAGNITUDE: StoryMetricKey[] = ['videoViews', 'contentViews', 'pageVisits'];

/** TikTok Performance cards reuse chart keys; line colors must match each SparklineMetricCard. */
const TIKTOK_PERFORMANCE_LINE_COLORS: Record<StoryMetricKey, string> = {
  followers: COLOR.mint,
  engagements: COLOR.coral,
  videoViews: COLOR.amber,
  contentViews: COLOR.violet,
  pageVisits: COLOR.magenta,
  subscriberNet: COLOR.cyan,
};

const TIKTOK_PERFORMANCE_LABELS: Record<StoryMetricKey, string> = {
  followers: 'Followers',
  engagements: 'Engagements (range)',
  videoViews: 'Total video views',
  contentViews: 'Profile likes',
  pageVisits: 'Public videos',
  subscriberNet: 'Subscriber net',
};

const YOUTUBE_PERFORMANCE_LABELS: Record<StoryMetricKey, string> = {
  followers: 'Subscribers',
  engagements: 'Engagements',
  videoViews: 'Views',
  contentViews: 'Content Views',
  pageVisits: 'Page Visits',
  subscriberNet: 'Subscriber net',
};

const YOUTUBE_PERFORMANCE_PRESET_ORDER = ['overview', 'subscribers', 'reach'] as const;
type YouTubePerformancePresetKey = (typeof YOUTUBE_PERFORMANCE_PRESET_ORDER)[number];

const YOUTUBE_PERFORMANCE_PRESETS: Record<
  YouTubePerformancePresetKey,
  { label: string; metrics: readonly StoryMetricKey[] }
> = {
  overview: {
    label: 'Overview',
    metrics: ['followers', 'videoViews', 'engagements', 'subscriberNet'],
  },
  subscribers: { label: 'Subscribers', metrics: ['followers', 'subscriberNet'] },
  reach: { label: 'Reach', metrics: ['videoViews', 'engagements'] },
};

/** LinkedIn reuses chart keys; labels match API + synced post semantics. */
const LINKEDIN_PERFORMANCE_LABELS: Record<StoryMetricKey, string> = {
  followers: 'Connections',
  engagements: 'Engagements (range)',
  videoViews: 'Impressions (synced)',
  contentViews: 'Posts published (daily)',
  pageVisits: 'Page Visits',
  subscriberNet: 'Subscriber net',
};

/** X (Twitter) reuses the same chart keys as TikTok-style simplified performance. */
const TWITTER_PERFORMANCE_LABELS: Record<StoryMetricKey, string> = {
  followers: 'Followers',
  engagements: 'Engagements (range)',
  videoViews: 'Tweet impressions',
  contentViews: 'Posts published (daily)',
  pageVisits: 'Profile visits',
  subscriberNet: 'Subscriber net',
};

function storyMetricSetsEqual(a: StoryMetricKey[], b: readonly StoryMetricKey[]): boolean {
  if (a.length !== b.length) return false;
  const as = new Set(a);
  if (as.size !== a.length) return false;
  return b.every((m) => as.has(m));
}

/**
 * Golden-angle hue stepping so each country slice gets a distinct color (no short palette repeats).
 * Saturation and lightness vary slightly by index so neighbors stay separable on light backgrounds.
 */
function youtubeGeoPieColor(index: number): string {
  const h = (index * 137.508) % 360;
  const s = 70 + ((index * 3) % 5) * 3.5;
  const l = 42 + ((index * 7) % 4) * 4;
  return `hsl(${h.toFixed(2)} ${Math.min(92, s).toFixed(1)}% ${Math.min(56, l).toFixed(1)}%)`;
}

function formatYoutubeTrafficSource(raw: string): string {
  if (raw === '__LONG_FORM_NON_SHORTS_FEED__') {
    return 'Long-form & other (non-Shorts feed)';
  }
  const t = String(raw || '')
    .replace(/^YT_/i, '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
  if (!t) return raw;
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTIVITY_METRIC_CONFIG: Record<ActivityMetricKey, { label: string; color: string }> = {
  actions: { label: 'Actions', color: COLOR.violet },
  posts: { label: 'Posts', color: COLOR.magenta },
  conversations: { label: 'Conversations', color: COLOR.amber },
  subscriberNet: { label: 'Subscriber net', color: COLOR.mint },
};

const ENGAGEMENT_METRIC_CONFIG: Record<EngagementMetricKey, { label: string; color: string }> = {
  likes: { label: 'Likes', color: COLOR.violet },
  comments: { label: 'Comments', color: COLOR.coral },
  shares: { label: 'Shares', color: COLOR.amber },
  reposts: { label: 'Reposts', color: '#111827' },
};

const TRAFFIC_METRIC_CONFIG: Record<TrafficMetricKey, { label: string; color: string }> = {
  postImpressions: { label: 'Post Impressions', color: COLOR.cyan },
  nonviral: { label: 'Non-viral Impressions', color: COLOR.trafficNonviralCyan },
  viral: { label: 'Viral Impressions', color: COLOR.magenta },
  uniqueReachProxy: { label: 'Unique Reach', color: COLOR.amber },
};

// Shared bar geometry across Traffic/Reels (overlapping bars).
// barGap = -(barSize/2) makes each next selected series cross at the midpoint of previous one.
const UNIFIED_BAR_SIZE = 22;
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
  performance: ['views', 'watchTime', 'avgWatch', 'shares'],
  engagement: ['likes', 'comments', 'shares', 'reposts'],
  watch: ['watchTime', 'avgWatch'],
};

const REEL_PRESET_METRICS_TIKTOK: Record<ReelPresetKey, ReelMetricKey[]> = {
  performance: ['views'],
  engagement: ['likes', 'comments', 'shares'],
  watch: ['views'],
};

/** Facebook & Instagram Reels: no Watch tab; Performance excludes shares (shares stay on Engagement). */
const REEL_PRESET_METRICS_FB_IG: Record<'performance' | 'engagement', ReelMetricKey[]> = {
  performance: ['views', 'watchTime', 'avgWatch'],
  engagement: ['likes', 'comments', 'shares'],
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

/** X-axis: first tick in a month shows "Mar 5", following ticks in the same month show "12", "31" only. */
function formatSparseMonthTick(date: string, index: number, allDates: string[]): string {
  try {
    const d = new Date(`${date}T12:00:00Z`);
    const day = d.getUTCDate();
    const month = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
    if (index <= 0) return `${month} ${day}`;
    const prev = allDates[index - 1];
    if (!prev) return `${month} ${day}`;
    const pd = new Date(`${prev}T12:00:00Z`);
    const changedMonth = d.getUTCMonth() !== pd.getUTCMonth() || d.getUTCFullYear() !== pd.getUTCFullYear();
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

function normalizePostPreview(v: string | null | undefined): string {
  const raw = (v ?? '').trim();
  if (!raw) return '';
  // Scan line-by-line so captions like "Real text\n\n#hash #tags" return the first real line.
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    const meaningful = words.filter(
      (w) => !w.startsWith('#') && !/^https?:\/\//i.test(w) && !/^www\./i.test(w)
    );
    if (meaningful.length > 0) {
      // Return the meaningful words only (strips inline hashtags/urls from within the line too)
      return meaningful.join(' ');
    }
  }
  // Every line is hashtags/URLs — show the first line as-is so there is still something visible
  return lines[0] ?? raw;
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

function normalizeTotalWatchMs(raw: number, views: number, avgWatchMs: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const v = Math.max(1, views);
  let ms = raw;
  // If implied average watch exceeds 10 minutes, treat as microseconds.
  if (ms / v > 10 * 60 * 1000) ms = ms / 1000;
  // Guard against seconds values sneaking in (very tiny implied avg under 50ms).
  if (ms / v < 50) ms = ms * 1000;
  // If avgWatch is present and differs wildly, prefer the scale that is closer.
  if (avgWatchMs > 0) {
    const c1 = ms;
    const c2 = ms / 1000;
    const d1 = Math.abs(c1 / v - avgWatchMs);
    const d2 = Math.abs(c2 / v - avgWatchMs);
    ms = d2 < d1 ? c2 : c1;
  }
  return ms;
}

function getWatchTimes(post: FacebookPost): { watchTimeMs: number; avgWatchMs: number } {
  if ((post.platform ?? '').toUpperCase() === 'TIKTOK') {
    const meta =
      post.platformMetadata && typeof post.platformMetadata === 'object' && !Array.isArray(post.platformMetadata)
        ? (post.platformMetadata as Record<string, unknown>)
        : {};
    const sec = typeof meta.tiktokDurationSec === 'number' && Number.isFinite(meta.tiktokDurationSec) ? meta.tiktokDurationSec : 0;
    if (sec > 0) {
      // TikTok Display API video.list does not expose total or average watch time; show clip length here.
      return { watchTimeMs: 0, avgWatchMs: sec * 1000 };
    }
    return { watchTimeMs: 0, avgWatchMs: 0 };
  }
  if ((post.platform ?? '').toUpperCase() === 'YOUTUBE') {
    const meta =
      post.platformMetadata && typeof post.platformMetadata === 'object' && !Array.isArray(post.platformMetadata)
        ? (post.platformMetadata as Record<string, unknown>)
        : {};
    const durationSec = typeof meta.youtubeDurationSec === 'number' && Number.isFinite(meta.youtubeDurationSec) ? meta.youtubeDurationSec : 0;
    if (durationSec > 0) {
      // YouTube Data API v3 doesn't expose per-video watch time; show video duration as Avg Watch (video length).
      return { watchTimeMs: 0, avgWatchMs: durationSec * 1000 };
    }
    return { watchTimeMs: 0, avgWatchMs: 0 };
  }
  const fi = (post.facebookInsights ?? {}) as Record<string, unknown>;
  let avgWatchMs = normalizeAvgWatchMs(toFiniteNumber(fi.post_video_avg_time_watched));
  const views = Math.max(0, bestPostPlayCount(post));
  const totalWatchRaw = normalizeTotalWatchMs(toFiniteNumber(fi.post_video_view_time), views, avgWatchMs);
  if (totalWatchRaw > 0) {
    if (avgWatchMs <= 0 && views > 0) {
      avgWatchMs = totalWatchRaw / views;
    }
    return { watchTimeMs: totalWatchRaw, avgWatchMs };
  }
  // Fallback when API sends only avg watch metric.
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

function getYoutubeDurationSecFromPost(p: FacebookPost): number | null {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return null;
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  const s = meta.youtubeDurationSec;
  if (typeof s === 'number' && Number.isFinite(s) && s > 0) return s;
  return null;
}

function getYoutubeDescriptionPreviewFromPost(p: FacebookPost): string {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return '';
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  const v = meta.youtubeDescriptionPreview;
  return typeof v === 'string' ? v : '';
}

function getYoutubeInShortsPlaylistFromPost(p: FacebookPost): boolean | undefined {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return undefined;
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  /** Sync could not read the Shorts shelf — do not treat missing/stale `youtubeInShortsPlaylist` as definitive. */
  if (meta.youtubeShortsIndexUnavailable === true) return undefined;
  const v = meta.youtubeInShortsPlaylist;
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

/**
 * Return the stored `youtubeVideoFormat` only for rows synced BEFORE the playlist-aware sync.
 * Used as a bridge until re-sync writes `youtubeInShortsPlaylist`.
 */
function getLegacyYoutubeVideoFormatFromPost(p: FacebookPost): 'short' | 'long' | undefined {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return undefined;
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  // Only skip the bridge when we have a definitive playlist answer.
  // If the index was unavailable (youtubeShortsIndexUnavailable=true) but no explicit
  // youtubeInShortsPlaylist was written, fall through to the stored format as best-effort.
  if (meta.youtubeInShortsPlaylist !== undefined) return undefined;
  const v = meta.youtubeVideoFormat;
  if (v === 'short' || v === 'long') return v;
  return undefined;
}

/**
 * Shorts: channel `UUSH…` playlist membership (definitive once synced), else strict creator signals.
 * Legacy rows (no playlist data yet) fall back to the stored `youtubeVideoFormat` as a bridge until re-sync.
 */
function isYouTubeShortPost(p: FacebookPost): boolean {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return false;
  const pl = getYoutubeInShortsPlaylistFromPost(p);
  const inChannelShortsPlaylist = pl === true ? true : pl === false ? false : undefined;
  const d = getYoutubeDurationSecFromPost(p) ?? 0;

  const classified = classifyYoutubeVideoFormat({
    durationSec: d,
    title: p.content,
    description: getYoutubeDescriptionPreviewFromPost(p),
    inChannelShortsPlaylist,
  });

  // Playlist check gave a definitive yes or no.
  if (inChannelShortsPlaylist !== undefined) return classified === 'short';
  // Creator signals (#shorts / /shorts/ link) present.
  if (classified === 'short') return true;
  // No playlist data and no creator signals: use the stored value written by the previous sync
  // as a bridge until the next sync updates the record.
  const legacy = getLegacyYoutubeVideoFormatFromPost(p);
  if (legacy !== undefined) return legacy === 'short';
  return false;
}

/** Long-form: not classified as Short (includes legacy unknown-duration without #shorts). */
function isYouTubeLongFormVideoPost(p: FacebookPost): boolean {
  if ((p.platform ?? '').toUpperCase() !== 'YOUTUBE') return false;
  return !isYouTubeShortPost(p);
}

/**
 * True only for actual Reels (Reels tab / chart). Do not treat photos or plain feed videos as reels
 * just because insights include numeric post_video_* fields (often 0).
 */
function isReelPost(p: FacebookPost): boolean {
  if ((p.platform ?? '').toUpperCase() === 'TIKTOK') return true;
  if ((p.platform ?? '').toUpperCase() === 'YOUTUBE') return isYouTubeShortPost(p);
  // Twitter: any video tweet (mediaType VIDEO or GIF) is treated as a reel/video
  if ((p.platform ?? '').toUpperCase() === 'TWITTER') {
    const mt = (p.mediaType ?? '').toUpperCase();
    return mt === 'VIDEO' || mt === 'GIF' || mt === 'REEL';
  }
  const url = (p.permalinkUrl ?? '').toLowerCase();
  if (url.includes('/reel/') || url.includes('/reels/')) return true;
  const mt = (p.mediaType ?? '').toUpperCase();
  if (mt === 'REEL') return true;
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  const st = String(meta.status_type ?? '').toUpperCase();
  if (st.includes('REEL')) return true;
  return false;
}

/** Any playable video (reels + feed video) for Page video view totals and video-ish aggregates. */
function isVideoishPost(p: FacebookPost): boolean {
  if ((p.platform ?? '').toUpperCase() === 'TIKTOK') return true;
  if (isReelPost(p)) return true;
  const mt = (p.mediaType ?? '').toUpperCase();
  if (mt === 'VIDEO') return true;
  const fi = p.facebookInsights ?? {};
  const pv = typeof fi.post_video_views === 'number' && Number.isFinite(fi.post_video_views) ? fi.post_video_views : 0;
  if (pv > 0) return true;
  const avg = typeof fi.post_video_avg_time_watched === 'number' ? fi.post_video_avg_time_watched : 0;
  const vt = typeof fi.post_video_view_time === 'number' ? fi.post_video_view_time : 0;
  return avg > 0 || vt > 0;
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

/** Photos use impressions / post_media_view; videos use plays. Keeps Content views above Video-only totals. */
function bestFacebookContentViewCount(p: FacebookPost): number {
  const fi = p.facebookInsights ?? {};
  const pm = typeof fi.post_media_view === 'number' && Number.isFinite(fi.post_media_view) ? fi.post_media_view : 0;
  const pi = typeof fi.post_impressions === 'number' && Number.isFinite(fi.post_impressions) ? fi.post_impressions : 0;
  const imp = typeof p.impressions === 'number' && Number.isFinite(p.impressions) ? p.impressions : 0;
  return Math.max(pm, pi, bestPostPlayCount(p), imp);
}

/** Meta often returns share count on the post node while lifetime insights use 0; take the max of all sources. */
function bestShareCount(p: FacebookPost): number {
  const fi = p.facebookInsights ?? {};
  const a = typeof fi.post_shares === 'number' && Number.isFinite(fi.post_shares) ? Math.max(0, fi.post_shares) : 0;
  const b = typeof p.sharesCount === 'number' && Number.isFinite(p.sharesCount) ? Math.max(0, p.sharesCount) : 0;
  const eb = p.engagementBreakdown?.shares;
  const c = typeof eb === 'number' && Number.isFinite(eb) ? Math.max(0, eb) : 0;
  return Math.max(a, b, c);
}

/** Meta/IG: repostsCount or post_shares. TikTok has no repost metric in our model. */
function bestRepostCount(p: FacebookPost): number {
  if ((p.platform ?? '').toUpperCase() === 'TIKTOK') return 0;
  const fi = p.facebookInsights ?? {};
  const r = p.repostsCount;
  if (typeof r === 'number' && Number.isFinite(r)) return Math.max(0, r);
  const ps = fi.post_shares;
  if (typeof ps === 'number' && Number.isFinite(ps)) return Math.max(0, ps);
  return 0;
}

/** Instagram "interactions" fallback when Graph metric is missing/zero. */
function bestInstagramInteractionCount(p: FacebookPost): number {
  const fi = p.facebookInsights ?? {};
  const fromMetric =
    typeof fi.instagram_total_interactions === 'number' && Number.isFinite(fi.instagram_total_interactions)
      ? Math.max(0, fi.instagram_total_interactions)
      : 0;
  const fromParts =
    bestCount(fi.post_reactions_like_total, p.likeCount) +
    (fi.post_comments ?? p.commentsCount ?? 0) +
    bestShareCount(p) +
    (p.repostsCount ?? fi.post_shares ?? 0);
  return Math.max(fromMetric, fromParts);
}

type ReelAnalyticsRow = {
  post: FacebookPost;
  views: number;
  organicViews: number;
  avgWatchMs: number;
  watchTimeMs: number;
};

function buildReelsLikeChartData(rows: ReelAnalyticsRow[]) {
  const byDate: Record<
    string,
    {
      date: string;
      views: number;
      watchTimeMinutes: number;
      avgWatchSeconds: number;
      clicks: number;
      likes: number;
      comments: number;
      shares: number;
      reposts: number;
      thumbnailUrl: string | null;
      count: number;
    }
  > = {};
  for (const r of rows) {
    const date = r.post.publishedAt.slice(0, 10);
    const row = byDate[date] ?? {
      date,
      views: 0,
      watchTimeMinutes: 0,
      avgWatchSeconds: 0,
      clicks: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      reposts: 0,
      thumbnailUrl: r.post.thumbnailUrl ?? null,
      count: 0,
    };
    row.views += r.views;
    row.watchTimeMinutes += (r.watchTimeMs ?? 0) / 60000;
    row.avgWatchSeconds += r.avgWatchMs / 1000;
    row.clicks +=
      r.post.platform === 'INSTAGRAM'
        ? bestInstagramInteractionCount(r.post)
        : (r.post.facebookInsights?.post_clicks ?? 0);
    row.likes += bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount);
    row.comments += r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0;
    row.shares += bestShareCount(r.post);
    row.reposts += bestRepostCount(r.post);
    row.count += 1;
    byDate[date] = row;
  }
  return Object.values(byDate)
    .map((row) => ({
      ...row,
      avgWatchSeconds: row.count > 0 ? row.avgWatchSeconds / row.count : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

type ReelChartDayRow = ReturnType<typeof buildReelsLikeChartData>[number];

/**
 * When post-level watch metrics are missing, spread channel-level YouTube Analytics
 * estimates across chart days. `estimatedMinutesScale` allocates a fraction of total
 * estimated minutes to this series (e.g. Shorts vs long-form) so split charts do not double-count.
 */
function applyYouTubeWatchFallbackToReelChart(
  chartData: ReelChartDayRow[],
  ytMin: number | null,
  ytAvgSec: number | null,
  estimatedMinutesScale: number
): ReelChartDayRow[] {
  const ytMinScaled =
    typeof ytMin === 'number' && ytMin > 0 && estimatedMinutesScale > 0 ? ytMin * estimatedMinutesScale : 0;
  const hasWatchData = chartData.some((d) => (d.watchTimeMinutes ?? 0) > 0 || (d.avgWatchSeconds ?? 0) > 0);
  if (hasWatchData) return chartData;
  const ytAvg = typeof ytAvgSec === 'number' && ytAvgSec > 0 ? ytAvgSec : 0;
  if (ytMinScaled <= 0 && ytAvg <= 0) return chartData;
  if (chartData.length === 0) return chartData;

  const totalViews = chartData.reduce((s, d) => s + (d.views ?? 0), 0);
  if (totalViews > 0) {
    return chartData.map((d) => {
      const weight = (d.views ?? 0) / totalViews;
      return {
        ...d,
        watchTimeMinutes: ytMinScaled > 0 ? ytMinScaled * weight : d.watchTimeMinutes,
        avgWatchSeconds: ytAvg > 0 ? ytAvg : d.avgWatchSeconds,
      };
    });
  }

  const totalUploads = chartData.reduce((s, d) => s + (d.count ?? 0), 0);
  if (totalUploads > 0 && ytMinScaled > 0) {
    return chartData.map((d) => ({
      ...d,
      watchTimeMinutes: ytMinScaled * ((d.count ?? 0) / totalUploads),
      avgWatchSeconds: ytAvg > 0 ? ytAvg : d.avgWatchSeconds,
    }));
  }

  const n = chartData.length;
  const perDay = ytMinScaled > 0 && n > 0 ? ytMinScaled / n : 0;
  return chartData.map((d) => ({
    ...d,
    watchTimeMinutes: perDay,
    avgWatchSeconds: ytAvg > 0 ? ytAvg : d.avgWatchSeconds,
  }));
}

/** Unified post interaction count for social dashboards. */
function bestPostInteractionCount(p: FacebookPost): number {
  const platform = String(p.platform ?? '').toUpperCase();
  const fi = p.facebookInsights ?? {};
  const fromParts =
    bestCount(fi.post_reactions_like_total, p.likeCount) +
    (fi.post_comments ?? p.commentsCount ?? 0) +
    bestShareCount(p) +
    (p.repostsCount ?? fi.post_shares ?? 0);

  if (platform === 'INSTAGRAM') return Math.max(bestInstagramInteractionCount(p), fromParts);
  if (platform === 'FACEBOOK') return fromParts;
  if (platform === 'TIKTOK') {
    return (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p);
  }
  if (platform === 'YOUTUBE') {
    return (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p);
  }
  return fi.post_clicks ?? 0;
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

  const engagementPostMap = seriesToMap(sortSeries(engagementByDate));
  const apiAccountsEngagedMap = seriesToMap(insights.facebookPageMetricSeries?.accounts_engaged ?? []);
  const engagement = mapToSortedSeries(mergeSeriesMapsMax(apiAccountsEngagedMap, engagementPostMap));
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

  /** Account-level `impressions` can be empty or zero while per-media views/reach exist; use post-aggregated plays/impressions as fallback. */
  const postAggregatedImpressions = aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p));
  const accountImpSum = sumMetricSeriesPoints(contentViews);
  const postAggSum = sumMetricSeriesPoints(postAggregatedImpressions);
  const postImpressions =
    accountImpSum > 0 ? contentViews : postAggSum > 0 ? postAggregatedImpressions : contentViews;
  /** Same series drives Overview growth chart + Traffic; must match headline when account impressions are empty. */
  const seriesContentViews = postImpressions;
  const engagementTotal = sumMetricSeriesPoints(engagement);
  const sourceKeys: string[] = [];
  if (contentViews.length || postAggregatedImpressions.length) sourceKeys.push('impressions');
  if (pageTabViews.length) sourceKeys.push('profile_views');
  if (engagement.length) sourceKeys.push('post_engagement_proxy');
  if (videoViews.length) sourceKeys.push('post_video_views');

  return {
    followers: insights.followers ?? 0,
    series: {
      contentViews: seriesContentViews,
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
      contentViews: sumMetricSeriesPoints(seriesContentViews),
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
  for (const p of series) {
    const v = Number(p.value);
    map[p.date] = Number.isFinite(v) ? v : 0;
  }
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
  fallback = 0,
  ignoreZeroDrop = false
): Record<string, number> {
  const out: Record<string, number> = {};
  let prev = fallback;
  for (const d of dates) {
    if (typeof map[d] === 'number') {
      const next = map[d];
      prev = ignoreZeroDrop && next === 0 && prev > 0 ? prev : next;
    }
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
  instagramGraphHighlight,
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
  /** Instagram Graph API (IG User insights) metric (rose ring). */
  instagramGraphHighlight?: boolean;
}) {
  const hint = `Source metric: ${source}${typeof trendPercent === 'number' && Number.isFinite(trendPercent) ? `. Change in selected range: ${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%.` : ''}`;
  const apiRing = tiktokApiHighlight ? TIKTOK_API_CARD_CLASS : instagramGraphHighlight ? INSTAGRAM_GRAPH_API_CARD_CLASS : '';
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`rounded-[12px] px-3 py-1.5 text-left transition-all hover:-translate-y-[1px] ${apiRing}`}
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
  chartHeightPx = 300,
}: {
  title: string;
  subtitle?: string;
  legend?: Array<{ label: string; color: string }>;
  children: React.ReactNode;
  hideHeader?: boolean;
  flat?: boolean;
  /** Chart plot area height in pixels (default matches historical 300px charts). */
  chartHeightPx?: number;
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
      <div className={`${hideHeader ? '' : 'mt-3 '}pb-5 relative`} style={{ height: chartHeightPx }}>
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
        <Bar dataKey="nonviral" stackId="a" fill={COLOR.trafficNonviralCyan} radius={[6, 6, 0, 0]} shape={<MinWidthBarShape />} />
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
                <div className="flex items-start gap-2 min-w-0">
                  {p.permalinkUrl ? (
                    <Link
                      href={p.permalinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ANALYTICS_OPEN_ON_PLATFORM_BTN_CLASS}
                      style={{ borderColor: COLOR.border, background: '#ffffff', color: COLOR.cyan }}
                      aria-label="Open post on platform"
                      title="Open on platform"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  ) : null}
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
                  <p className="text-sm leading-5 min-w-0 pt-0.5" style={{ color: COLOR.textSecondary }}>
                    <span className="mr-2 rounded-md px-2 py-0.5 text-xs" style={{ color: COLOR.text, background: 'rgba(124,108,255,0.14)' }}>#{idx + 1}</span>
                    {clampText(firstWords(p.content, 3) || 'View post', 76)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold" style={{ color: metricColor }}>{formatNumber(p.value)}</span>
              </div>
              <div className="mt-2 text-xs" style={{ color: COLOR.textMuted }}>
                {metricLabel}
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

/** Best URL to open a post on the native platform (permalink from API, or Facebook fallback from `platformPostId`). */
export function resolvedPostPermalink(row: {
  permalink?: string | null;
  rawPost: FacebookPost;
}): string | null {
  const direct = (row.permalink || row.rawPost.permalinkUrl || '').trim();
  if (direct) return direct;
  const plat = (row.rawPost.platform || '').toUpperCase();
  const pid = (row.rawPost.platformPostId || '').trim();
  if (plat === 'FACEBOOK' && /^\d+_\d+$/.test(pid)) {
    const [pageId, storyFbid] = pid.split('_');
    if (pageId && storyFbid) return `https://www.facebook.com/${pageId}/posts/${storyFbid}`;
  }
  return null;
}

export function PostsPerformanceTable({
  rows,
  clicksColumnLabel = 'Clicks',
  hideClicksColumn = false,
  platform,
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
  clicksColumnLabel?: string;
  /** Hide the clicks/interactions column (e.g. for Facebook). */
  hideClicksColumn?: boolean;
  /** Used to hide Meta-only columns and relabel watch metrics for TikTok. */
  platform?: string;
}) {
  const platUpper = (platform ?? '').toUpperCase();
  const compactVideoTable = platUpper === 'TIKTOK' || platUpper === 'LINKEDIN' || platUpper === 'TWITTER';
  const tableHeaders: Array<{ label: string; className: string; title?: string }> = [
    { label: 'Post preview', className: 'w-[240px]' },
    { label: 'Publish date', className: 'w-[132px]' },
    { label: 'Type', className: 'w-[88px]' },
    { label: 'Views', className: 'w-[58px]' },
    ...(compactVideoTable ? [] : [{ label: 'Unique reach', className: 'w-[124px] min-w-[124px]' }]),
    ...(hideClicksColumn ? [] : [{ label: clicksColumnLabel, className: 'w-[116px] min-w-[116px] pl-5' }]),
    { label: 'Likes', className: 'w-[72px]' },
    { label: 'Reactions', className: 'w-[88px]' },
    ...(compactVideoTable
      ? []
      : [
          {
            label: 'Watch time',
            className: 'w-[84px]',
            title:
              platUpper === 'YOUTUBE'
                ? 'YouTube Data API does not expose per-video watch time here (studio-only).'
                : undefined,
          },
          { label: platUpper === 'YOUTUBE' ? 'Duration' : 'Avg watch', className: 'w-[80px]' },
        ]),
  ];
  const tableMinW = compactVideoTable ? 'min-w-[860px]' : 'min-w-[1220px]';
  return (
    <div className="rounded-[20px] overflow-hidden" style={{ background: COLOR.card, boxShadow: '0 2px 16px rgba(15,23,42,0.06)' }}>
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full ${tableMinW} table-fixed text-sm`}>
          <thead style={{ background: 'rgba(255,255,255,0.02)', color: COLOR.textMuted }}>
            <tr>
              {tableHeaders.map((h, idx) => (
                <th
                  key={h.label}
                  title={h.title}
                  className={`py-3 text-left font-medium whitespace-nowrap ${h.className} ${idx > 0 ? 'border-l' : ''} ${
                    h.label === 'Watch time' ? 'pl-5 pr-3' : h.label === 'Unique reach' ? 'px-3 pr-5' : 'px-3'
                  }`}
                  style={{ borderColor: idx > 0 ? COLOR.border : undefined }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const openUrl = resolvedPostPermalink(r);
              return (
              <tr key={r.id} className="border-t hover:bg-[#f8fafc]" style={{ borderColor: COLOR.border }}>
                <td className="px-3 py-3" style={{ color: COLOR.textSecondary }}>
                  <div className="flex items-start gap-2 min-w-0">
                    {openUrl ? (
                      <Link
                        href={openUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ANALYTICS_OPEN_ON_PLATFORM_BTN_CLASS}
                        style={{ borderColor: COLOR.border, background: '#ffffff', color: COLOR.cyan }}
                        aria-label="Open post on platform"
                        title="Open on platform"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    ) : null}
                    {r.rawPost.thumbnailUrl || platUpper !== 'TWITTER' ? (
                      <div className="relative shrink-0 flex items-start">
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
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className="text-[13px] leading-snug line-clamp-4"
                        style={{ color: COLOR.textSecondary }}
                        title={(r.preview || '').trim() || undefined}
                      >
                        {normalizePostPreview(r.preview || '') || '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-xs leading-tight" style={{ color: COLOR.textSecondary }}>
                  {formatPostCardDateTime(r.date) || new Date(r.date).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.08)', color: COLOR.text }}>
                    {platUpper === 'YOUTUBE' ? (isYouTubeShortPost(r.rawPost) ? 'Short' : 'Long-form') : r.type}
                  </span>
                </td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.views)}</td>
                {!compactVideoTable ? <td className="px-3 py-3 pr-4" style={{ color: COLOR.text }}>{formatNumber(r.uniqueReach)}</td> : null}
                {!hideClicksColumn && <td className="pl-5 pr-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.clicks)}</td>}
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.likes)}</td>
                <td className="px-3 py-3" style={{ color: COLOR.text }}>{formatNumber(r.reactionsTotal)}</td>
                {!compactVideoTable ? (
                  <>
                    <td
                      className="pl-5 pr-3 py-3"
                      style={{ color: COLOR.textSecondary }}
                      title={
                        platUpper === 'YOUTUBE'
                          ? 'Per-video watch time is not available from the YouTube Data API in this view.'
                          : undefined
                      }
                    >
                      {platUpper === 'YOUTUBE' ? '—' : r.watchTimeMs > 0 ? formatDurationMs(r.watchTimeMs) : ' - '}
                    </td>
                    <td className="px-3 py-3" style={{ color: COLOR.textSecondary }}>
                      {platUpper === 'YOUTUBE'
                        ? (() => {
                            const sec = getYoutubeDurationSecFromPost(r.rawPost);
                            if (sec !== null && sec > 0) return formatDurationMs(sec * 1000);
                            return r.avgWatchMs > 0 ? formatDurationMs(r.avgWatchMs) : ' - ';
                          })()
                        : r.avgWatchMs > 0
                          ? formatDurationMs(r.avgWatchMs)
                          : ' - '}
                    </td>
                  </>
                ) : null}
              </tr>
            );})}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-3 p-4">
        {rows.map((r) => {
          const openUrl = resolvedPostPermalink(r);
          return (
          <div
            key={r.id}
            className="w-full rounded-xl border p-3 text-left"
            style={{ borderColor: COLOR.border, background: 'rgba(255,255,255,0.015)' }}
          >
            <div className="flex items-start gap-2">
              {openUrl ? (
                <Link
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ANALYTICS_OPEN_ON_PLATFORM_BTN_CLASS}
                  style={{ borderColor: COLOR.border, background: '#ffffff', color: COLOR.cyan }}
                  aria-label="Open post on platform"
                  title="Open on platform"
                >
                  <ExternalLink size={14} />
                </Link>
              ) : null}
              {r.rawPost.thumbnailUrl || platUpper !== 'TWITTER' ? (
                <div className="flex shrink-0 items-start">
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
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm line-clamp-5 leading-snug" style={{ color: COLOR.text }} title={(r.preview || '').trim() || undefined}>
                  {normalizePostPreview(r.preview || '') || '—'}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: COLOR.textSecondary }}>
              <span>{formatPostCardDateTime(r.date) || new Date(r.date).toLocaleDateString()}</span>
              <span>{platUpper === 'YOUTUBE' ? (isYouTubeShortPost(r.rawPost) ? 'Short' : 'Long-form') : r.type}</span>
              <span>Views {formatNumber(r.views)}</span>
              {!compactVideoTable ? <span>Reach {formatNumber(r.uniqueReach)}</span> : null}
              {!compactVideoTable ? (
                <>
                  <span title={platUpper === 'YOUTUBE' ? 'Not available per video from YouTube Data API' : undefined}>
                    {platUpper === 'YOUTUBE' ? 'Watch —' : r.watchTimeMs > 0 ? `Watch ${formatDurationMs(r.watchTimeMs)}` : 'Watch -'}
                  </span>
                  <span>
                    {platUpper === 'YOUTUBE'
                      ? (() => {
                          const sec = getYoutubeDurationSecFromPost(r.rawPost);
                          if (sec !== null && sec > 0) return `Duration ${formatDurationMs(sec * 1000)}`;
                          return r.avgWatchMs > 0 ? `Duration ${formatDurationMs(r.avgWatchMs)}` : 'Duration -';
                        })()
                      : r.avgWatchMs > 0
                        ? `Avg ${formatDurationMs(r.avgWatchMs)}`
                        : 'Avg -'}
                  </span>
                </>
              ) : null}
              {!hideClicksColumn && (
                <span>
                  {clicksColumnLabel} {formatNumber(r.clicks)}
                </span>
              )}
            </div>
          </div>
        );})}
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
  clicksLeaderTitle = 'Clicks leaders',
  clicksMetricLabel = 'Clicks',
  hideClicksColumn = false,
  platform,
}: {
  byViews: TopHighlightRow[];
  byClicks: TopHighlightRow[];
  byReactions: TopHighlightRow[];
  /** Instagram uses Meta interactions, not Facebook Page link clicks. */
  clicksLeaderTitle?: string;
  clicksMetricLabel?: 'Clicks' | 'Interactions';
  /** Hide the clicks/interactions column entirely (e.g. for Facebook). */
  hideClicksColumn?: boolean;
  platform?: string;
}) {
  const isTwitterHighlight = (platform ?? '').toUpperCase() === 'TWITTER';
  const rankBadge = (idx: number) => `/rank-badges/${Math.min(3, idx + 1)}.svg`;
  const col = (title: string, metricLabel: 'Views' | 'Clicks' | 'Reactions' | 'Interactions', rows: TopHighlightRow[], showClicks = true) => (
    <div className="space-y-3">
      <p className="text-base font-semibold tracking-tight" style={{ color: COLOR.text }}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: COLOR.textMuted }}>No items yet</p>
      ) : (
        rows.map((r, idx) => (
          <div key={`${title}-${r.id}-${idx}`} className="rounded-xl p-3 h-[124px]" style={{ background: COLOR.elevated }}>
            <div className="flex items-start gap-3">
              {isTwitterHighlight && !r.thumbnailUrl ? (
                /* Text-only tweet: show just the rank badge, no thumbnail box */
                <div className="shrink-0 flex items-start pt-1">
                  <img
                    src={rankBadge(idx)}
                    alt={`Rank ${idx + 1}`}
                    className="h-11 w-11 object-contain drop-shadow-md sm:h-12 sm:w-12"
                  />
                </div>
              ) : (
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
              )}
              <div className="min-w-0 flex-1 min-h-[92px] flex flex-col">
                <p className="text-[11px] leading-4 tabular-nums shrink-0" style={{ color: COLOR.textMuted }}>
                  {formatPostCardDateTime(r.publishedAt) || '—'}
                </p>
                <p
                  className="mt-1 min-h-0 text-[13px] leading-[18px] line-clamp-4"
                  style={{ color: COLOR.textSecondary }}
                  title={(r.preview || '').trim() || undefined}
                >
                  {normalizePostPreview(r.preview || '').trim() || 'View post'}
                </p>
                <div className="mt-auto pt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: COLOR.textMuted }}>
                  <span style={metricLabel === 'Views' ? { color: COLOR.text, fontWeight: 700, fontSize: 13 } : undefined}>Views {formatNumber(r.views)}</span>
                  {showClicks && (
                    <span
                      style={
                        metricLabel === 'Clicks' || metricLabel === 'Interactions'
                          ? { color: COLOR.text, fontWeight: 700, fontSize: 13 }
                          : undefined
                      }
                    >
                      {metricLabel === 'Interactions' ? 'Interactions' : 'Clicks'} {formatNumber(r.clicks)}
                    </span>
                  )}
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
      <div className={`grid gap-4 ${hideClicksColumn ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {col('Views leaders', 'Views', byViews, !hideClicksColumn)}
        {!hideClicksColumn && col(clicksLeaderTitle, clicksMetricLabel, byClicks, true)}
        {col('Reactions leaders', 'Reactions', byReactions, !hideClicksColumn)}
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
            <div className="rounded-lg p-2" style={{ background: 'rgba(99,102,241,0.09)', color: COLOR.cyan }}>Views<br /><span className="text-sm font-semibold">{formatNumber(views)}</span></div>
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
  socialAccountId = null,
}: FacebookAnalyticsViewProps) {
  /**
   * Full analytics shell (Overview, Traffic, Posts, Reels, History): first insights fetch (hasApiInsightsFetched false), or Facebook Page waiting for Graph bundle.
   * When the parent still has insights === null from the API, hasApiInsightsFetched is false so we do not flash zeros on any section.
   * Date-range refetches keep prior insights so hasApiInsightsFetched stays true and the UI stays stable.
   *
   * After we have ever shown a rich Facebook bundle (or IG / other platform charts), do not swap the whole Overview
   * for a skeleton on later insightsLoading ticks — parent may briefly omit facebookAnalytics while revalidating.
   */
  const accountSwitchKey = `${insights?.platform ?? ''}:${accountUsername ?? ''}`;
  const [skipOverviewSkeleton, setSkipOverviewSkeleton] = useState(false);
  useEffect(() => {
    setSkipOverviewSkeleton(false);
  }, [accountSwitchKey]);
  useEffect(() => {
    if (!insights) return;
    if (insights.facebookAnalytics) {
      setSkipOverviewSkeleton(true);
      return;
    }
    if (insights.platform === 'FACEBOOK' && (insights.followers ?? 0) > 0) {
      setSkipOverviewSkeleton(true);
      return;
    }
    if (insights.platform === 'INSTAGRAM') {
      if (
        (insights.followers ?? 0) > 0 ||
        (Array.isArray(insights.impressionsTimeSeries) && insights.impressionsTimeSeries.some((d) => d.value > 0))
      ) {
        setSkipOverviewSkeleton(true);
      }
      return;
    }
    if (['TIKTOK', 'YOUTUBE', 'LINKEDIN', 'PINTEREST', 'TWITTER'].includes(String(insights.platform).toUpperCase())) {
      if ((insights.followers ?? 0) > 0 || (insights.impressionsTotal ?? 0) > 0) setSkipOverviewSkeleton(true);
    }
  }, [insights]);
  const overviewSkeleton =
    insightsLoading &&
    !skipOverviewSkeleton &&
    (!hasApiInsightsFetched || (insights?.platform === 'FACEBOOK' && !insights?.facebookAnalytics));
  const [storyMode, setStoryMode] = useState<StoryMode>('growth');
  const [selectedStoryMetrics, setSelectedStoryMetrics] = useState<StoryMetricKey[]>(STORY_MODE_DEFAULT_METRICS.growth);
  const [selectedActivityMetrics, setSelectedActivityMetrics] = useState<ActivityMetricKey[]>(['posts', 'actions', 'conversations']);
  const [selectedEngagementMetrics, setSelectedEngagementMetrics] = useState<EngagementMetricKey[]>(['likes', 'comments', 'shares']);
  const [selectedTrafficMetrics, setSelectedTrafficMetrics] = useState<TrafficMetricKey[]>(['postImpressions', 'nonviral', 'viral', 'uniqueReachProxy']);
  const [selectedReelMetrics, setSelectedReelMetrics] = useState<ReelMetricKey[]>(['views', 'watchTime', 'avgWatch', 'shares']);
  const [reelPreset, setReelPreset] = useState<ReelPresetKey>('performance');
  const [activeSection, setActiveSection] = useState<SectionId>(FACEBOOK_ANALYTICS_SECTION_IDS.overview);
  const [historyFilter, setHistoryFilter] = useState<ContentHistoryFilter>('all');
  const geoPieWrapRef = useRef<HTMLDivElement>(null);
  const [geoPieHover, setGeoPieHover] = useState<{ x: number; y: number; name: string; value: number } | null>(null);
  const sections = useMemo(() => {
    const plat = insights?.platform?.toUpperCase() ?? '';
    const all = [
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.overview, label: 'Overview' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.traffic, label: 'Traffic' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.posts, label: plat === 'TWITTER' ? 'Tweets' : plat === 'PINTEREST' ? 'Pins' : 'Posts' },
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.reels, label: plat === 'PINTEREST' ? 'Videos' : 'Reels' },
      ...(plat === 'YOUTUBE' ? [{ id: FACEBOOK_ANALYTICS_SECTION_IDS.videos, label: 'Videos' } as const] : []),
      { id: FACEBOOK_ANALYTICS_SECTION_IDS.history, label: 'History' },
    ];
    if (plat === 'TIKTOK' || plat === 'TWITTER') {
      return all.filter((s) => s.id !== FACEBOOK_ANALYTICS_SECTION_IDS.traffic);
    }
    if (plat === 'LINKEDIN') {
      return all.filter(
        (s) =>
          s.id !== FACEBOOK_ANALYTICS_SECTION_IDS.traffic && s.id !== FACEBOOK_ANALYTICS_SECTION_IDS.reels
      );
    }
    return all;
  }, [insights?.platform]);

  useEffect(() => {
    setGeoPieHover(null);
  }, [insights?.demographics?.byCountry, dateRange.start, dateRange.end]);

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
    const plat = insights?.platform?.toUpperCase() ?? '';
    if (plat === 'TIKTOK' || plat === 'TWITTER' || plat === 'YOUTUBE' || plat === 'LINKEDIN') return;
    setSelectedStoryMetrics(STORY_MODE_DEFAULT_METRICS[storyMode]);
  }, [storyMode, insights?.platform]);

  useEffect(() => {
    const plat = insights?.platform?.toUpperCase();
    if (plat === 'TWITTER') {
      setSelectedStoryMetrics(['followers', 'videoViews', 'engagements', 'contentViews']);
      return;
    }
    if (plat === 'TIKTOK') {
      setSelectedStoryMetrics(['followers', 'videoViews', 'engagements']);
    }
  }, [insights?.platform]);

  useEffect(() => {
    if (insights?.platform?.toUpperCase() !== 'LINKEDIN') return;
    setSelectedStoryMetrics(['followers', 'contentViews', 'videoViews', 'engagements']);
  }, [insights?.platform]);

  useEffect(() => {
    if (insights?.platform?.toUpperCase() !== 'YOUTUBE') return;
    setSelectedStoryMetrics(['followers', 'videoViews', 'engagements', 'subscriberNet']);
  }, [insights?.platform]);

  useEffect(() => {
    if (insights?.platform?.toUpperCase() === 'YOUTUBE') return;
    setSelectedStoryMetrics((prev) => prev.filter((m) => m !== 'subscriberNet'));
  }, [insights?.platform]);

  useEffect(() => {
    const p = insights?.platform?.toUpperCase() ?? '';
    if (p === 'YOUTUBE') {
      setSelectedActivityMetrics(['posts', 'subscriberNet']);
      return;
    }
    if (p === 'LINKEDIN') {
      setSelectedActivityMetrics(['posts']);
      return;
    }
    setSelectedActivityMetrics((prev) => {
      const next = prev.filter((m) => m !== 'subscriberNet');
      return next.length ? next : ['posts', 'actions', 'conversations'];
    });
  }, [insights?.platform]);

  useEffect(() => {
    if (insights?.platform?.toUpperCase() === 'TWITTER') {
      setSelectedEngagementMetrics(['likes', 'comments', 'shares', 'reposts']);
      return;
    }
    if (insights?.platform?.toUpperCase() !== 'TIKTOK') return;
    const engAllowed = new Set<EngagementMetricKey>(['likes', 'comments', 'shares']);
    const reelAllowed = new Set<ReelMetricKey>(['views', 'clicks', 'likes', 'comments', 'shares']);
    setSelectedEngagementMetrics((prev) => prev.filter((m) => engAllowed.has(m)));
    setSelectedReelMetrics((prev) => {
      const next = prev.filter((m) => reelAllowed.has(m));
      return next.length ? next : ['views'];
    });
    setReelPreset((p) => (p === 'watch' ? 'performance' : p));
  }, [insights?.platform]);
  useEffect(() => {
    if (insights?.platform?.toUpperCase() !== 'YOUTUBE') return;
    setReelPreset('performance');
    setSelectedReelMetrics(['views', 'watchTime', 'avgWatch', 'shares']);
  }, [insights?.platform]);

  const profile = insights?.facebookPageProfile;
  const linkedInExtras = insights?.linkedIn;
  const isInstagram = insights?.platform?.toUpperCase() === 'INSTAGRAM';
  const isFacebook = insights?.platform?.toUpperCase() === 'FACEBOOK';
  const isTikTok = insights?.platform?.toUpperCase() === 'TIKTOK';
  const isYouTube = insights?.platform?.toUpperCase() === 'YOUTUBE';
  const isPinterest = insights?.platform?.toUpperCase() === 'PINTEREST';
  const isLinkedIn = insights?.platform?.toUpperCase() === 'LINKEDIN';
  const isTwitter = insights?.platform?.toUpperCase() === 'TWITTER';

  useEffect(() => {
    if (!isFacebook && !isInstagram) return;
    setReelPreset((p) => (p === 'watch' ? 'performance' : p));
    setSelectedReelMetrics((prev) => {
      const legacyPerf: ReelMetricKey[] = ['views', 'watchTime', 'avgWatch', 'shares'];
      if (prev.length === legacyPerf.length && legacyPerf.every((m) => prev.includes(m))) {
        return [...REEL_PRESET_METRICS_FB_IG.performance];
      }
      return prev;
    });
  }, [isFacebook, isInstagram]);

  /** Instagram has no Page-level viral / non-viral impression series in Graph API. */
  useEffect(() => {
    if (!isInstagram) return;
    setSelectedTrafficMetrics((prev) => prev.filter((m) => m !== 'nonviral' && m !== 'viral'));
  }, [isInstagram]);

  /** Pinterest analytics has no viral split or per-pin unique reach in this UI; keep pin impressions only. */
  useEffect(() => {
    if (!isPinterest) return;
    setSelectedTrafficMetrics((prev) => prev.filter((m) => m !== 'viral' && m !== 'uniqueReachProxy'));
  }, [isPinterest]);

  const tiktokUser = insights?.tiktokUser;
  const tiktokCreatorInfo = insights?.tiktokCreatorInfo;
  const twitterUser = insights?.twitterUser;
  const twitterTotals = insights?.twitterTotals;
  const igMetricSeries = insights?.facebookPageMetricSeries;
  const community = insights?.facebookCommunity;
  const resolvedUsername = (profile?.username ?? accountUsername ?? '').trim().replace(/^@/, '');
  const headerAvatarUrl = isTikTok
    ? (tiktokCreatorInfo?.creatorAvatarUrl ?? accountAvatarUrl)
    : isTwitter && twitterUser?.profile_image_url
      ? twitterUser.profile_image_url.replace(/_normal\./, '_400x400.')
      : isLinkedIn && linkedInExtras?.profile?.picture
        ? linkedInExtras.profile.picture
        : accountAvatarUrl;

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
      postsInRange.reduce(
        (s, p) => s + (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p),
        0
      ),
    [postsInRange]
  );
  const twitterEngagementsTotal = useMemo(() => {
    const t = twitterTotals;
    if (t) return t.likes + t.replies + t.retweets + t.quotes + t.bookmarks;
    return sumMetricSeriesPoints(insights?.twitterEngagementTimeSeries ?? []);
  }, [twitterTotals, insights?.twitterEngagementTimeSeries]);
  const twitterImpressionsInRange = useMemo(
    () =>
      Math.max(
        insights?.impressionsTotal ?? 0,
        sumMetricSeriesPoints(insights?.impressionsTimeSeries ?? [])
      ),
    [insights?.impressionsTimeSeries, insights?.impressionsTotal]
  );
  const youTubeViewsInRange = useMemo(
    () =>
      (insights?.impressionsTimeSeries ?? []).reduce((s, p) => s + (typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0), 0),
    [insights?.impressionsTimeSeries]
  );
  const youTubeEngagementsInRange = useMemo(
    () =>
      postsInRange.reduce(
        (s, p) => s + (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p),
        0
      ),
    [postsInRange]
  );
  /** YouTube Analytics: net subscribers gained minus lost per calendar day (extended API). */
  const youtubeGrowthNetByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const pt of insights?.growthTimeSeries ?? []) {
      const d = String(pt.date ?? '').slice(0, 10);
      if (!d) continue;
      const net =
        typeof pt.net === 'number' && Number.isFinite(pt.net)
          ? pt.net
          : (Number(pt.gained) || 0) - (Number(pt.lost) || 0);
      m[d] = net;
    }
    return m;
  }, [insights?.growthTimeSeries]);
  const tiktokTotalVideoViewsValue = useMemo(
    () => Math.max(0, insights?.impressionsTotal ?? 0, tiktokViewsInRange),
    [insights?.impressionsTotal, tiktokViewsInRange]
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
  const youTubeSubscriberNetInRange = useMemo(
    () => dateAxis.reduce((s, d) => s + (youtubeGrowthNetByDate[d] ?? 0), 0),
    [dateAxis, youtubeGrowthNetByDate]
  );
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
    : isTwitter
      ? (twitterUser?.followers_count ?? insights?.followers ?? 0)
      : isLinkedIn
        ? (insights?.followers ?? 0)
        : Math.max(
          profile?.followers_count ?? 0,
          profile?.fan_count ?? 0,
          insights?.followers ?? 0,
          latestFollowersFromSeries,
          (series?.follows?.length ? (series.follows[series.follows.length - 1]?.value ?? 0) : 0)
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
  const activeYoutubePerformancePreset = useMemo((): YouTubePerformancePresetKey | null => {
    if (!isYouTube) return null;
    for (const key of YOUTUBE_PERFORMANCE_PRESET_ORDER) {
      if (storyMetricSetsEqual(selectedStoryMetrics, YOUTUBE_PERFORMANCE_PRESETS[key].metrics)) {
        return key;
      }
    }
    return null;
  }, [isYouTube, selectedStoryMetrics]);
  const newFollowers = bundle?.totals.dailyFollows ?? 0;
  const derivedPostViewsInRange = useMemo(
    () => postsInRange.reduce((s, p) => s + bestPostPlayCount(p), 0),
    [postsInRange]
  );
  /** When Page `page_media_view` lags, sum per-post media/video plays in range (same idea as Instagram merge). */
  const derivedFbContentViewsFromPosts = useMemo(
    () => (isFacebook ? postsInRange.reduce((s, p) => s + bestFacebookContentViewCount(p), 0) : 0),
    [isFacebook, postsInRange]
  );
  const fbTrafficPostImpressionsSum = useMemo(
    () =>
      isFacebook
        ? postsInRange.reduce((s, p) => {
            const fi = p.facebookInsights ?? {};
            const imp = typeof fi.post_impressions === 'number' ? fi.post_impressions : 0;
            const pm = typeof fi.post_media_view === 'number' ? fi.post_media_view : 0;
            return s + Math.max(imp, pm, p.impressions ?? 0);
          }, 0)
        : 0,
    [isFacebook, postsInRange]
  );
  const contentViews = isTikTok
    ? tiktokViewsInRange
    : isInstagram
      ? Math.max(0, insights.impressionsTotal ?? 0, bundle?.totals.contentViews ?? 0, derivedPostViewsInRange)
      : isFacebook
        ? Math.max(bundle?.totals.contentViews ?? 0, derivedPostViewsInRange, derivedFbContentViewsFromPosts)
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
  const postImpressions = isTikTok
    ? tiktokViewsInRange
    : Math.max(bundle?.totals.postImpressions ?? 0, isFacebook ? fbTrafficPostImpressionsSum : 0);
  const nonviralImpressions = Math.max(
    bundle?.totals.postImpressionsNonviral ?? 0,
    isFacebook &&
      (bundle?.totals.postImpressionsNonviral ?? 0) === 0 &&
      (bundle?.totals.postImpressionsViral ?? 0) === 0 &&
      fbTrafficPostImpressionsSum > 0
      ? fbTrafficPostImpressionsSum
      : 0
  );
  const viralImpressions = bundle?.totals.postImpressionsViral ?? 0;
  const uniqueReachProxy = postsInRange.reduce((s, p) => s + (p.facebookInsights?.post_impressions_unique ?? 0), 0);

  const linkedInEngagementsInRange = useMemo(
    () =>
      postsInRange.reduce((s, p) => {
        const comp = (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p);
        const intr = p.interactions ?? 0;
        return s + (intr > 0 ? intr : comp);
      }, 0),
    [postsInRange]
  );
  const linkedInImpressionsInRange = useMemo(
    () => postsInRange.reduce((s, p) => s + (p.impressions ?? 0), 0),
    [postsInRange]
  );

  const chartByMode = useMemo(() => {
    if (isTikTok) {
      const viewsByDate: Record<string, number> = {};
      const engagementByDate: Record<string, number> = {};
      for (const p of postsInRange) {
        const d = localCalendarDateFromIso(p.publishedAt);
        if (!d) continue;
        viewsByDate[d] = (viewsByDate[d] ?? 0) + (p.impressions ?? bestPostPlayCount(p));
        engagementByDate[d] =
          (engagementByDate[d] ?? 0) +
          (p.likeCount ?? 0) +
          (p.commentsCount ?? 0) +
          bestShareCount(p);
      }
      const apiViewsMap = seriesToMap(insights?.impressionsTimeSeries ?? []);
      const mergedViewsByDate = mergeSeriesMapsMax(apiViewsMap, viewsByDate);
      const followsRaw: Record<string, number> = {};
      dateAxis.forEach((d) => {
        followsRaw[d] = totalFollowers;
      });
      const videoViewsSeries = dailyValuesOnAxis(dateAxis, mergedViewsByDate);
      const engagement = carryForwardSeries(dateAxis, engagementByDate, 0);
      const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers, true);
      return dateAxis.map((date) => ({
        date,
        followers: follows[date] ?? 0,
        engagements: engagement[date] ?? 0,
        videoViews: videoViewsSeries[date] ?? 0,
        contentViews: 0,
        pageVisits: 0,
        subscriberNet: 0,
      }));
    }
    if (isYouTube) {
      const viewsMap = seriesToMap(insights?.impressionsTimeSeries ?? []);
      const engagementByDate: Record<string, number> = {};
      for (const p of postsInRange) {
        const d = localCalendarDateFromIso(p.publishedAt);
        if (!d) continue;
        engagementByDate[d] =
          (engagementByDate[d] ?? 0) +
          (p.likeCount ?? 0) +
          (p.commentsCount ?? 0) +
          bestShareCount(p);
      }
      const followsRaw: Record<string, number> = {};
      dateAxis.forEach((d) => {
        followsRaw[d] = totalFollowers;
      });
      const videoViewsSeries = dailyValuesOnAxis(dateAxis, viewsMap);
      const engagement = carryForwardSeries(dateAxis, engagementByDate, 0);
      const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers, true);
      const subscriberNetSeries = dailyValuesOnAxis(dateAxis, youtubeGrowthNetByDate);
      return dateAxis.map((date) => ({
        date,
        followers: follows[date] ?? 0,
        engagements: engagement[date] ?? 0,
        videoViews: videoViewsSeries[date] ?? 0,
        contentViews: 0,
        pageVisits: 0,
        subscriberNet: subscriberNetSeries[date] ?? 0,
      }));
    }
    if (isTwitter) {
      const apiImp = seriesToMap(insights?.impressionsTimeSeries ?? []);
      const postImp = seriesToMap(aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p)));
      const viewsMap = mergeSeriesMapsMax(apiImp, postImp);
      const apiEng = seriesToMap(insights?.twitterEngagementTimeSeries ?? []);
      const postEng = seriesToMap(
        aggregatePostsByDayValue(
          postsInRange,
          (p) =>
            (p.likeCount ?? 0) +
            (p.commentsCount ?? 0) +
            bestShareCount(p) +
            (p.repostsCount ?? 0)
        )
      );
      const engMap = mergeSeriesMapsMax(apiEng, postEng);
      const postsByDate: Record<string, number> = {};
      for (const p of postsInRange) {
        const d = localCalendarDateFromIso(p.publishedAt);
        if (!d) continue;
        postsByDate[d] = (postsByDate[d] ?? 0) + 1;
      }
      const followsRaw: Record<string, number> = {};
      dateAxis.forEach((d) => {
        followsRaw[d] = totalFollowers;
      });
      const videoViewsSeries = dailyValuesOnAxis(dateAxis, viewsMap);
      const engagement = dailyValuesOnAxis(dateAxis, engMap);
      const contentViewsSeries = dailyValuesOnAxis(dateAxis, postsByDate);
      const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers, true);
      return dateAxis.map((date) => ({
        date,
        followers: follows[date] ?? 0,
        engagements: engagement[date] ?? 0,
        videoViews: videoViewsSeries[date] ?? 0,
        contentViews: contentViewsSeries[date] ?? 0,
        pageVisits: 0,
        subscriberNet: 0,
      }));
    }
    if (isLinkedIn) {
      const postsByDate: Record<string, number> = {};
      const engagementByDate: Record<string, number> = {};
      const impressionsFromPosts: Record<string, number> = {};
      for (const p of postsInRange) {
        const d = localCalendarDateFromIso(p.publishedAt);
        if (!d) continue;
        postsByDate[d] = (postsByDate[d] ?? 0) + 1;
        const comp = (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p);
        const intr = p.interactions ?? 0;
        engagementByDate[d] = (engagementByDate[d] ?? 0) + (intr > 0 ? intr : comp);
        impressionsFromPosts[d] = (impressionsFromPosts[d] ?? 0) + (p.impressions ?? 0);
      }
      const followsRaw: Record<string, number> = {};
      dateAxis.forEach((d) => {
        followsRaw[d] = totalFollowers;
      });
      const apiImp = seriesToMap(insights?.impressionsTimeSeries ?? []);
      const hasApiImp = Object.values(apiImp).some((v) => v > 0);
      const impressionMap = hasApiImp ? apiImp : impressionsFromPosts;
      const videoViewsSeries = dailyValuesOnAxis(dateAxis, impressionMap);
      const contentViewsSeries = dailyValuesOnAxis(dateAxis, postsByDate);
      const engagement = dailyValuesOnAxis(dateAxis, engagementByDate);
      const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers, true);
      return dateAxis.map((date) => ({
        date,
        followers: follows[date] ?? 0,
        engagements: engagement[date] ?? 0,
        videoViews: videoViewsSeries[date] ?? 0,
        contentViews: contentViewsSeries[date] ?? 0,
        pageVisits: 0,
        subscriberNet: 0,
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
      const postDailyContentMap = seriesToMap(
        aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p))
      );
      mediaRaw = mergeSeriesMapsMax(
        mergeSeriesMapsMax(seriesToMap(mergedImpressionsSeries), postDailyContentMap),
        seriesToMap(series?.contentViews ?? [])
      );
      if (ms && Object.keys(ms).length > 0) {
        const msProfileViews = seriesToMap(ms.profile_views ?? []);
        const msAccountsEngaged = seriesToMap(ms.accounts_engaged ?? []);
        visitsRaw = mergeSeriesMapsMax(
          Object.keys(msProfileViews).length > 0 ? msProfileViews : seriesToMap(series?.pageTabViews ?? []),
          seriesToMap(series?.pageTabViews ?? [])
        );
        engagementRaw = Object.keys(msAccountsEngaged).length > 0 ? msAccountsEngaged : seriesToMap(series?.engagement ?? []);
        followsRaw = insights?.followersTimeSeries?.length
          ? seriesToMap(insights.followersTimeSeries)
          : seriesToMap(series?.follows ?? []);
        videoViewsRaw = mergeSeriesMapsMax(seriesToMap(ms.views ?? []), seriesToMap(videoPlaysDailySeries));
      } else {
        visitsRaw = seriesToMap(series?.pageTabViews ?? []);
        engagementRaw = seriesToMap(series?.engagement ?? []);
        followsRaw = insights?.followersTimeSeries?.length
          ? seriesToMap(insights.followersTimeSeries)
          : seriesToMap(series?.follows ?? []);
        videoViewsRaw = seriesToMap(videoPlaysDailySeries);
      }
    } else if (isFacebook) {
      const postDailyContentMap = seriesToMap(
        aggregatePostsByDayValue(postsInRange, (p) => bestFacebookContentViewCount(p))
      );
      mediaRaw = mergeSeriesMapsMax(seriesToMap(series?.contentViews ?? []), postDailyContentMap);
      visitsRaw = seriesToMap(series?.pageTabViews ?? []);
      videoViewsRaw = mergeSeriesMapsMax(seriesToMap(series?.videoViews ?? []), seriesToMap(videoPlaysDailySeries));
      engagementRaw = seriesToMap(series?.engagement ?? []);
      followsRaw = seriesToMap(series?.follows ?? []);
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
    const follows = carryForwardSeries(dateAxis, followsRaw, totalFollowers, true);
    return dateAxis.map((date) => ({
      date,
      followers: follows[date] ?? 0,
      engagements: engagement[date] ?? 0,
      videoViews: videoViewsSeries[date] ?? 0,
      contentViews: media[date] ?? 0,
      pageVisits: visits[date] ?? 0,
      subscriberNet: 0,
    }));
  }, [
    isTikTok,
    isYouTube,
    isTwitter,
    isLinkedIn,
    isInstagram,
    isFacebook,
    insights?.impressionsTimeSeries,
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
    insights?.twitterEngagementTimeSeries,
    insights?.growthTimeSeries,
    videoPlaysDailySeries,
    totalFollowers,
    youtubeGrowthNetByDate,
  ]);

  const growthSparklineSeries = useMemo(() => {
    if (isTikTok) {
      const viewsSeries = aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p));
      const engSeries = aggregatePostsByDayValue(
        postsInRange,
        (p) => (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p)
      );
      const start = dateRange.start.slice(0, 10);
      const end = dateRange.end.slice(0, 10);
      const ff = totalFollowers;
      return {
        follows: [
          { date: start, value: ff },
          { date: end, value: ff },
        ],
        engagement: engSeries,
        videoViews: viewsSeries,
        contentViews: [],
        pageVisits: [],
        subscriberNet: [],
      };
    }
    if (isYouTube) {
      const viewsSeries = (insights?.impressionsTimeSeries?.length
        ? [...insights.impressionsTimeSeries]
        : []
      ).sort((a, b) => a.date.localeCompare(b.date));
      const engSeries = aggregatePostsByDayValue(
        postsInRange,
        (p) => (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p)
      );
      const start = dateRange.start.slice(0, 10);
      const end = dateRange.end.slice(0, 10);
      const ff = totalFollowers;
      const subscriberNetSeries = dateAxis.map((d) => ({ date: d, value: youtubeGrowthNetByDate[d] ?? 0 }));
      return {
        follows: [
          { date: start, value: ff },
          { date: end, value: ff },
        ],
        engagement: engSeries,
        videoViews: viewsSeries,
        contentViews: [],
        pageVisits: [],
        subscriberNet: subscriberNetSeries,
      };
    }
    if (isLinkedIn) {
      const postsDaily = aggregatePostsByDayValue(postsInRange, () => 1);
      const engSeries = aggregatePostsByDayValue(postsInRange, (p) => {
        const comp = (p.likeCount ?? 0) + (p.commentsCount ?? 0) + bestShareCount(p);
        const intr = p.interactions ?? 0;
        return intr > 0 ? intr : comp;
      });
      const impressionsFromPosts = aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? 0);
      const apiTs = insights?.impressionsTimeSeries ?? [];
      const hasApiImp = apiTs.length > 0 && apiTs.some((x) => (x.value ?? 0) > 0);
      const viewsSeries = (hasApiImp ? [...apiTs] : impressionsFromPosts).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const start = dateRange.start.slice(0, 10);
      const end = dateRange.end.slice(0, 10);
      const ff = totalFollowers;
      return {
        follows: [
          { date: start, value: ff },
          { date: end, value: ff },
        ],
        engagement: engSeries,
        videoViews: viewsSeries,
        contentViews: postsDaily,
        pageVisits: [],
        subscriberNet: [],
      };
    }
    if (isFacebook) {
      const fbPostContentMap = seriesToMap(
        aggregatePostsByDayValue(postsInRange, (p) => bestFacebookContentViewCount(p))
      );
      const contentSparkMap = mergeSeriesMapsMax(seriesToMap(series?.contentViews ?? []), fbPostContentMap);
      const videoSparkMap = mergeSeriesMapsMax(seriesToMap(series?.videoViews ?? []), seriesToMap(videoPlaysDailySeries));
      return {
        follows: series?.follows ?? [],
        engagement: series?.engagement ?? [],
        videoViews: mapToSortedSeries(videoSparkMap),
        contentViews: mapToSortedSeries(contentSparkMap),
        pageVisits: series?.pageTabViews ?? [],
        subscriberNet: [],
      };
    }
    if (isTwitter) {
      const postsDaily = aggregatePostsByDayValue(postsInRange, () => 1);
      const viewsSeriesMap = mergeSeriesMapsMax(
        seriesToMap(insights?.impressionsTimeSeries ?? []),
        seriesToMap(aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p)))
      );
      const engSeriesMap = mergeSeriesMapsMax(
        seriesToMap(insights?.twitterEngagementTimeSeries ?? []),
        seriesToMap(
          aggregatePostsByDayValue(
            postsInRange,
            (p) =>
              (p.likeCount ?? 0) +
              (p.commentsCount ?? 0) +
              bestShareCount(p) +
              (p.repostsCount ?? 0)
          )
        )
      );
      const start = dateRange.start.slice(0, 10);
      const end = dateRange.end.slice(0, 10);
      const ff = totalFollowers;
      return {
        follows: [
          { date: start, value: ff },
          { date: end, value: ff },
        ],
        engagement: mapToSortedSeries(engSeriesMap),
        videoViews: mapToSortedSeries(viewsSeriesMap),
        contentViews: mapToSortedSeries(seriesToMap(postsDaily)),
        pageVisits: [],
        subscriberNet: [],
      };
    }
    if (!isInstagram) {
      return {
        follows: series?.follows ?? [],
        engagement: series?.engagement ?? [],
        videoViews: series?.videoViews ?? [],
        contentViews: series?.contentViews ?? [],
        pageVisits: series?.pageTabViews ?? [],
        subscriberNet: [],
      };
    }
    const ms = igMetricSeries;
    const contentSparkBase = insights?.impressionsTimeSeries?.length
      ? insights.impressionsTimeSeries
      : ms?.impressions?.length
        ? ms.impressions
        : (insights?.impressionsTimeSeries ?? []);
    const igPostDailyMap = seriesToMap(
      aggregatePostsByDayValue(postsInRange, (p) => p.impressions ?? bestPostPlayCount(p))
    );
    const contentSparkMap = mergeSeriesMapsMax(
      mergeSeriesMapsMax(seriesToMap(contentSparkBase), igPostDailyMap),
      seriesToMap(series?.contentViews ?? [])
    );
    const contentSpark = mapToSortedSeries(contentSparkMap);
    const videoSparkMap = mergeSeriesMapsMax(
      seriesToMap(ms?.views ?? []),
      seriesToMap(videoPlaysDailySeries)
    );
    const pageVisitsSparkMap = mergeSeriesMapsMax(
      seriesToMap(ms?.profile_views ?? []),
      seriesToMap(series?.pageTabViews ?? [])
    );
    return {
      follows: insights?.followersTimeSeries ?? series?.follows ?? [],
      engagement: ms?.accounts_engaged ?? [],
      videoViews: mapToSortedSeries(videoSparkMap),
      contentViews: contentSpark,
      pageVisits: mapToSortedSeries(pageVisitsSparkMap),
      subscriberNet: [],
    };
  }, [
    isTikTok,
    isYouTube,
    isTwitter,
    isLinkedIn,
    isInstagram,
    isFacebook,
    igMetricSeries,
    series?.follows,
    series?.engagement,
    series?.videoViews,
    series?.contentViews,
    series?.pageTabViews,
    insights?.followersTimeSeries,
    insights?.impressionsTimeSeries,
    insights?.twitterEngagementTimeSeries,
    insights?.growthTimeSeries,
    videoPlaysDailySeries,
    postsInRange,
    dateRange.end,
    dateRange.start,
    totalFollowers,
    dateAxis,
    youtubeGrowthNetByDate,
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
  /** When Page-level `page_posts_impressions_*` has gaps, fill from per-post lifetime impressions on publish date. */
  const postImpressionsByPublishDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of postsInRange) {
      const d = localCalendarDateFromIso(p.publishedAt);
      if (!d) continue;
      const fi = p.facebookInsights ?? {};
      const imp = typeof fi.post_impressions === 'number' ? fi.post_impressions : 0;
      const pm = typeof fi.post_media_view === 'number' ? fi.post_media_view : 0;
      m[d] = (m[d] ?? 0) + Math.max(imp, pm, p.impressions ?? 0);
    }
    return m;
  }, [postsInRange]);
  const trafficTimelineData = useMemo(() => {
    const postImpressionsMap = seriesToMap(series?.postImpressions ?? []);
    const nonviralMap = seriesToMap(series?.postImpressionsNonviral ?? []);
    const viralMap = seriesToMap(series?.postImpressionsViral ?? []);
    /** Only backfill non-viral from per-post impressions when Meta sent no viral/nonviral breakdown at all (same rule as KPI cards). */
    const mayBackfillNonviralFromPosts =
      isFacebook &&
      (bundle?.totals.postImpressionsNonviral ?? 0) === 0 &&
      (bundle?.totals.postImpressionsViral ?? 0) === 0;
    return dateAxis.map((date) => {
      let nonviral = nonviralMap[date] ?? 0;
      const viral = viralMap[date] ?? 0;
      const postImpressionsFromApi = postImpressionsMap[date] ?? 0;
      const fromPosts = postImpressionsByPublishDate[date] ?? 0;
      if (mayBackfillNonviralFromPosts && nonviral === 0 && viral === 0 && fromPosts > 0) {
        nonviral = fromPosts;
      }
      const combined = postImpressionsFromApi > 0 ? postImpressionsFromApi : nonviral + viral;
      return {
        date,
        postImpressions: combined > 0 ? combined : fromPosts,
        nonviral,
        viral,
        uniqueReachProxy: uniqueReachByDate[date] ?? 0,
      };
    });
  }, [
    dateAxis,
    isFacebook,
    bundle?.totals.postImpressionsNonviral,
    bundle?.totals.postImpressionsViral,
    series?.postImpressions,
    series?.postImpressionsNonviral,
    series?.postImpressionsViral,
    uniqueReachByDate,
    postImpressionsByPublishDate,
  ]);

  /** Pie slices must be `{ name, value }` only: a `percent` field breaks Recharts labels (conflicts with internal `percent`). */
  const youtubeGeoBreakdown = useMemo(() => {
    const rows = insights?.demographics?.byCountry ?? [];
    const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
    if (total <= 0) {
      return { list: [] as Array<{ name: string; value: number; sharePct: number }>, pieSlices: [] as Array<{ name: string; value: number }> };
    }
    let regionNames: Intl.DisplayNames | undefined;
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = undefined;
    }
    const list = rows
      .map((r) => {
        const code = String(r.dimensionValue || '').trim();
        const value = Number(r.value) || 0;
        const name =
          code.length === 2 && regionNames ? regionNames.of(code.toUpperCase()) ?? code : code || 'Unknown';
        return { name, value, sharePct: Number(((value / total) * 100).toFixed(1)) };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const pieSlices = list.map(({ name, value }) => ({ name, value }));
    return { list, pieSlices };
  }, [insights?.demographics?.byCountry]);

  /** Traffic types whose views are attributed to Shorts surfacing; remainder shown as a derived long-form row. */
  const youtubeTrafficSourcesForDisplay = useMemo(() => {
    const list = insights?.trafficSources ?? [];
    if (list.length === 0) return [];
    const shortsSurfacing = (source: string) => {
      const k = String(source || '')
        .toUpperCase()
        .replace(/^YT_/i, '');
      return k === 'SHORTS' || k.includes('SHORTS');
    };
    const shortsSum = list.filter((r) => shortsSurfacing(r.source)).reduce((s, r) => s + r.value, 0);
    const total = list.reduce((s, r) => s + r.value, 0);
    const longFormNonShortsFeed = Math.max(0, total - shortsSum);
    const withDerived = [{ source: '__LONG_FORM_NON_SHORTS_FEED__' as const, value: longFormNonShortsFeed }, ...list];
    return [...withDerived].sort((a, b) => b.value - a.value);
  }, [insights?.trafficSources]);

  /** Same synced posts and insights the charts use, for inspection or export. */
  const youtubeAnalyticsDebugPayload = useMemo(() => {
    if (!isYouTube) return null;
    const serializeYoutubePost = (p: FacebookPost) => {
      const meta =
        p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
          ? (p.platformMetadata as Record<string, unknown>)
          : {};
      const shelf =
        meta.youtubeInShortsPlaylist === true
          ? 'on_shorts_shelf'
          : meta.youtubeInShortsPlaylist === false
            ? 'not_on_shorts_shelf'
            : 'unknown';
      const vid = String(p.platformPostId ?? '').trim();
      const descPreview = getYoutubeDescriptionPreviewFromPost(p);
      const inPl = getYoutubeInShortsPlaylistFromPost(p);
      const inChannelShortsPlaylist = inPl === true ? true : inPl === false ? false : undefined;
      const durationSec = getYoutubeDurationSecFromPost(p) ?? 0;
      const strictClass = classifyYoutubeVideoFormat({
        durationSec,
        title: p.content,
        description: descPreview,
        inChannelShortsPlaylist,
      });
      const postUrls = vid
        ? {
            watch: `https://www.youtube.com/watch?v=${vid}`,
            shorts: `https://www.youtube.com/shorts/${vid}`,
            storedPermalinkInDb: p.permalinkUrl ?? null,
            fromMetadataWatch:
              typeof meta.youtubeStandardWatchUrl === 'string' ? meta.youtubeStandardWatchUrl : null,
            fromMetadataShorts:
              typeof meta.youtubeShortsPageUrl === 'string' ? meta.youtubeShortsPageUrl : null,
            suggestedPrimaryPermalink: buildYoutubePrimaryPermalink(vid, strictClass),
          }
        : {
            watch: null as string | null,
            shorts: null as string | null,
            storedPermalinkInDb: p.permalinkUrl ?? null,
            fromMetadataWatch: null as string | null,
            fromMetadataShorts: null as string | null,
            suggestedPrimaryPermalink: null as string | null,
          };
      return {
        id: p.id,
        platformPostId: p.platformPostId ?? null,
        platform: p.platform,
        content: p.content ?? null,
        publishedAt: p.publishedAt,
        permalinkUrl: p.permalinkUrl ?? null,
        postUrls,
        thumbnailUrl: p.thumbnailUrl ?? null,
        mediaType: p.mediaType ?? null,
        impressions: p.impressions ?? 0,
        interactions: p.interactions ?? 0,
        likeCount: p.likeCount ?? null,
        commentsCount: p.commentsCount ?? null,
        sharesCount: p.sharesCount ?? null,
        platformMetadata: p.platformMetadata ?? null,
        youtubeShelfMembership: shelf,
        classificationDebug: {
          durationSecFromMetadata: durationSec,
          youtubeInShortsPlaylistRaw: meta.youtubeInShortsPlaylist ?? null,
          youtubeShortsIndexUnavailable: meta.youtubeShortsIndexUnavailable ?? null,
          storedYoutubeVideoFormat: meta.youtubeVideoFormat ?? null,
          strictClassifierOutput: strictClass,
          hasCreatorSignals: hasYoutubeShortsCreatorSignals(p.content, descPreview),
          dashboardTreatsAsShort: isYouTubeShortPost(p),
        },
        dashboardClassification: isYouTubeShortPost(p) ? 'short' : 'long_form',
      };
    };
    return {
      aboutThisPayload: {
        whatYouAreSeeing:
          'This is not a raw dump from Google. It is the same structured data the dashboard uses: imported video rows from our database (updated by sync and by live videos.list when you open Analytics), plus channel-level fields from GET /api/social/accounts/[id]/insights.',
        officialApis:
          'YouTube Data API v3 (videos, playlistItems, channels) and YouTube Analytics API v2 (reports for traffic, geography, watch time).',
        postUrlsInEachVideo:
          'Every video object includes `postUrls.watch` and `postUrls.shorts` built from `platformPostId` (so you always see both public URL shapes), plus `storedPermalinkInDb`, metadata URLs if present, and `suggestedPrimaryPermalink` from the strict classifier. Use `classificationDebug` to compare with `dashboardClassification`.',
      },
      dateRange: { start: dateRange.start, end: dateRange.end },
      syncedVideosLoadedForAccount: posts.map(serializeYoutubePost),
      syncedVideosPublishedInDateRange: postsInRange.map(serializeYoutubePost),
      channelInsights: {
        followers: insights?.followers,
        impressionsTotal: insights?.impressionsTotal,
        impressionsTimeSeries: insights?.impressionsTimeSeries,
        growthTimeSeries: insights?.growthTimeSeries,
        demographics: insights?.demographics,
        trafficSourcesFromApi: insights?.trafficSources ?? [],
        trafficSourcesAsShownInTrafficTable: youtubeTrafficSourcesForDisplay,
        extra: insights?.extra ?? null,
        insightsHint: insights?.insightsHint ?? null,
      },
      notes: {
        trafficTableDerivedRow:
          'trafficSourcesAsShownInTrafficTable includes a synthetic first row __LONG_FORM_NON_SHORTS_FEED__ (total API views minus rows classified as Shorts surfacing).',
        dashboardClassification:
          'short = on your channel Shorts shelf (UUSH playlist) or explicit #shorts / #short or a youtube.com/shorts/VIDEO_ID token in title or description. long_form = everything else, including normal uploads under 3 minutes that are not on the Shorts shelf. YouTube does not expose a single is_short flag in Data API v3; watch and shorts URLs both exist for many videos.',
        youtubeShelfMembership:
          'youtubeShelfMembership summarizes youtubeInShortsPlaylist from sync (unknown when the Shorts index could not be fetched).',
      },
    };
  }, [
    isYouTube,
    dateRange.start,
    dateRange.end,
    posts,
    postsInRange,
    insights,
    youtubeTrafficSourcesForDisplay,
  ]);

  const youtubeEstimatedWatchMinutes = useMemo(() => {
    const v = insights?.extra?.estimatedMinutesWatched;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [insights?.extra]);

  const youtubeAvgViewDurationSec = useMemo(() => {
    const v = insights?.extra?.averageViewDurationSeconds;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [insights?.extra]);

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
        clicks: bestPostInteractionCount(p),
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

  const longFormVideoRows = useMemo((): ReelAnalyticsRow[] => {
    if (!isYouTube) return [];
    return postsInRange.filter((p) => isYouTubeLongFormVideoPost(p)).map((p) => {
      const { watchTimeMs, avgWatchMs } = getWatchTimes(p);
      return {
        post: p,
        views: bestPostPlayCount(p),
        organicViews: p.facebookInsights?.post_video_views_organic ?? 0,
        avgWatchMs: avgWatchMs ?? 0,
        watchTimeMs: watchTimeMs ?? 0,
      };
    });
  }, [isYouTube, postsInRange]);

  /** Pinterest: use video Pins for the Videos section; if none qualify, fall back to all synced Pins in range. */
  const pinterestVideoRows = useMemo((): ReelAnalyticsRow[] => {
    if (!isPinterest) return [];
    const isVideoPin = (p: FacebookPost) => {
      const mt = (p.mediaType ?? '').toUpperCase();
      if (mt === 'VIDEO') return true;
      return isVideoishPost(p);
    };
    const candidates = postsInRange.filter(isVideoPin);
    const pins = candidates.length > 0 ? candidates : postsInRange;
    return pins.map((p) => {
      const { watchTimeMs, avgWatchMs } = getWatchTimes(p);
      return {
        post: p,
        views: Math.max(bestPostPlayCount(p), p.impressions ?? 0),
        organicViews: p.facebookInsights?.post_video_views_organic ?? 0,
        avgWatchMs: avgWatchMs ?? 0,
        watchTimeMs: watchTimeMs ?? 0,
      };
    });
  }, [isPinterest, postsInRange]);

  // For Twitter, supplement postsInRange counts with live recentTweets when the synced set is smaller.
  const twitterRecentTweets = useMemo(
    () => (isTwitter ? (insights?.recentTweets ?? []) : []),
    [isTwitter, insights?.recentTweets]
  );

  const twitterVideoReelsRows = useMemo((): ReelAnalyticsRow[] => {
    if (!isTwitter || twitterRecentTweets.length === 0) return [];
    return twitterRecentTweets
      .filter((t) => { const mt = (t.mediaType ?? '').toLowerCase(); return mt === 'video' || mt === 'animated_gif'; })
      .map((t) => ({
        post: {
          content: t.text,
          thumbnailUrl: t.thumbnailUrl,
          mediaType: t.mediaType,
          platform: 'TWITTER',
          permalinkUrl: `https://x.com/i/web/status/${t.id}`,
          publishedAt: t.created_at ?? '',
          likeCount: t.like_count,
          commentsCount: t.reply_count,
          sharesCount: t.retweet_count + t.quote_count,
        } as unknown as import('./types').FacebookPost,
        views: t.impression_count,
        organicViews: 0,
        avgWatchMs: 0,
        watchTimeMs: 0,
      }));
  }, [isTwitter, twitterRecentTweets]);

  /** Combined Shorts + long-form for aggregate KPIs and Pinterest; charts split for YouTube below. */
  const reelChartSourceRows = useMemo((): ReelAnalyticsRow[] => {
    if (isPinterest) return pinterestVideoRows;
    if (isTwitter) return reelsRows.length > 0 ? reelsRows : twitterVideoReelsRows;
    if (!isYouTube) return reelsRows;
    if (reelsRows.length > 0 && longFormVideoRows.length > 0) return [...reelsRows, ...longFormVideoRows];
    return reelsRows.length > 0 ? reelsRows : longFormVideoRows;
  }, [isPinterest, pinterestVideoRows, isTwitter, twitterVideoReelsRows, isYouTube, reelsRows, longFormVideoRows]);

  const reelsChartData = useMemo(() => buildReelsLikeChartData(reelChartSourceRows), [reelChartSourceRows]);

  /** Tweet Performance chart data: non-video tweets aggregated by publish date */
  const twitterTweetChartData = useMemo(() => {
    if (!isTwitter || twitterRecentTweets.length === 0) return [];
    const nonVideoTweets = twitterRecentTweets.filter((t) => {
      const mt = (t.mediaType ?? '').toLowerCase();
      return mt !== 'video' && mt !== 'animated_gif';
    });
    const source = nonVideoTweets.length > 0 ? nonVideoTweets : twitterRecentTweets;
    const byDate: Record<string, { date: string; views: number; likes: number; comments: number; shares: number; reposts: number }> = {};
    for (const t of source) {
      const date = (t.created_at ?? '').slice(0, 10);
      if (!date) continue;
      const row = byDate[date] ?? { date, views: 0, likes: 0, comments: 0, shares: 0, reposts: 0 };
      row.views += t.impression_count;
      row.likes += t.like_count;
      row.comments += t.reply_count;
      row.shares += t.retweet_count + t.quote_count;
      row.reposts += t.retweet_count;
      byDate[date] = row;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [isTwitter, twitterRecentTweets]);

  const youtubeShortViewsTotal = useMemo(() => reelsRows.reduce((s, r) => s + r.views, 0), [reelsRows]);
  const youtubeLongViewsTotal = useMemo(() => longFormVideoRows.reduce((s, r) => s + r.views, 0), [longFormVideoRows]);

  const youtubeWatchMinuteShare = useMemo(() => {
    const combined = youtubeShortViewsTotal + youtubeLongViewsTotal;
    if (combined > 0) {
      return {
        shorts: youtubeShortViewsTotal / combined,
        longForm: youtubeLongViewsTotal / combined,
      };
    }
    if (youtubeShortViewsTotal > 0) return { shorts: 1, longForm: 0 };
    if (youtubeLongViewsTotal > 0) return { shorts: 0, longForm: 1 };
    const hasShortRows = reelsRows.length > 0;
    const hasLongRows = longFormVideoRows.length > 0;
    if (hasShortRows && hasLongRows) return { shorts: 0.5, longForm: 0.5 };
    if (hasShortRows) return { shorts: 1, longForm: 0 };
    if (hasLongRows) return { shorts: 0, longForm: 1 };
    return { shorts: 0, longForm: 0 };
  }, [reelsRows.length, longFormVideoRows.length, youtubeShortViewsTotal, youtubeLongViewsTotal]);

  const youtubeShortsChartDataForDisplay = useMemo(() => {
    if (!isYouTube) return [] as ReelChartDayRow[];
    const raw = buildReelsLikeChartData(reelsRows);
    return applyYouTubeWatchFallbackToReelChart(
      raw,
      youtubeEstimatedWatchMinutes,
      youtubeAvgViewDurationSec,
      youtubeWatchMinuteShare.shorts
    );
  }, [isYouTube, reelsRows, youtubeEstimatedWatchMinutes, youtubeAvgViewDurationSec, youtubeWatchMinuteShare.shorts]);

  const youtubeLongFormChartDataForDisplay = useMemo(() => {
    if (!isYouTube) return [] as ReelChartDayRow[];
    const raw = buildReelsLikeChartData(longFormVideoRows);
    return applyYouTubeWatchFallbackToReelChart(
      raw,
      youtubeEstimatedWatchMinutes,
      youtubeAvgViewDurationSec,
      youtubeWatchMinuteShare.longForm
    );
  }, [isYouTube, longFormVideoRows, youtubeEstimatedWatchMinutes, youtubeAvgViewDurationSec, youtubeWatchMinuteShare.longForm]);

  const reelPerformanceChartHeightPx = useMemo(() => {
    const n = reelsChartData.length;
    if (n <= 8) return 300;
    return Math.min(560, 300 + (n - 8) * 30);
  }, [reelsChartData.length]);

  const youtubeShortChartHeightPx = useMemo(() => {
    const n = youtubeShortsChartDataForDisplay.length;
    if (n <= 8) return 300;
    return Math.min(560, 300 + (n - 8) * 30);
  }, [youtubeShortsChartDataForDisplay.length]);

  const youtubeLongChartHeightPx = useMemo(() => {
    const n = youtubeLongFormChartDataForDisplay.length;
    if (n <= 8) return 300;
    return Math.min(560, 300 + (n - 8) * 30);
  }, [youtubeLongFormChartDataForDisplay.length]);

  const reelChartAxisDense = reelsChartData.length > 8;
  const youtubeShortChartAxisDense = youtubeShortsChartDataForDisplay.length > 8;
  const youtubeLongChartAxisDense = youtubeLongFormChartDataForDisplay.length > 8;

  const storyTicks = useMemo(
    () =>
      buildKeyDateTicks(
        chartByMode,
        (d) =>
          selectedStoryMetrics.some((metric) => {
            const n = d[metric] ?? 0;
            return typeof n === 'number' && n !== 0;
          }),
        10
      ),
    [chartByMode, selectedStoryMetrics]
  );

  const performanceStoryDualAxis = useMemo(() => {
    if (selectedStoryMetrics.length < 2) return false;
    const high = selectedStoryMetrics.filter((m) => STORY_METRICS_HIGH_MAGNITUDE.includes(m));
    const low = selectedStoryMetrics.filter((m) => !STORY_METRICS_HIGH_MAGNITUDE.includes(m));
    if (high.length === 0 || low.length === 0) return false;
    const maxLow = Math.max(
      1,
      ...low.flatMap((m) => chartByMode.map((d) => (typeof d[m] === 'number' ? (d[m] as number) : 0)))
    );
    const maxHigh = Math.max(
      1,
      ...high.flatMap((m) => chartByMode.map((d) => (typeof d[m] === 'number' ? (d[m] as number) : 0)))
    );
    return maxHigh > maxLow * 15;
  }, [selectedStoryMetrics, chartByMode]);

  const trafficTicks = useMemo(
    () => buildKeyDateTicks(trafficTimelineData, (d) => (d.postImpressions ?? 0) > 0 || (d.nonviral ?? 0) > 0 || (d.viral ?? 0) > 0 || (d.uniqueReachProxy ?? 0) > 0, 10),
    [trafficTimelineData]
  );
  const reelsTicks = useMemo(
    () => buildKeyDateTicks(reelsChartData, (d) => (d.views ?? 0) > 0 || (d.watchTimeMinutes ?? 0) > 0 || (d.avgWatchSeconds ?? 0) > 0, 10),
    [reelsChartData]
  );

  const avgPostsPerWeek = postsInRange.length / Math.max(1, dateAxis.length / 7);
  const avgClicksPerPost = postsRows.reduce((s, r) => s + r.clicks, 0) / Math.max(1, postsRows.length);
  const avgInteractionsPerPost = (() => {
    // For Twitter with no synced posts, use live recentTweets as source
    if (isTwitter && postsInRange.length === 0 && twitterRecentTweets.length > 0) {
      const total = twitterRecentTweets.reduce((s, t) => s + (t.like_count ?? 0) + (t.reply_count ?? 0) + (t.retweet_count ?? 0) + (t.quote_count ?? 0), 0);
      return total / twitterRecentTweets.length;
    }
    const sum = postsInRange.reduce((acc, post) => {
      if (isInstagram) return acc + bestInstagramInteractionCount(post);
      if (isTikTok || isTwitter || isYouTube || isLinkedIn) {
        return acc + (post.likeCount ?? 0) + (post.commentsCount ?? 0) + bestShareCount(post);
      }
      return acc + bestCount(post.facebookInsights?.post_reactions_like_total, post.likeCount) + (post.facebookInsights?.post_comments ?? post.commentsCount ?? 0) + bestShareCount(post) + bestRepostCount(post);
    }, 0);
    return sum / Math.max(1, postsInRange.length);
  })();
  const avgReactionsPerPost = (() => {
    // For Twitter with no synced posts, use live recentTweets likes as reactions
    if (isTwitter && postsRows.length === 0 && twitterRecentTweets.length > 0) {
      const total = twitterRecentTweets.reduce((s, t) => s + (t.like_count ?? 0), 0);
      return total / twitterRecentTweets.length;
    }
    return postsRows.reduce((s, r) => s + r.reactionsTotal, 0) / Math.max(1, postsRows.length);
  })();
  const totalReelWatchTimeMs = useMemo(() => {
    if (isYouTube || isPinterest) return reelChartSourceRows.reduce((s, r) => s + r.watchTimeMs, 0);
    return postsRows.filter((r) => r.type === 'Reel').reduce((s, r) => s + r.watchTimeMs, 0);
  }, [isYouTube, isPinterest, reelChartSourceRows, postsRows]);
  const reelClicks = reelChartSourceRows.reduce((s, r) => (
    s + (r.post.platform === 'INSTAGRAM' ? bestInstagramInteractionCount(r.post) : (r.post.facebookInsights?.post_clicks ?? 0))
  ), 0);
  const reelLikes = reelChartSourceRows.reduce((s, r) => s + bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount), 0);
  const reelComments = reelChartSourceRows.reduce((s, r) => s + (r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0), 0);
  const reelShares = reelChartSourceRows.reduce((s, r) => s + bestShareCount(r.post), 0);
  const reelReposts = reelChartSourceRows.reduce((s, r) => s + bestRepostCount(r.post), 0);
  const totalOrganicVideoViews = reelChartSourceRows.reduce((s, r) => s + r.organicViews, 0);
  const totalReelVideoViews = reelChartSourceRows.reduce((s, r) => s + r.views, 0);
  const avgWatchMs = totalReelVideoViews > 0 ? totalReelWatchTimeMs / totalReelVideoViews : 0;
  const totalReelWatchTimeMsDisplay =
    isYouTube && totalReelWatchTimeMs <= 0 && typeof youtubeEstimatedWatchMinutes === 'number' && youtubeEstimatedWatchMinutes > 0
      ? Math.round(youtubeEstimatedWatchMinutes * 60000)
      : totalReelWatchTimeMs;
  const avgWatchMsDisplay =
    isYouTube && avgWatchMs <= 0 && typeof youtubeAvgViewDurationSec === 'number' && youtubeAvgViewDurationSec > 0
      ? Math.round(youtubeAvgViewDurationSec * 1000)
      : avgWatchMs;
  const viewToClickEfficiency =
    reelChartSourceRows.reduce((s, r) => (
      s + (r.post.platform === 'INSTAGRAM' ? bestInstagramInteractionCount(r.post) : (r.post.facebookInsights?.post_clicks ?? 0))
    ), 0) / Math.max(1, totalReelVideoViews);
  const totalShortVideoWatchTimeMs = reelsRows.reduce((s, r) => s + r.watchTimeMs, 0);
  const shortVideoLikes = reelsRows.reduce(
    (s, r) => s + bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount),
    0
  );
  const shortVideoComments = reelsRows.reduce(
    (s, r) => s + (r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0),
    0
  );
  const shortVideoShares = reelsRows.reduce((s, r) => s + bestShareCount(r.post), 0);
  const totalShortVideoViews = reelsRows.reduce((s, r) => s + r.views, 0);
  const shortVideoAvgWatchMs = totalShortVideoViews > 0 ? totalShortVideoWatchTimeMs / totalShortVideoViews : 0;
  const ytChMinForSplit =
    typeof youtubeEstimatedWatchMinutes === 'number' && youtubeEstimatedWatchMinutes > 0 ? youtubeEstimatedWatchMinutes : 0;
  const ytChAvgSecForSplit =
    typeof youtubeAvgViewDurationSec === 'number' && youtubeAvgViewDurationSec > 0 ? youtubeAvgViewDurationSec : 0;
  const totalShortVideoWatchTimeMsDisplay =
    isYouTube && totalShortVideoWatchTimeMs <= 0 && ytChMinForSplit > 0
      ? Math.round(ytChMinForSplit * 60000 * youtubeWatchMinuteShare.shorts)
      : totalShortVideoWatchTimeMs;
  const shortVideoAvgWatchMsDisplay =
    isYouTube && shortVideoAvgWatchMs <= 0 && ytChAvgSecForSplit > 0
      ? Math.round(ytChAvgSecForSplit * 1000)
      : shortVideoAvgWatchMs;
  const totalLongVideoWatchTimeMs = longFormVideoRows.reduce((s, r) => s + r.watchTimeMs, 0);
  const longVideoLikes = longFormVideoRows.reduce(
    (s, r) => s + bestCount(r.post.facebookInsights?.post_reactions_like_total, r.post.likeCount),
    0
  );
  const longVideoComments = longFormVideoRows.reduce(
    (s, r) => s + (r.post.facebookInsights?.post_comments ?? r.post.commentsCount ?? 0),
    0
  );
  const longVideoShares = longFormVideoRows.reduce((s, r) => s + bestShareCount(r.post), 0);
  const longVideoReposts = longFormVideoRows.reduce((s, r) => s + bestRepostCount(r.post), 0);
  const totalLongVideoViews = longFormVideoRows.reduce((s, r) => s + r.views, 0);
  const longVideoAvgWatchMs = totalLongVideoViews > 0 ? totalLongVideoWatchTimeMs / totalLongVideoViews : 0;
  const totalLongVideoWatchTimeMsDisplay =
    isYouTube && totalLongVideoWatchTimeMs <= 0 && ytChMinForSplit > 0
      ? Math.round(ytChMinForSplit * 60000 * youtubeWatchMinuteShare.longForm)
      : totalLongVideoWatchTimeMs;
  const longVideoAvgWatchMsDisplay =
    isYouTube && longVideoAvgWatchMs <= 0 && ytChAvgSecForSplit > 0
      ? Math.round(ytChAvgSecForSplit * 1000)
      : longVideoAvgWatchMs;
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
      views:
        isTwitter
          ? `Tweet impressions: ${fmt(percentChangeFromSeries(videoViewsS))}`
          : isTikTok || isYouTube
          ? `Video Views: ${fmt(percentChangeFromSeries(videoViewsS))}`
          : isLinkedIn
            ? `Impressions (synced): ${fmt(percentChangeFromSeries(videoViewsS))} | Posts published: ${fmt(percentChangeFromSeries(contentViewsS))}`
            : `Video Views: ${fmt(percentChangeFromSeries(videoViewsS))} | Content Views: ${fmt(percentChangeFromSeries(contentViewsS))} | Page Visits: ${fmt(percentChangeFromSeries(pageTabS))}`,
    } as const;
  }, [growthSparklineSeries, isTikTok, isTwitter, isYouTube, isLinkedIn]);
  const likesTotal = useMemo(() => {
    const fromPosts = postsInRange.reduce((sum, post) => sum + bestCount(post.facebookInsights?.post_reactions_like_total, post.likeCount ?? post.engagementBreakdown?.reactions), 0);
    if (isTwitter && twitterRecentTweets.length > 0) {
      return Math.max(fromPosts, twitterRecentTweets.reduce((s, t) => s + (t.like_count ?? 0), 0));
    }
    return fromPosts;
  }, [postsInRange, isTwitter, twitterRecentTweets]);
  const commentsTotal = useMemo(() => {
    const fromPosts = postsInRange.reduce((sum, post) => sum + (post.facebookInsights?.post_comments ?? post.commentsCount ?? post.engagementBreakdown?.comments ?? 0), 0);
    if (isTwitter && twitterRecentTweets.length > 0) {
      return Math.max(fromPosts, twitterRecentTweets.reduce((s, t) => s + (t.reply_count ?? 0), 0));
    }
    return fromPosts;
  }, [postsInRange, isTwitter, twitterRecentTweets]);
  const sharesTotal = useMemo(() => {
    const fromPosts = postsInRange.reduce((sum, post) => sum + bestShareCount(post), 0);
    if (isTwitter && twitterRecentTweets.length > 0) {
      return Math.max(fromPosts, twitterRecentTweets.reduce((s, t) => s + (t.retweet_count ?? 0) + (t.quote_count ?? 0), 0));
    }
    return fromPosts;
  }, [postsInRange, isTwitter, twitterRecentTweets]);
  const repostsTotal = useMemo(() => {
    const fromPosts = postsInRange.reduce((sum, post) => sum + bestRepostCount(post), 0);
    if (isTwitter && twitterRecentTweets.length > 0) {
      return Math.max(fromPosts, twitterRecentTweets.reduce((s, t) => s + (t.retweet_count ?? 0), 0));
    }
    return fromPosts;
  }, [postsInRange, isTwitter, twitterRecentTweets]);
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
      acc[d] = (acc[d] ?? 0) + bestShareCount(post);
      return acc;
    }, {});
    const repostsByDate = postsInRange.reduce<Record<string, number>>((acc, post) => {
      const d = localCalendarDateFromIso(post.publishedAt);
      acc[d] = (acc[d] ?? 0) + bestRepostCount(post);
      return acc;
    }, {});
    // For Twitter: supplement synced-posts data with live recentTweets per day.
    // Use recentTweets as the canonical source (sum across all tweets per day), and take max vs synced posts.
    if (isTwitter && twitterRecentTweets.length > 0) {
      const rtLikes: Record<string, number> = {};
      const rtComments: Record<string, number> = {};
      const rtShares: Record<string, number> = {};
      const rtReposts: Record<string, number> = {};
      for (const t of twitterRecentTweets) {
        const d = localCalendarDateFromIso(t.created_at ?? '');
        if (!d) continue;
        rtLikes[d] = (rtLikes[d] ?? 0) + (t.like_count ?? 0);
        rtComments[d] = (rtComments[d] ?? 0) + (t.reply_count ?? 0);
        rtShares[d] = (rtShares[d] ?? 0) + (t.retweet_count ?? 0) + (t.quote_count ?? 0);
        rtReposts[d] = (rtReposts[d] ?? 0) + (t.retweet_count ?? 0);
      }
      for (const d of Object.keys(rtLikes)) {
        likesByDate[d] = Math.max(likesByDate[d] ?? 0, rtLikes[d]!);
        commentsByDate[d] = Math.max(commentsByDate[d] ?? 0, rtComments[d] ?? 0);
        sharesByDate[d] = Math.max(sharesByDate[d] ?? 0, rtShares[d] ?? 0);
        repostsByDate[d] = Math.max(repostsByDate[d] ?? 0, rtReposts[d] ?? 0);
      }
    }
    return dateAxis.map((date) => ({
      date,
      likes: likesByDate[date] ?? 0,
      comments: commentsByDate[date] ?? 0,
      shares: sharesByDate[date] ?? 0,
      reposts: repostsByDate[date] ?? 0,
    }));
  }, [dateAxis, postsInRange, isTwitter, twitterRecentTweets]);
  const engagementTicks = useMemo(
    () =>
      buildKeyDateTicks(
        engagementData,
        (d) =>
          (d.likes ?? 0) > 0 ||
          (d.comments ?? 0) > 0 ||
          (d.shares ?? 0) > 0 ||
          (d.reposts ?? 0) > 0 ||
          false,
        10
      ),
    [engagementData]
  );
  const engagementTicksSorted = useMemo(
    () => [...engagementTicks].sort((a, b) => a.localeCompare(b)),
    [engagementTicks]
  );
  const engagementStackTopKey = useMemo((): EngagementMetricKey | null => {
    const order = isTikTok ? ENGAGEMENT_STACK_ORDER_TIKTOK : ENGAGEMENT_STACK_ORDER_META;
    const selected = order.filter((k) => {
      if (!selectedEngagementMetrics.includes(k)) return false;
      if (k === 'reposts') return isInstagram || isTwitter;
      return true;
    });
    return selected.length ? selected[selected.length - 1]! : null;
  }, [isInstagram, isTwitter, isTikTok, selectedEngagementMetrics]);
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
    // For Twitter: merge recentTweets into postsByDate when synced posts are absent or smaller.
    if (isTwitter && twitterRecentTweets.length > 0) {
      const rtByDate: Record<string, number> = {};
      for (const t of twitterRecentTweets) {
        const d = localCalendarDateFromIso(t.created_at ?? '');
        if (d) rtByDate[d] = (rtByDate[d] ?? 0) + 1;
      }
      for (const [d, cnt] of Object.entries(rtByDate)) {
        postsByDate[d] = Math.max(postsByDate[d] ?? 0, cnt);
      }
    }
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
      subscriberNet: youtubeGrowthNetByDate[date] ?? 0,
    }));
  }, [actionsSeries, dateAxis, isTwitter, liveConversationDates, postsInRange, totalActions, twitterRecentTweets, youtubeGrowthNetByDate]);
  const operationalTicks = useMemo(
    () =>
      buildKeyDateTicks(
        operationalData,
        (d) =>
          (d.actions ?? 0) > 0 ||
          (d.posts ?? 0) > 0 ||
          (d.conversations ?? 0) > 0 ||
          (d.subscriberNet ?? 0) !== 0,
        10
      ),
    [operationalData]
  );
  const activityChartHasNegative = useMemo(
    () => operationalData.some((d) => (d.subscriberNet ?? 0) < 0),
    [operationalData]
  );
  const performanceChartHasNegativeSubscriberNet = useMemo(
    () => chartByMode.some((d) => (d.subscriberNet ?? 0) < 0),
    [chartByMode]
  );

  // For Twitter when no synced posts, synthesize top-posts entries from recentTweets.
  const twitterFallbackRows = useMemo(() => {
    if (!isTwitter || twitterRecentTweets.length === 0) return [];
    return twitterRecentTweets.map((t) => {
      const rawMt = (t.mediaType ?? '').toLowerCase();
      const isVideo = rawMt === 'video' || rawMt === 'animated_gif';
      return {
        id: t.id,
        date: t.created_at ?? '',
        type: isVideo ? ('Reel' as const) : ('Post' as const),
        preview: t.text,
        permalink: `https://x.com/i/web/status/${t.id}`,
        views: t.impression_count,
        uniqueReach: 0,
        clicks: t.like_count + t.reply_count + t.retweet_count,
        likes: t.like_count,
        reactionsTotal: t.like_count,
        watchTimeMs: 0,
        avgWatchMs: 0,
        reactionBreakdownRaw: undefined,
        status: 'Ready' as const,
        rawPost: { content: t.text, thumbnailUrl: t.thumbnailUrl, mediaType: t.mediaType, platform: 'TWITTER' } as import('./types').FacebookPost,
        value: 0,
      };
    });
  }, [isTwitter, twitterRecentTweets]);
  const effectivePostsRows = isTwitter && postsRows.length === 0 ? twitterFallbackRows : postsRows;
  const topByViews = [...effectivePostsRows].sort((a, b) => b.views - a.views).slice(0, 3).map((p) => ({ ...p, value: p.views, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const topByClicks = [...effectivePostsRows].sort((a, b) => b.clicks - a.clicks).slice(0, 3).map((p) => ({ ...p, value: p.clicks, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const topByReactions = [...effectivePostsRows].sort((a, b) => b.reactionsTotal - a.reactionsTotal).slice(0, 3).map((p) => ({ ...p, value: p.reactionsTotal, content: p.rawPost.content, thumbnailUrl: p.rawPost.thumbnailUrl }));
  const allPostsRows = useMemo(() => {
    return posts.map((p) => {
      const fi = p.facebookInsights ?? {};
      const reactions = parseReactionTotal(fi.post_reactions_by_type_total);
      const isReel = isReelPost(p);
      const hasCore = typeof fi.post_media_view === 'number' || typeof fi.post_impressions_unique === 'number';
      const { watchTimeMs, avgWatchMs } = getWatchTimes(p);
      const withPid = p as FacebookPost & { platformPostId?: string | null };
      return {
        id: p.id,
        date: p.publishedAt,
        type: isReel ? ('Reel' as const) : ('Post' as const),
        preview: p.content ?? '',
        permalink: p.permalinkUrl,
        views: bestPostPlayCount(p),
        uniqueReach: fi.post_impressions_unique ?? 0,
        clicks: bestPostInteractionCount(p),
        likes: fi.post_reactions_like_total ?? p.likeCount ?? 0,
        reactionsTotal: reactions || (fi.post_reactions_like_total ?? p.likeCount ?? 0),
        watchTimeMs,
        avgWatchMs,
        reactionBreakdownRaw: fi.post_reactions_by_type_total,
        status: hasCore ? ('Ready' as const) : ('Partial' as const),
        rawPost: { ...p, platformPostId: withPid.platformPostId ?? null },
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
    const plat = insights?.platform?.toUpperCase() ?? '';
    const pinterest = plat === 'PINTEREST';
    if (historyFilter === 'posts') return allPostsRows.filter((r) => r.type === 'Post');
    if (historyFilter === 'reels') {
      if (pinterest) {
        const videoPins = allPostsRows.filter((r) => {
          const p = r.rawPost;
          const mt = (p.mediaType ?? '').toUpperCase();
          if (mt === 'VIDEO') return true;
          return isVideoishPost(p);
        });
        return videoPins.length > 0 ? videoPins : allPostsRows;
      }
      return allPostsRows.filter((r) => r.type === 'Reel');
    }
    return allPostsRows;
  }, [allPostsRows, historyFilter, insights?.platform]);

  return (
    <div className="p-0 md:p-0.5 space-y-3" style={{ background: COLOR.pageBg, maxWidth: 1400 }}>
      {onUpgrade ? (
        <div className="w-full rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-rose-50/40 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-violet-100/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-violet-800">
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Your plan</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <span className="text-lg font-bold text-neutral-900 tracking-tight leading-tight">Free</span>
              <span className="text-sm text-neutral-600 leading-snug">
                Unlock more than 30 days of history without watermarks and more analytics when you upgrade.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            className="shrink-0 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] gradient-cta-pro"
          >
            Upgrade now
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
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
                        : insights?.platform === 'LINKEDIN'
                          ? 'LI'
                          : insights?.platform === 'TWITTER'
                            ? 'X'
                        : 'FB')
              ).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold" style={{ color: COLOR.text }}>
                  {isTwitter
                    ? (twitterUser?.name?.trim() ||
                        (twitterUser?.username ? `@${twitterUser.username}` : null) ||
                        resolvedUsername ||
                        'X (Twitter)')
                    : isTikTok
                    ? (tiktokCreatorInfo?.creatorNickname ?? tiktokUser?.displayName ?? resolvedUsername ?? 'TikTok')
                    : profile?.name?.trim() ||
                      resolvedUsername ||
                      (insights?.platform === 'INSTAGRAM'
                        ? 'Instagram'
                        : insights?.platform === 'PINTEREST'
                          ? 'Pinterest'
                          : insights?.platform === 'YOUTUBE'
                            ? 'YouTube'
                            : insights?.platform === 'LINKEDIN'
                              ? 'LinkedIn'
                            : 'Facebook Page')}
                </h1>
                {isLinkedIn && linkedInExtras?.profile?.headline ? (
                  <p className="text-xs mt-0.5 max-w-xl leading-snug" style={{ color: COLOR.textSecondary }}>
                    {linkedInExtras.profile.headline}
                  </p>
                ) : null}
              </div>
              {onSync ? (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={postsLoading}
                  className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    color: COLOR.textSecondary,
                    borderColor: COLOR.border,
                    background: 'rgba(255,255,255,0.75)',
                  }}
                >
                  <RefreshCw size={13} className={postsLoading ? 'animate-spin opacity-75' : 'opacity-75'} />
                  {postsLoading ? 'Syncing...' : 'Sync now'}
                </button>
              ) : (
                <span className="text-sm inline-flex items-center gap-2" style={{ color: COLOR.textSecondary }}>
                  <RefreshCw size={13} className="opacity-75" />
                  Updated just now
                </span>
              )}
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
                : insights?.platform === 'LINKEDIN'
                  ? 'Syncing posts from LinkedIn, tables will refresh when sync finishes.'
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
        {!isLinkedIn ? (
        <>
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance</h3>
          </div>
          {isYouTube ? (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="YouTube performance chart presets">
              {YOUTUBE_PERFORMANCE_PRESET_ORDER.map((key) => {
                const preset = YOUTUBE_PERFORMANCE_PRESETS[key];
                const active = activeYoutubePerformancePreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedStoryMetrics([...preset.metrics])}
                    title={`Show on chart: ${preset.label}`}
                    aria-pressed={active}
                    className="rounded-lg px-3 py-1.5 text-sm"
                    style={{
                      background: active ? 'rgba(139,124,255,0.2)' : 'rgba(255,255,255,0.03)',
                      color: active ? COLOR.text : COLOR.textSecondary,
                      border: `1px solid ${active ? COLOR.violet : COLOR.border}`,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!(isTikTok || isTwitter || isYouTube || isLinkedIn) ? (
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
          ) : null}
          {isTikTok ? (
            <>
              <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  label="Total video views"
                  source="video/list · view_count summed from synced videos (all-time)"
                  color={COLOR.amber}
                  value={formatNumber(tiktokTotalVideoViewsValue)}
                  series={growthSparklineSeries.videoViews}
                  active={isCardSelected('videoViews')}
                  onClick={() => toggleStoryMetric('videoViews')}
                  tiktokApiHighlight
                />
                <SparklineMetricCard
                  label="Engagements (range)"
                  source="video/list · likes + comments + shares on posts in range (synced)"
                  color={COLOR.coral}
                  value={formatNumber(tiktokEngagementsInRange)}
                  series={growthSparklineSeries.engagement}
                  active={isCardSelected('engagements')}
                  onClick={() => toggleStoryMetric('engagements')}
                  tiktokApiHighlight
                />
              </div>
            </>
          ) : isTwitter ? (
            <>
              {insights?.twitterTimelineTruncated ? (
                <div
                  className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
                  style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: COLOR.textSecondary }}
                >
                  Timeline fetch stopped before the full history was scanned ({formatNumber(insights.twitterPagesFetched ?? 0)}{' '}
                  page(s) loaded). For very active accounts, try a narrower date range so in-range posts are not cut off.
                </div>
              ) : null}
              <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SparklineMetricCard
                  label="Followers"
                  source="X API v2 · users lookup · public_metrics.followers_count"
                  color={COLOR.mint}
                  value={formatNumber(totalFollowers)}
                  series={growthSparklineSeries.follows}
                  active={isCardSelected('followers')}
                  onClick={() => toggleStoryMetric('followers')}
                />
                <SparklineMetricCard
                  label="Tweet impressions (range)"
                  source="Timeline public_metrics.impression_count summed for original posts in range"
                  color={TIKTOK_PERFORMANCE_LINE_COLORS.videoViews}
                  value={formatNumber(twitterImpressionsInRange)}
                  series={growthSparklineSeries.videoViews}
                  active={isCardSelected('videoViews')}
                  onClick={() => toggleStoryMetric('videoViews')}
                />
                <SparklineMetricCard
                  label="Engagements (range)"
                  source="Likes + replies + reposts + quotes + bookmarks from timeline public_metrics"
                  color={COLOR.coral}
                  value={formatNumber(twitterEngagementsTotal)}
                  series={growthSparklineSeries.engagement}
                  active={isCardSelected('engagements')}
                  onClick={() => toggleStoryMetric('engagements')}
                />
                <SparklineMetricCard
                  label="Posts in range"
                  source="Original posts with created_at in the selected range (replies & pure retweets excluded)"
                  color={TIKTOK_PERFORMANCE_LINE_COLORS.contentViews}
                  value={formatNumber(insights?.recentTweets?.length ?? postsInRange.length)}
                  series={growthSparklineSeries.contentViews}
                  active={isCardSelected('contentViews')}
                  onClick={() => toggleStoryMetric('contentViews')}
                />
              </div>
            </>
          ) : isLinkedIn ? (
            <>
              {(linkedInExtras?.network?.companiesFollowed != null && linkedInExtras.network.companiesFollowed > 0) ||
              (linkedInExtras?.posts?.totalSynced != null && linkedInExtras.posts.totalSynced > 0) ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: COLOR.textSecondary }}>
                  {linkedInExtras?.network?.companiesFollowed != null && linkedInExtras.network.companiesFollowed > 0 ? (
                    <span>Companies you follow (API): {formatNumber(linkedInExtras.network.companiesFollowed)}</span>
                  ) : null}
                  {linkedInExtras?.posts?.totalSynced != null ? (
                    <span>Posts synced (all time): {formatNumber(linkedInExtras.posts.totalSynced)}</span>
                  ) : null}
                </div>
              ) : null}
              {linkedInExtras?.permissionHint ? (
                <div
                  className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
                  style={{ borderColor: COLOR.border, background: COLOR.sectionAlt, color: COLOR.textSecondary }}
                >
                  {linkedInExtras.permissionHint}
                </div>
              ) : null}
              {linkedInExtras?.storedPosts && linkedInExtras.storedPosts.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: COLOR.border, background: COLOR.sectionAlt }}>
                  <div className="border-b px-3 py-2 text-xs font-medium" style={{ borderColor: COLOR.border, color: COLOR.textSecondary }}>
                    Stored post metrics (from our database — last sync)
                  </div>
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr style={{ color: COLOR.textSecondary }}>
                        <th className="px-3 py-2 font-medium">Published</th>
                        <th className="px-3 py-2 font-medium">Impressions</th>
                        <th className="px-3 py-2 font-medium">Likes</th>
                        <th className="px-3 py-2 font-medium">Comments</th>
                        <th className="px-3 py-2 font-medium">Shares</th>
                        <th className="px-3 py-2 font-medium">Post</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedInExtras.storedPosts.map((row) => (
                        <tr key={row.platformPostId} className="border-t" style={{ borderColor: COLOR.border }}>
                          <td className="whitespace-nowrap px-3 py-2" style={{ color: COLOR.text }}>
                            {row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{formatNumber(row.impressions ?? 0)}</td>
                          <td className="px-3 py-2 tabular-nums">{formatNumber(row.likeCount ?? 0)}</td>
                          <td className="px-3 py-2 tabular-nums">{formatNumber(row.commentsCount ?? 0)}</td>
                          <td className="px-3 py-2 tabular-nums">{formatNumber(row.sharesCount ?? 0)}</td>
                          <td className="max-w-[200px] truncate px-3 py-2" style={{ color: COLOR.textSecondary }}>
                            {row.permalinkUrl ? (
                              <a
                                href={row.permalinkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-dotted underline-offset-2"
                                style={{ color: COLOR.violet }}
                              >
                                Open
                              </a>
                            ) : (
                              <span title={row.platformPostId}>{row.contentPreview ?? row.platformPostId.slice(0, 24)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SparklineMetricCard
                  label="Connections"
                  source="LinkedIn · networkSizes (first degree when available)"
                  color={COLOR.mint}
                  value={formatNumber(totalFollowers)}
                  series={growthSparklineSeries.follows}
                  active={isCardSelected('followers')}
                  onClick={() => toggleStoryMetric('followers')}
                />
                <SparklineMetricCard
                  label="Posts in range"
                  source="Synced LinkedIn posts with publish date in the selected range"
                  color={COLOR.amber}
                  value={formatNumber(postsInRange.length)}
                  series={growthSparklineSeries.contentViews}
                  active={isCardSelected('contentViews')}
                  onClick={() => toggleStoryMetric('contentViews')}
                />
                <SparklineMetricCard
                  label="Impressions (synced)"
                  source="Sum of stored impressions on synced posts in range"
                  color={TIKTOK_PERFORMANCE_LINE_COLORS.videoViews}
                  value={formatNumber(Math.max(insights?.impressionsTotal ?? 0, linkedInImpressionsInRange))}
                  series={growthSparklineSeries.videoViews}
                  active={isCardSelected('videoViews')}
                  onClick={() => toggleStoryMetric('videoViews')}
                />
                <SparklineMetricCard
                  label="Engagements (range)"
                  source="Synced posts · likes + comments + shares, or stored interactions when present"
                  color={COLOR.coral}
                  value={formatNumber(Math.max(insights?.reachTotal ?? 0, linkedInEngagementsInRange))}
                  series={growthSparklineSeries.engagement}
                  active={isCardSelected('engagements')}
                  onClick={() => toggleStoryMetric('engagements')}
                />
              </div>
            </>
          ) : isYouTube ? (
            <>
              <div className="mt-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SparklineMetricCard
                  label="Subscribers"
                  source="YouTube Data API · channel statistics"
                  color={COLOR.mint}
                  value={formatNumber(totalFollowers)}
                  series={growthSparklineSeries.follows}
                  active={isCardSelected('followers')}
                  onClick={() => toggleStoryMetric('followers')}
                />
                <SparklineMetricCard
                  label="Views"
                  source="YouTube Analytics API · views by day"
                  color={COLOR.amber}
                  value={formatNumber(youTubeViewsInRange)}
                  series={growthSparklineSeries.videoViews}
                  active={isCardSelected('videoViews')}
                  onClick={() => toggleStoryMetric('videoViews')}
                />
                <SparklineMetricCard
                  label="Engagements"
                  source="Synced videos · likes + comments + shares"
                  color={COLOR.coral}
                  value={formatNumber(youTubeEngagementsInRange)}
                  series={growthSparklineSeries.engagement}
                  active={isCardSelected('engagements')}
                  onClick={() => toggleStoryMetric('engagements')}
                />
                <SparklineMetricCard
                  label="Subscriber net"
                  source="YouTube Analytics · net subscribers gained minus lost per day"
                  color={TIKTOK_PERFORMANCE_LINE_COLORS.subscriberNet}
                  value={formatNumber(youTubeSubscriberNetInRange)}
                  series={growthSparklineSeries.subscriberNet}
                  active={isCardSelected('subscriberNet')}
                  onClick={() => toggleStoryMetric('subscriberNet')}
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
              {selectedStoryMetrics.map((metric) => (
                <span
                  key={metric}
                  className="rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: COLOR.border, color: COLOR.textSecondary, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{
                      background:
                        isTikTok || isTwitter || isYouTube || isLinkedIn
                          ? TIKTOK_PERFORMANCE_LINE_COLORS[metric]
                          : STORY_METRIC_CONFIG[metric].color,
                    }}
                  />
                  {isTikTok
                    ? TIKTOK_PERFORMANCE_LABELS[metric]
                    : isTwitter
                      ? TWITTER_PERFORMANCE_LABELS[metric]
                      : isYouTube
                        ? YOUTUBE_PERFORMANCE_LABELS[metric]
                        : isLinkedIn
                          ? LINKEDIN_PERFORMANCE_LABELS[metric]
                          : STORY_METRIC_CONFIG[metric].label}
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
                <YAxis
                  {...(performanceStoryDualAxis ? { yAxisId: 'left' as const } : {})}
                  domain={
                    selectedStoryMetrics.includes('subscriberNet') && performanceChartHasNegativeSubscriberNet
                      ? ['dataMin', 'dataMax']
                      : [0, 'auto']
                  }
                  allowDecimals={selectedStoryMetrics.some((metric) => metric !== 'followers')}
                  tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                {performanceStoryDualAxis ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 'auto']}
                    allowDecimals
                    tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                ) : null}
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => {
                    const key = n as StoryMetricKey | undefined;
                    const label =
                      isTikTok && key && key in TIKTOK_PERFORMANCE_LABELS
                        ? TIKTOK_PERFORMANCE_LABELS[key]
                        : isTwitter && key && key in TWITTER_PERFORMANCE_LABELS
                          ? TWITTER_PERFORMANCE_LABELS[key]
                          : isYouTube && key && key in YOUTUBE_PERFORMANCE_LABELS
                            ? YOUTUBE_PERFORMANCE_LABELS[key]
                            : isLinkedIn && key && key in LINKEDIN_PERFORMANCE_LABELS
                              ? LINKEDIN_PERFORMANCE_LABELS[key]
                              : key && key in STORY_METRIC_CONFIG
                                ? STORY_METRIC_CONFIG[key].label
                                : String(n ?? '');
                    return [formatNumber(Number(v) || 0), label];
                  }}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedStoryMetrics.map((metric) => (
                  <Line
                    key={metric}
                    {...(performanceStoryDualAxis
                      ? {
                          yAxisId: STORY_METRICS_HIGH_MAGNITUDE.includes(metric) ? ('right' as const) : ('left' as const),
                        }
                      : {})}
                    type="monotone"
                    dataKey={metric}
                    stroke={
                      isTikTok || isTwitter || isYouTube || isLinkedIn
                        ? TIKTOK_PERFORMANCE_LINE_COLORS[metric]
                        : STORY_METRIC_CONFIG[metric].color
                    }
                    strokeWidth={2.2}
                    dot={false}
                  />
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
              source={
                isTikTok
                  ? 'video/list · like_count (synced posts)'
                  : isTwitter
                    ? 'Synced X posts · likeCount (timeline metrics also in Performance table)'
                  : isLinkedIn
                    ? 'Synced LinkedIn posts · likeCount'
                    : 'post_reactions_like_total'
              }
              color={ENGAGEMENT_METRIC_CONFIG.likes.color}
              value={formatNumber(likesTotal)}
              active={selectedEngagementMetrics.includes('likes')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('likes') ? prev.filter((m) => m !== 'likes') : [...prev, 'likes'])}
              tiktokApiHighlight={isTikTok}
            />
            <MetricCard
              label="Comments"
              source={
                isTikTok
                  ? 'video/list · comment_count (synced posts)'
                  : isTwitter
                    ? 'Synced X posts · commentsCount'
                  : isLinkedIn
                    ? 'Synced LinkedIn posts · commentsCount'
                    : 'post_comments'
              }
              color={ENGAGEMENT_METRIC_CONFIG.comments.color}
              value={formatNumber(commentsTotal)}
              active={selectedEngagementMetrics.includes('comments')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('comments') ? prev.filter((m) => m !== 'comments') : [...prev, 'comments'])}
              tiktokApiHighlight={isTikTok}
            />
            <MetricCard
              label="Shares"
              source={
                isTikTok
                  ? 'video/list · share_count (synced posts)'
                  : isTwitter
                    ? 'Synced X posts · sharesCount (native reposts where mapped)'
                  : isLinkedIn
                    ? 'Synced LinkedIn posts · sharesCount'
                  : isInstagram
                    ? 'Instagram media insights · shares metric (requires instagram_manage_insights)'
                    : 'post_shares'
              }
              color={ENGAGEMENT_METRIC_CONFIG.shares.color}
              value={formatNumber(sharesTotal)}
              active={selectedEngagementMetrics.includes('shares')}
              onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
              tiktokApiHighlight={isTikTok}
            />
            {(isTwitter || isInstagram) && (
              <MetricCard
                label="Reposts"
                source={
                  isTwitter
                    ? 'X API timeline · retweet_count (live + synced posts)'
                    : 'Instagram media insights · reposts metric (public reposts to own feed)'
                }
                color={ENGAGEMENT_METRIC_CONFIG.reposts.color}
                value={formatNumber(repostsTotal)}
                active={selectedEngagementMetrics.includes('reposts')}
                onClick={() => setSelectedEngagementMetrics((prev) => prev.includes('reposts') ? prev.filter((m) => m !== 'reposts') : [...prev, 'reposts'])}
              />
            )}
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedEngagementMetrics
                .filter((m) => (m === 'reposts' ? isTwitter || isInstagram : true))
                .map((m) => (
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
                barGap={0}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={engagementTicks}
                  tickFormatter={(value) => {
                    const v = String(value);
                    const idx = engagementTicksSorted.indexOf(v);
                    if (idx < 0) return formatShortDate(v);
                    return formatSparseMonthTick(v, idx, engagementTicksSorted);
                  }}
                  tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                  dy={8}
                  minTickGap={28}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  shared
                  cursor={{ fill: 'rgba(107,114,128,0.20)' }}
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [
                    formatNumber(Number(v) || 0),
                    n === 'likes'
                      ? 'Likes'
                      : n === 'comments'
                        ? 'Comments'
                        : n === 'reposts'
                          ? 'Reposts'
                          : 'Shares',
                  ]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {selectedEngagementMetrics.includes('likes') ? (
                  <Bar
                    dataKey="likes"
                    stackId="engagement"
                    fill={ENGAGEMENT_METRIC_CONFIG.likes.color}
                    radius={engagementStackTopKey === 'likes' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    barSize={UNIFIED_BAR_SIZE}
                    shape={<MinWidthBarShape />}
                  />
                ) : null}
                {selectedEngagementMetrics.includes('comments') ? (
                  <Bar
                    dataKey="comments"
                    stackId="engagement"
                    fill={ENGAGEMENT_METRIC_CONFIG.comments.color}
                    radius={engagementStackTopKey === 'comments' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    barSize={UNIFIED_BAR_SIZE}
                    shape={<MinWidthBarShape />}
                  />
                ) : null}
                {selectedEngagementMetrics.includes('shares') ? (
                  <Bar
                    dataKey="shares"
                    stackId="engagement"
                    fill={ENGAGEMENT_METRIC_CONFIG.shares.color}
                    radius={engagementStackTopKey === 'shares' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    barSize={UNIFIED_BAR_SIZE}
                    shape={<MinWidthBarShape />}
                  />
                ) : null}
                {(isTwitter || isInstagram) && selectedEngagementMetrics.includes('reposts') ? (
                  <Bar
                    dataKey="reposts"
                    stackId="engagement"
                    fill={ENGAGEMENT_METRIC_CONFIG.reposts.color}
                    radius={engagementStackTopKey === 'reposts' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    barSize={UNIFIED_BAR_SIZE}
                    shape={<MinWidthBarShape />}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}
          </InsightChartCard>
        </div>

        </>
        ) : null}

        {process.env.NEXT_PUBLIC_LINKEDIN_CM_DEBUG_PANEL === 'true' && isLinkedIn && socialAccountId ? (
          <LinkedInCommunityApiJsonPanel accountId={socialAccountId} />
        ) : null}

        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Activity</h3>
          </div>
          <div
            className={`grid gap-3 sm:grid-cols-2 ${
              isYouTube ? 'xl:grid-cols-2' : isLinkedIn ? 'xl:grid-cols-1' : 'xl:grid-cols-3'
            }`}
          >
            {isYouTube || isLinkedIn ? null : (
              <MetricCard
                label="Actions"
                source={(bundle?.series.totalActions?.length ?? 0) > 0 ? 'page_total_actions' : 'page_post_engagements (fallback)'}
                color={ACTIVITY_METRIC_CONFIG.actions.color}
                value={formatNumber(totalActions)}
                active={selectedActivityMetrics.includes('actions')}
                onClick={() => setSelectedActivityMetrics((prev) => prev.includes('actions') ? prev.filter((m) => m !== 'actions') : [...prev, 'actions'])}
              />
            )}
            <MetricCard
              label={isYouTube ? 'Videos published' : 'Posts'}
              source={
                isYouTube
                  ? 'Synced channel videos with publish date in range'
                  : isLinkedIn
                    ? 'Synced LinkedIn posts with publish date in range'
                    : 'Derived from posts feed'
              }
              color={ACTIVITY_METRIC_CONFIG.posts.color}
              value={formatNumber(postsInRange.length)}
              active={selectedActivityMetrics.includes('posts')}
              onClick={() => setSelectedActivityMetrics((prev) => prev.includes('posts') ? prev.filter((m) => m !== 'posts') : [...prev, 'posts'])}
            />
            {isYouTube ? (
              <MetricCard
                label="Subscriber net"
                source="YouTube Analytics · net subscribers gained minus lost per day (summed for range)"
                color={ACTIVITY_METRIC_CONFIG.subscriberNet.color}
                value={formatNumber(youTubeSubscriberNetInRange)}
                active={selectedActivityMetrics.includes('subscriberNet')}
                onClick={() =>
                  setSelectedActivityMetrics((prev) =>
                    prev.includes('subscriberNet') ? prev.filter((m) => m !== 'subscriberNet') : [...prev, 'subscriberNet']
                  )
                }
              />
            ) : isLinkedIn || isTikTok ? null : (
              <MetricCard
                label="Conversations"
                source="Messenger conversations"
                color={ACTIVITY_METRIC_CONFIG.conversations.color}
                value={formatNumber(conversationActivityCount)}
                active={selectedActivityMetrics.includes('conversations')}
                onClick={() => setSelectedActivityMetrics((prev) => prev.includes('conversations') ? prev.filter((m) => m !== 'conversations') : [...prev, 'conversations'])}
              />
            )}
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              {selectedActivityMetrics.filter((m) => !(isTikTok && m === 'conversations')).map((m) => (
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
                <YAxis
                  domain={
                    selectedActivityMetrics.includes('subscriberNet') && activityChartHasNegative
                      ? ['dataMin', 'dataMax']
                      : [0, 'auto']
                  }
                  tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }}
                  formatter={(v: number | string | undefined, n?: string) => [
                    formatNumber(Number(v) || 0),
                    n === 'actions'
                      ? 'Actions'
                      : n === 'posts'
                        ? isYouTube
                          ? 'Videos published'
                          : 'Posts'
                        : n === 'conversations'
                          ? 'Conversations'
                          : n === 'subscriberNet'
                            ? 'Subscriber net'
                            : '',
                  ]}
                  labelFormatter={(l) => formatShortDate(String(l))}
                />
                {!isYouTube && selectedActivityMetrics.includes('actions') ? (
                  <Line type="monotone" dataKey="actions" stroke={ACTIVITY_METRIC_CONFIG.actions.color} strokeWidth={2} dot={false} />
                ) : null}
                {selectedActivityMetrics.includes('posts') ? <Line type="monotone" dataKey="posts" stroke={ACTIVITY_METRIC_CONFIG.posts.color} strokeWidth={2} dot={false} /> : null}
                {!isYouTube && !isTikTok && selectedActivityMetrics.includes('conversations') ? (
                  <Line type="monotone" dataKey="conversations" stroke={ACTIVITY_METRIC_CONFIG.conversations.color} strokeWidth={2} dot={false} />
                ) : null}
                {selectedActivityMetrics.includes('subscriberNet') ? (
                  <Line type="monotone" dataKey="subscriberNet" stroke={ACTIVITY_METRIC_CONFIG.subscriberNet.color} strokeWidth={2} dot={false} />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          </InsightChartCard>
        </div>
        </>
        )}

      </section>

      {!isTikTok && !isLinkedIn && !isTwitter ? (
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.traffic} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsTrafficSkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-3" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Traffic</h3>
          </div>
          {isYouTube ? (
            <>
              <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: COLOR.border, background: COLOR.sectionAlt }}>
                <h4 className="text-base font-semibold mb-1" style={{ color: COLOR.text }}>
                  Views by country
                </h4>
                {youtubeGeoBreakdown.pieSlices.length > 0 ? (
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div ref={geoPieWrapRef} className="relative z-10 w-full lg:w-[min(100%,420px)] h-[280px] shrink-0 overflow-visible">
                      <ResponsiveContainer width="100%" height="100%" className="[&_.recharts-wrapper]:overflow-visible">
                        <PieChart>
                          <Pie
                            data={youtubeGeoBreakdown.pieSlices}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={100}
                            paddingAngle={2}
                            label={false}
                            onMouseMove={(data: unknown, index: number, e: React.MouseEvent) => {
                              const rect = geoPieWrapRef.current?.getBoundingClientRect();
                              if (!rect) return;
                              let name: string | undefined;
                              let value: number | undefined;
                              if (data && typeof data === 'object' && data !== null && 'name' in data && 'value' in data) {
                                const d = data as { name: string; value: number };
                                name = String(d.name);
                                value = Number(d.value);
                              } else if (Number.isFinite(index) && youtubeGeoBreakdown.pieSlices[index]) {
                                const s = youtubeGeoBreakdown.pieSlices[index];
                                name = s.name;
                                value = s.value;
                              }
                              if (name === undefined || value === undefined || !Number.isFinite(value)) return;
                              setGeoPieHover({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                                name,
                                value,
                              });
                            }}
                            onMouseLeave={() => setGeoPieHover(null)}
                          >
                            {youtubeGeoBreakdown.pieSlices.map((_, i) => (
                              <Cell key={i} fill={youtubeGeoPieColor(i)} stroke="rgba(255,255,255,0.85)" strokeWidth={1} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      {geoPieHover ? (() => {
                        const totalPie = youtubeGeoBreakdown.list.reduce((s, r) => s + r.value, 0);
                        const pct = totalPie > 0 ? ((geoPieHover.value / totalPie) * 100).toFixed(1) : '0';
                        const text = `${geoPieHover.name}:${formatNumber(geoPieHover.value)}(${pct}%)`;
                        const box = geoPieWrapRef.current;
                        const bw = box?.clientWidth ?? 320;
                        const bh = box?.clientHeight ?? 280;
                        const pad = 8;
                        const tipW = 220;
                        let left = geoPieHover.x + 12;
                        let top = geoPieHover.y + 12;
                        if (left + tipW > bw - pad) left = Math.max(pad, bw - tipW - pad);
                        if (top + 44 > bh - pad) top = Math.max(pad, geoPieHover.y - 44);
                        return (
                          <div
                            className="pointer-events-none absolute z-50 rounded-xl border bg-white px-2.5 py-1.5 text-xs font-medium shadow-xl"
                            style={{ left, top, borderColor: COLOR.border, color: COLOR.text, maxWidth: tipW }}
                          >
                            {text}
                          </div>
                        );
                      })() : null}
                    </div>
                    <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm min-w-0" style={{ color: COLOR.text }}>
                      {youtubeGeoBreakdown.list.slice(0, 12).map((row, i) => (
                        <li key={row.name} className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: youtubeGeoPieColor(i) }} />
                            <span className="truncate font-medium">{row.name}</span>
                          </span>
                          <span className="tabular-nums shrink-0" style={{ color: COLOR.textSecondary }}>
                            {formatNumber(row.value)} <span className="text-neutral-400">({row.sharePct}%)</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm py-6 text-center" style={{ color: COLOR.textSecondary }}>
                    {insights?.demographics?.hint ?? 'No geography breakdown for this range yet. YouTube may omit country rows for low traffic or delayed processing.'}
                  </p>
                )}
              </div>

              {youtubeTrafficSourcesForDisplay.length > 0 ? (
                <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: COLOR.border, background: COLOR.sectionAlt }}>
                  <h4 className="text-base font-semibold mb-3" style={{ color: COLOR.text }}>
                    Traffic sources
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-neutral-100" style={{ borderColor: COLOR.border }}>
                    <table className="w-full min-w-[280px] text-sm border-collapse" style={{ color: COLOR.text }}>
                      <thead>
                        <tr className="border-b" style={{ borderColor: COLOR.border, background: 'rgba(248,250,252,0.9)' }}>
                          <th className="text-left font-semibold py-2.5 px-3" scope="col">Source</th>
                          <th className="text-right font-semibold py-2.5 px-3 tabular-nums" scope="col">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {youtubeTrafficSourcesForDisplay.slice(0, 20).map((row) => (
                          <tr key={row.source} className="border-b border-neutral-100 last:border-0">
                            <td className="py-2.5 px-3 font-medium min-w-0 max-w-[60%]">
                              <span className="line-clamp-2">{formatYoutubeTrafficSource(row.source)}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap" style={{ color: COLOR.textSecondary }}>
                              {formatNumber(row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
          <div
            className={`grid gap-3 sm:grid-cols-2 ${isInstagram || isPinterest ? 'xl:grid-cols-2' : 'xl:grid-cols-4'}`}
          >
            <MetricCard
              label="Post Impressions"
              source="page_posts_impressions"
              color={COLOR.cyan}
              value={formatNumber(postImpressions)}
              active={selectedTrafficMetrics.includes('postImpressions')}
              onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('postImpressions') ? prev.filter((m) => m !== 'postImpressions') : [...prev, 'postImpressions'])}
            />
            {!isInstagram ? (
              <>
                <MetricCard
                  label="Non-viral Impressions"
                  source="page_posts_impressions_nonviral"
                  color={COLOR.trafficNonviralCyan}
                  value={formatNumber(nonviralImpressions)}
                  active={selectedTrafficMetrics.includes('nonviral')}
                  onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('nonviral') ? prev.filter((m) => m !== 'nonviral') : [...prev, 'nonviral'])}
                />
                {!isPinterest ? (
                  <MetricCard
                    label="Viral Impressions"
                    source="page_posts_impressions_viral"
                    color={COLOR.magenta}
                    value={formatNumber(viralImpressions)}
                    active={selectedTrafficMetrics.includes('viral')}
                    onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('viral') ? prev.filter((m) => m !== 'viral') : [...prev, 'viral'])}
                  />
                ) : null}
              </>
            ) : null}
            {!isPinterest ? (
              <MetricCard
                label="Unique Reach"
                source="Sum of post_impressions_unique"
                color={COLOR.amber}
                value={formatNumber(uniqueReachProxy)}
                active={selectedTrafficMetrics.includes('uniqueReachProxy')}
                onClick={() => setSelectedTrafficMetrics((prev) => prev.includes('uniqueReachProxy') ? prev.filter((m) => m !== 'uniqueReachProxy') : [...prev, 'uniqueReachProxy'])}
              />
            ) : null}
          </div>
          {isPinterest ? (
            <p className="text-xs leading-relaxed max-w-[920px]" style={{ color: COLOR.textSecondary }}>
              For Pinterest, <span className="font-medium" style={{ color: COLOR.text }}>Viral impressions</span> and{' '}
              <span className="font-medium" style={{ color: COLOR.text }}>Unique reach proxy</span> are hidden. They do not apply to Pin analytics in this dashboard. Use{' '}
              <span className="font-medium" style={{ color: COLOR.text }}>Post impressions</span> and{' '}
              <span className="font-medium" style={{ color: COLOR.text }}>Pin impressions (non-viral)</span> for traffic in this range.
            </p>
          ) : null}
          {isInstagram ? (
            <p className="text-xs leading-relaxed max-w-[920px]" style={{ color: COLOR.textSecondary }}>
              Meta does not report viral versus non-viral impressions for Instagram the way it does for Facebook Pages, so those breakdowns are not available in this dashboard. Use{' '}
              <span className="font-medium" style={{ color: COLOR.text }}>Post impressions</span> and{' '}
              <span className="font-medium" style={{ color: COLOR.text }}>Unique reach proxy</span> (from account and synced post insights).
            </p>
          ) : null}
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
                  {selectedTrafficMetrics.includes('nonviral') ? <Bar dataKey="nonviral" fill={COLOR.trafficNonviralCyan} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  {selectedTrafficMetrics.includes('uniqueReachProxy') ? <Bar dataKey="uniqueReachProxy" fill={COLOR.amber} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  {selectedTrafficMetrics.includes('viral') ? <Bar dataKey="viral" fill={COLOR.magenta} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                </BarChart>
              </ResponsiveContainer>
            )}
          </InsightChartCard>
            </>
          )}
        </div>
        )}
      </section>
      ) : null}

      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsPostsSkeleton />
        ) : (
        <div className="rounded-[20px] border p-4 sm:p-5 space-y-4" style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
          <div>
            <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>{isTwitter ? 'Tweets' : isPinterest ? 'Pins' : 'Posts'}</h2>
          </div>
          <div
            className={`grid gap-4 sm:grid-cols-2 ${isInstagram || isFacebook || isTikTok || isTwitter || isYouTube || isLinkedIn ? 'xl:grid-cols-3' : ''}`}
          >
            <MetricCard
              label={isTwitter ? 'Total Tweets' : isPinterest ? 'Total Pins' : 'Total Posts'}
              source="Derived from posts in date range"
              color={COLOR.text}
              value={formatNumber(
                isTwitter
                  ? Math.max(postsInRange.length, twitterRecentTweets.length)
                  : postsInRange.length
              )}
            />
            {(isInstagram || isFacebook || isTikTok || isTwitter || isYouTube || isLinkedIn) && (
              <MetricCard
                label="Avg interactions per post"
                source={
                  isTikTok
                    ? 'likes + comments + shares (synced TikTok posts)'
                    : isTwitter
                      ? 'likes + comments + reposts (synced X posts in range)'
                      : isYouTube
                        ? 'likes + comments + shares (synced YouTube videos)'
                        : isLinkedIn
                          ? 'likes + comments + shares (synced LinkedIn posts)'
                          : isInstagram
                            ? 'likes + comments + shares + reposts'
                            : 'likes + comments + shares + reposts (post-level)'
                }
                color={COLOR.text}
                value={avgInteractionsPerPost.toFixed(1)}
              />
            )}
            <MetricCard label="Avg Reactions per Post" source="post_reactions_like_total / breakdown" color={COLOR.text} value={avgReactionsPerPost.toFixed(1)} />
          </div>
          <TopContentHighlights
            platform={insights?.platform}
            clicksLeaderTitle={
              isInstagram || isFacebook || isTikTok || isTwitter || isYouTube || isLinkedIn ? 'Interactions leaders' : 'Clicks leaders'
            }
            clicksMetricLabel={
              isInstagram || isFacebook || isTikTok || isTwitter || isYouTube || isLinkedIn ? 'Interactions' : 'Clicks'
            }
            hideClicksColumn={!(isInstagram || isFacebook || isTikTok || isTwitter || isYouTube || isLinkedIn)}
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
          {isTwitter && twitterTweetChartData.length > 0 ? (
            <InsightChartCard
              title="Tweet Performance"
              chartHeightPx={240}
              legend={[
                { label: 'Impressions', color: REEL_METRIC_CONFIG.views.color },
                { label: 'Likes', color: REEL_METRIC_CONFIG.likes.color },
                { label: 'Comments', color: REEL_METRIC_CONFIG.comments.color },
                { label: 'Reposts', color: REEL_METRIC_CONFIG.shares.color },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={twitterTweetChartData}
                  barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                  barGap={UNIFIED_BAR_GAP}
                  margin={{ top: 4, right: 8, left: 0, bottom: twitterTweetChartData.length > 10 ? 36 : 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    interval={0}
                    angle={twitterTweetChartData.length > 10 ? -32 : 0}
                    textAnchor={twitterTweetChartData.length > 10 ? 'end' : 'middle'}
                    height={twitterTweetChartData.length > 10 ? 64 : undefined}
                    tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                    minTickGap={twitterTweetChartData.length > 10 ? 4 : 0}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(107,114,128,0.20)' }}
                    content={(props) => {
                      const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ dataKey?: string; value?: number }>; label?: string };
                      if (!active || !payload?.length) return null;
                      const labelMap: Record<string, string> = { views: 'Impressions', likes: 'Likes', comments: 'Comments', shares: 'Reposts' };
                      return (
                        <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: '#ffffff', borderColor: COLOR.border }}>
                          <p className="font-medium mb-1.5" style={{ color: COLOR.text }}>{formatShortDate(String(label ?? ''))}</p>
                          {payload.filter((p) => typeof p.value === 'number').map((item) => (
                            <p key={item.dataKey} style={{ color: COLOR.textSecondary }}>
                              {labelMap[item.dataKey as string] ?? item.dataKey}: {formatNumber(item.value ?? 0)}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="views" fill={REEL_METRIC_CONFIG.views.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} />
                  <Bar dataKey="likes" fill={REEL_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} />
                  <Bar dataKey="comments" fill={REEL_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} />
                  <Bar dataKey="shares" fill={REEL_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} />
                </BarChart>
              </ResponsiveContainer>
            </InsightChartCard>
          ) : null}
        </div>
        )}

      </section>

      {!isLinkedIn ? (
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-6">
        {overviewSkeleton ? (
          <AnalyticsReelsSkeleton />
        ) : (
        <div
          className={isYouTube ? 'space-y-6' : 'rounded-[20px] border p-4 sm:p-5 space-y-4'}
          style={
            isYouTube
              ? undefined
              : { borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }
          }
        >
          {!isYouTube ? (
            <div>
              <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>
                {isPinterest ? 'Videos' : 'Reels'}
              </h2>
              {isPinterest ? (
                <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                  Video Pins in this date range, or all synced Pins if none are stored as video. Metrics come from your post inventory.
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: COLOR.text }}>
                Long form videos
              </h2>
            </div>
          )}
        <div className="flex gap-2">
          {([
            { id: 'performance' as const, label: 'Performance' },
            { id: 'engagement' as const, label: 'Engagement' },
            ...(!isTikTok && !isFacebook && !isInstagram && !isTwitter ? [{ id: 'watch' as const, label: 'Watch' }] : []),
          ]).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setReelPreset(preset.id);
                if (isTikTok) {
                  setSelectedReelMetrics([...REEL_PRESET_METRICS_TIKTOK[preset.id]]);
                } else if (isFacebook || isInstagram) {
                  setSelectedReelMetrics(
                    preset.id === 'performance'
                      ? [...REEL_PRESET_METRICS_FB_IG.performance]
                      : [...REEL_PRESET_METRICS_FB_IG.engagement]
                  );
                } else {
                  setSelectedReelMetrics([...REEL_PRESET_METRICS[preset.id]]);
                }
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
        {!isYouTube ? (
        <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Video Views"
            source="post_video_views"
            color={REEL_METRIC_CONFIG.views.color}
            value={formatNumber(totalReelVideoViews)}
            active={selectedReelMetrics.includes('views')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('views') ? prev.filter((m) => m !== 'views') : [...prev, 'views'])}
          />
          {!isTikTok && !isTwitter ? (
            <>
              <MetricCard
                label="Watch Time"
                source="post_video_view_time"
                color={REEL_METRIC_CONFIG.watchTime.color}
                value={formatDurationMs(totalReelWatchTimeMsDisplay)}
                active={selectedReelMetrics.includes('watchTime')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('watchTime') ? prev.filter((m) => m !== 'watchTime') : [...prev, 'watchTime'])}
              />
              <MetricCard
                label="Avg Watch Time"
                source="Mean post_video_avg_time_watched"
                color={REEL_METRIC_CONFIG.avgWatch.color}
                value={formatDurationMs(avgWatchMsDisplay)}
                active={selectedReelMetrics.includes('avgWatch')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('avgWatch') ? prev.filter((m) => m !== 'avgWatch') : [...prev, 'avgWatch'])}
              />
            </>
          ) : null}
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
            source={isInstagram ? 'Instagram media insights · shares metric (DMs + Story shares)' : 'post_shares'}
            color={REEL_METRIC_CONFIG.shares.color}
            value={formatNumber(reelShares)}
            active={selectedReelMetrics.includes('shares')}
            onClick={() => setSelectedReelMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
          />
          {isInstagram && (
            <MetricCard
              label="Reposts"
              source="Instagram media insights · reposts metric (public reposts to own feed)"
              color={REEL_METRIC_CONFIG.reposts.color}
              value={formatNumber(reelReposts)}
              active={selectedReelMetrics.includes('reposts')}
              onClick={() => setSelectedReelMetrics((prev) => prev.includes('reposts') ? prev.filter((m) => m !== 'reposts') : [...prev, 'reposts'])}
            />
          )}
        </div>

        <InsightChartCard
          title={isPinterest ? 'Video Pin performance' : 'Reel Performance'}
          chartHeightPx={reelPerformanceChartHeightPx}
          legend={selectedReelMetrics.map((m) => ({ label: REEL_METRIC_CONFIG[m].label, color: REEL_METRIC_CONFIG[m].color }))}
        >
          {reelsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reelsChartData}
                barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                barGap={UNIFIED_BAR_GAP}
                margin={{ top: 4, right: 8, left: 0, bottom: reelChartAxisDense ? 36 : 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  interval={0}
                  angle={reelChartAxisDense ? -32 : 0}
                  textAnchor={reelChartAxisDense ? 'end' : 'middle'}
                  height={reelChartAxisDense ? 64 : undefined}
                  tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                  minTickGap={reelChartAxisDense ? 4 : 0}
                  axisLine={false}
                  tickLine={false}
                />
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
                {selectedReelMetrics.includes('likes') ? <Bar dataKey="likes" fill={REEL_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('comments') ? <Bar dataKey="comments" fill={REEL_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('shares') ? <Bar dataKey="shares" fill={REEL_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {isInstagram && selectedReelMetrics.includes('reposts') ? <Bar dataKey="reposts" fill={REEL_METRIC_CONFIG.reposts.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('watchTime') ? <Bar dataKey="watchTimeMinutes" fill={REEL_METRIC_CONFIG.watchTime.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                {selectedReelMetrics.includes('avgWatch') ? <Bar dataKey="avgWatchSeconds" fill={REEL_METRIC_CONFIG.avgWatch.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] rounded-[20px] border flex flex-col items-center justify-center text-center px-6" style={{ background: COLOR.card, borderColor: COLOR.border }}>
              <p className="text-sm font-semibold" style={{ color: COLOR.text }}>
                {isPinterest ? 'No Pins in this period' : 'No reels in this period'}
              </p>
              <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                {isPinterest
                  ? 'Connect Pinterest and sync Pins so video Pins (or all Pins) with publish dates in this range appear here.'
                  : 'Reel analytics appears after reels are discovered in your post inventory.'}
              </p>
            </div>
          )}
        </InsightChartCard>
        </>
        ) : (
        <>
        <div
          className="rounded-[20px] border p-4 sm:p-5 space-y-4"
          style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}
        >
            <div>
              <h3 className="text-xl font-semibold tracking-tight" style={{ color: COLOR.text }}>YouTube videos</h3>
              <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                Shorts vs long-form uses your channel’s Shorts playlist and title/description signals — not length alone (regular uploads can be under 3 minutes).
              </p>
            </div>
            {youtubeAnalyticsDebugPayload ? (
              <AnalyticsLocalJsonPanel
                title="Raw YouTube data (JSON)"
                description="Each video includes postUrls (watch and shorts links from the video id), classificationDebug, and channel insights. Expand to view, or copy for debugging."
                data={youtubeAnalyticsDebugPayload}
              />
            ) : null}
            <InsightChartCard
              title="YouTube Shorts performance"
              chartHeightPx={youtubeShortChartHeightPx}
              legend={selectedReelMetrics.map((m) => ({ label: REEL_METRIC_CONFIG[m].label, color: REEL_METRIC_CONFIG[m].color }))}
            >
              {youtubeShortsChartDataForDisplay.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={youtubeShortsChartDataForDisplay}
                    barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                    barGap={UNIFIED_BAR_GAP}
                    margin={{ top: 4, right: 8, left: 0, bottom: youtubeShortChartAxisDense ? 36 : 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      interval={0}
                      angle={youtubeShortChartAxisDense ? -32 : 0}
                      textAnchor={youtubeShortChartAxisDense ? 'end' : 'middle'}
                      height={youtubeShortChartAxisDense ? 64 : undefined}
                      tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                      minTickGap={youtubeShortChartAxisDense ? 4 : 0}
                      axisLine={false}
                      tickLine={false}
                    />
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
                    {selectedReelMetrics.includes('likes') ? <Bar dataKey="likes" fill={REEL_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('comments') ? <Bar dataKey="comments" fill={REEL_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('shares') ? <Bar dataKey="shares" fill={REEL_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {isInstagram && selectedReelMetrics.includes('reposts') ? <Bar dataKey="reposts" fill={REEL_METRIC_CONFIG.reposts.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('watchTime') ? <Bar dataKey="watchTimeMinutes" fill={REEL_METRIC_CONFIG.watchTime.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('avgWatch') ? <Bar dataKey="avgWatchSeconds" fill={REEL_METRIC_CONFIG.avgWatch.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] rounded-[20px] border flex flex-col items-center justify-center text-center px-6" style={{ background: COLOR.card, borderColor: COLOR.border }}>
                  <p className="text-sm font-semibold" style={{ color: COLOR.text }}>No Shorts in this period</p>
                  <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                    Shorts are videos on your channel’s Shorts shelf (synced via YouTube) or marked with #shorts / a /shorts/ link in title or description. Re-sync to refresh playlist membership.
                  </p>
                </div>
              )}
            </InsightChartCard>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total Video Views"
                source="post_video_views (long-form only)"
                color={REEL_METRIC_CONFIG.views.color}
                value={formatNumber(totalLongVideoViews)}
                active={selectedReelMetrics.includes('views')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('views') ? prev.filter((m) => m !== 'views') : [...prev, 'views'])}
              />
              <MetricCard
                label="Watch Time"
                source="YouTube Analytics watch-time share (fallback) or post-level long-form watch time"
                color={REEL_METRIC_CONFIG.watchTime.color}
                value={formatDurationMs(totalLongVideoWatchTimeMsDisplay)}
                active={selectedReelMetrics.includes('watchTime')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('watchTime') ? prev.filter((m) => m !== 'watchTime') : [...prev, 'watchTime'])}
              />
              <MetricCard
                label="Avg Watch Time"
                source="YouTube Analytics average view duration (fallback) or mean long-form watch time"
                color={REEL_METRIC_CONFIG.avgWatch.color}
                value={formatDurationMs(longVideoAvgWatchMsDisplay)}
                active={selectedReelMetrics.includes('avgWatch')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('avgWatch') ? prev.filter((m) => m !== 'avgWatch') : [...prev, 'avgWatch'])}
              />
              <MetricCard
                label="Likes"
                source="post_reactions_like_total"
                color={REEL_METRIC_CONFIG.likes.color}
                value={formatNumber(longVideoLikes)}
                active={selectedReelMetrics.includes('likes')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('likes') ? prev.filter((m) => m !== 'likes') : [...prev, 'likes'])}
              />
              <MetricCard
                label="Comments"
                source="post_comments"
                color={REEL_METRIC_CONFIG.comments.color}
                value={formatNumber(longVideoComments)}
                active={selectedReelMetrics.includes('comments')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('comments') ? prev.filter((m) => m !== 'comments') : [...prev, 'comments'])}
              />
              <MetricCard
                label="Shares"
                source="post_shares"
                color={REEL_METRIC_CONFIG.shares.color}
                value={formatNumber(longVideoShares)}
                active={selectedReelMetrics.includes('shares')}
                onClick={() => setSelectedReelMetrics((prev) => prev.includes('shares') ? prev.filter((m) => m !== 'shares') : [...prev, 'shares'])}
              />
            </div>
            <InsightChartCard
              title="Long-form performance"
              chartHeightPx={youtubeLongChartHeightPx}
              legend={selectedReelMetrics.map((m) => ({ label: REEL_METRIC_CONFIG[m].label, color: REEL_METRIC_CONFIG[m].color }))}
            >
              {youtubeLongFormChartDataForDisplay.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={youtubeLongFormChartDataForDisplay}
                    barCategoryGap={UNIFIED_BAR_CATEGORY_GAP}
                    barGap={UNIFIED_BAR_GAP}
                    margin={{ top: 4, right: 8, left: 0, bottom: youtubeLongChartAxisDense ? 36 : 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,24,39,0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      interval={0}
                      angle={youtubeLongChartAxisDense ? -32 : 0}
                      textAnchor={youtubeLongChartAxisDense ? 'end' : 'middle'}
                      height={youtubeLongChartAxisDense ? 64 : undefined}
                      tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                      minTickGap={youtubeLongChartAxisDense ? 4 : 0}
                      axisLine={false}
                      tickLine={false}
                    />
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
                    {selectedReelMetrics.includes('likes') ? <Bar dataKey="likes" fill={REEL_METRIC_CONFIG.likes.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('comments') ? <Bar dataKey="comments" fill={REEL_METRIC_CONFIG.comments.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('shares') ? <Bar dataKey="shares" fill={REEL_METRIC_CONFIG.shares.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {isInstagram && selectedReelMetrics.includes('reposts') ? <Bar dataKey="reposts" fill={REEL_METRIC_CONFIG.reposts.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('watchTime') ? <Bar dataKey="watchTimeMinutes" fill={REEL_METRIC_CONFIG.watchTime.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                    {selectedReelMetrics.includes('avgWatch') ? <Bar dataKey="avgWatchSeconds" fill={REEL_METRIC_CONFIG.avgWatch.color} radius={[6, 6, 0, 0]} barSize={UNIFIED_BAR_SIZE} shape={<MinWidthBarShape />} /> : null}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] rounded-[20px] border flex flex-col items-center justify-center text-center px-6" style={{ background: COLOR.card, borderColor: COLOR.border }}>
                  <p className="text-sm font-semibold" style={{ color: COLOR.text }}>No long-form videos in this period</p>
                  <p className="mt-1 text-sm" style={{ color: COLOR.textSecondary }}>
                    Long-form is everything not classified as Shorts (including short-length regular uploads). Re-sync if splits look wrong.
                  </p>
                </div>
              )}
            </InsightChartCard>
          </div>
        </>
        )}
        </div>
        )}
      </section>
      ) : null}

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
              { id: 'all' as const, label: 'All' },
              { id: 'posts' as const, label: isTwitter ? 'Tweets' : isPinterest ? 'Pins' : 'Posts' },
              { id: 'reels' as const, label: isPinterest ? 'Videos' : 'Reels' },
            ]).map((f) => (
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
          {(() => {
            const twitterFallback = isTwitter && contentHistoryRows.length === 0
              ? twitterFallbackRows.filter((r) =>
                  historyFilter === 'all' ? true :
                  historyFilter === 'reels' ? r.type === 'Reel' :
                  r.type === 'Post'
                )
              : [];
            const historyRows = contentHistoryRows.length > 0 ? contentHistoryRows : twitterFallback;
            if (postsLoading && historyRows.length === 0) {
              return (
                <div className="rounded-[20px] border p-6 space-y-3" style={{ background: COLOR.card, borderColor: COLOR.border }}>
                  <p className="text-sm font-medium" style={{ color: COLOR.text }}>Loading content history…</p>
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: 'rgba(15,23,42,0.06)' }} />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <PostsPerformanceTable
                rows={historyRows}
                clicksColumnLabel={isInstagram || isTikTok || isLinkedIn || isTwitter ? 'Interactions' : 'Clicks'}
                hideClicksColumn={isInstagram}
                platform={insights?.platform}
              />
            );
          })()}
        </div>
        )}
      </section>

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

      {insights?.insightsHint && !isTikTok && !isLinkedIn && !isTwitter && !isLegacyInstagramInsightsUnavailableHint(insights.insightsHint) ? (
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
