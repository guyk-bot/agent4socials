'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { ANALYTICS_CHART_SELECT_METRIC_MESSAGE } from '@/lib/analytics-chart-messages';
import { AnalyticsDateRangePicker } from '@/components/analytics/AnalyticsDateRangePicker';
import {
  getDefaultAnalyticsDateRange,
  readStoredAnalyticsDateRange,
  toLocalCalendarDate,
  writeStoredAnalyticsDateRange,
} from '@/lib/calendar-date';
import { readUnifiedSummaryCache, writeUnifiedSummaryCache } from '@/lib/dashboard-unified-summary-cache';
import { createMinWidthStackedBarShape } from '@/lib/recharts-stacked-bar-shape';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  Eye,
  Heart,
  FileText,
  ExternalLink,
  Image as ImageIcon,
  Film,
  Calendar,
  Sparkles,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
  YoutubeIcon,
  XTwitterIcon,
  LinkedinIcon,
  PinterestIcon,
} from '@/components/SocialPlatformIcons';
import type {
  UnifiedChartData,
  UnifiedTopPost,
  UnifiedHistoryPost,
  UnifiedSummaryResponse,
  UnifiedKpiSummary,
  UnifiedPostsBreakdownDay,
} from '@/lib/analytics/unified-metrics-types';
import { PLATFORM_COLOR, CHART_PLATFORMS, PLATFORM_LABEL } from '@/lib/analytics/unified-metrics-types';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import {
  StickySectionNav,
  FACEBOOK_ANALYTICS_SECTION_IDS,
  MetricCard,
  InsightChartCard,
} from '@/components/analytics/facebook/FacebookAnalyticsView';

// ─── Shared color tokens (identical to FacebookAnalyticsView COLOR) ───────────

const COLOR = {
  pageBg: '#f6f7fb',
  section: '#ffffff',
  card: '#ffffff',
  border: 'rgba(17,24,39,0.06)',
  text: '#111827',
  textSecondary: '#667085',
  textMuted: '#98a2b3',
  violet: '#ff7a00',
  mint: '#31c48d',
  amber: '#f5b942',
  coral: '#ff8b7b',
  magenta: '#d946ef',
  cyan: '#ff7a00',
} as const;

const CONSOLE_ENGAGEMENT_ACCENT = '#f59e0b';
const CONSOLE_VIEWS_ACCENT = '#f97316';

/** Console-specific platform colors for the Performance per platform section. */
const CONSOLE_PLATFORM_COLOR: Record<string, string> = {
  ...PLATFORM_COLOR,
  Instagram: '#f356ff',
  LinkedIn: '#f5b942',
  Pinterest: '#f97316',
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Full integer for followers and growth tooltips (no 1.0K rounding). */
function fmtExactInt(n: number): string {
  const x = Math.round(Number(n) || 0);
  return x.toLocaleString('en-US');
}

/**
 * When Growth shows one platform, zoom the Y axis around that series so a change of a few
 * followers is visible. With multiple platforms, scales differ too much for one axis.
 */
function growthAudienceYDomain(data: UnifiedChartData, activePlatforms: string[]): [number, number] | undefined {
  if (activePlatforms.length !== 1 || data.length === 0) return undefined;
  const p = activePlatforms[0];
  const vals = data.map((r) => Number((r as Record<string, number>)[p] ?? 0)).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return undefined;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo;
  const pad = Math.max(1, Math.ceil(span * 0.12 + 3));
  return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
}

function fmtPct(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  const sign = x > 0 ? '+' : '';
  const ax = Math.abs(x);
  // Show more precision for small % moves; avoid misleading rounding like +0.0% when it's +0.04%.
  if (ax !== 0 && ax < 0.1) return `${sign}${x.toFixed(2)}%`;
  if (ax < 10) return `${sign}${x.toFixed(2)}%`;
  if (ax < 100) return `${sign}${x.toFixed(1)}%`;
  if (ax < 1000) return `${sign}${Math.round(x * 10) / 10}%`;
  return `${sign}${Math.round(x)}%`;
}

function followerSeriesGrowthPct(series: Array<{ followers: number }>): number {
  const vals = series.map((p) => Math.round(Number(p.followers) || 0));
  if (vals.length === 0) return 0;
  const start = vals[0] ?? 0;
  const end = vals[vals.length - 1] ?? 0;
  if (start > 0) return ((end - start) / start) * 100;
  // If the series begins at 0 (common when tracking starts mid-range), anchor growth to the first non-zero point.
  let baseline = 0;
  for (const v of vals) {
    if (v > 0) {
      baseline = v;
      break;
    }
  }
  if (baseline > 0) return ((end - baseline) / baseline) * 100;
  if (end === 0) return 0;
  // No positive baseline in-window: show true relative scale vs a 1-follower baseline (not a fake +100%).
  return (end / 1) * 100;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Tooltip: full context (not abbreviated axis ticks). */
function fmtTooltipDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function rowMetric(row: Record<string, unknown>, key: string): number {
  return Math.round(Number(row[key] ?? 0));
}

/**
 * X-axis tick dates: calendar 1st (always labeled) plus any day where at least one of `metricKeys`
 * changed vs the previous row (chronological by `date`).
 */
function buildConsoleAxisTicks(series: Array<{ date: string }>, metricKeys: string[]): string[] {
  if (series.length === 0) return [];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const keys = metricKeys.filter(Boolean);
  const monthTicks = new Set<string>();
  for (const row of sorted) {
    const d = new Date(`${row.date}T12:00:00`);
    if (!Number.isNaN(d.getTime()) && d.getDate() === 1) monthTicks.add(row.date);
  }
  if (keys.length === 0) {
    if (monthTicks.size === 0 && sorted.length > 0) {
      monthTicks.add(sorted[0].date);
      if (sorted.length > 1) monthTicks.add(sorted[sorted.length - 1].date);
    }
    return Array.from(monthTicks).sort((a, b) => a.localeCompare(b));
  }
  const eventCandidates: Array<{ date: string; score: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as unknown as Record<string, unknown>;
    const cur = sorted[i] as unknown as Record<string, unknown>;
    let score = 0;
    for (const k of keys) {
      score += Math.abs(rowMetric(prev, k) - rowMetric(cur, k));
    }
    if (score > 0) eventCandidates.push({ date: String(cur.date), score });
  }
  if (eventCandidates.length === 0 && sorted.length > 0) {
    monthTicks.add(sorted[0].date);
    if (sorted.length > 1) monthTicks.add(sorted[sorted.length - 1].date);
    return Array.from(monthTicks).sort((a, b) => a.localeCompare(b));
  }
  const daysSpan = Math.max(1, sorted.length);
  // Show more event dates (especially spikes) while still preventing label collisions.
  const maxEventTicks = daysSpan <= 45 ? 16 : daysSpan <= 90 ? 12 : 9;
  const minGapDays = daysSpan <= 45 ? 1 : daysSpan <= 90 ? 2 : 3;
  const monthExclusionDays = 1;
  const toDayNum = (ymd: string) => Math.floor(new Date(`${ymd}T12:00:00`).getTime() / 86_400_000);
  const selectedEvents: string[] = [];
  const sortedByImpact = [...eventCandidates].sort((a, b) => b.score - a.score);
  const monthsDayNums = Array.from(monthTicks).map(toDayNum);
  for (const ev of sortedByImpact) {
    if (selectedEvents.length >= maxEventTicks) break;
    const evDay = toDayNum(ev.date);
    // Keep month labels readable by avoiding day labels that collide around month-start ticks.
    if (monthsDayNums.some((m) => Math.abs(m - evDay) <= monthExclusionDays)) continue;
    const tooCloseToChosen = selectedEvents.some((d) => Math.abs(toDayNum(d) - evDay) < minGapDays);
    if (tooCloseToChosen) continue;
    selectedEvents.push(ev.date);
  }
  const out = new Set<string>([...Array.from(monthTicks), ...selectedEvents]);
  if (out.size === 0 && sorted.length > 0) {
    out.add(sorted[0].date);
    if (sorted.length > 1) out.add(sorted[sorted.length - 1].date);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

/** Label: long month on the 1st; shorter label on other tick days (event days). */
function formatConsoleAxisTickLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  if (d.getDate() === 1) {
    // Show month label only once per month across the axis.
    return d.toLocaleDateString('en-US', { month: 'long' });
  }
  // For non-month-start ticks, show only day number to avoid repeated month text.
  return String(d.getDate());
}

/** Map SocialAccount.platform (e.g. FACEBOOK) to unified chart label (e.g. Meta). */
function chartLabelForAccountPlatform(platform: string): string | null {
  const key = (platform || '').toUpperCase();
  return PLATFORM_LABEL[key] ?? null;
}

/** Change in series from first to last day (Growth). Sum over range (Engagement / Views). */
function platformPresetMetric(
  rows: UnifiedChartData,
  platform: string,
  preset: 'growth' | 'engagement' | 'views'
): number {
  if (rows.length === 0) return 0;
  if (preset === 'growth') {
    const first = Number((rows[0] as Record<string, number>)[platform] ?? 0);
    const last = Number((rows[rows.length - 1] as Record<string, number>)[platform] ?? 0);
    return Math.round(last - first);
  }
  let sum = 0;
  for (const row of rows) {
    sum += Number((row as Record<string, number>)[platform] ?? 0);
  }
  return Math.round(sum);
}

function formatLegendMetric(preset: 'growth' | 'engagement' | 'views', value: number): string {
  if (preset === 'growth') {
    if (value === 0) return '0';
    const abs = fmtExactInt(Math.abs(value));
    return `${value > 0 ? '+' : '-'}${abs}`;
  }
  return fmt(value);
}

function consolePlatformDisplayName(platform: string): string {
  if (platform === 'Meta') return 'Facebook';
  if (platform === 'X') return 'Twitter/X';
  return platform;
}

function sumPlatformsForRow(row: Record<string, unknown>, platforms: string[]): number {
  let total = 0;
  for (const p of platforms) total += Number(row[p] ?? 0);
  return Math.round(total);
}

/** Pairs items for a 2-column legend so each row is one shared baseline (left + right). */
function chunkIntoPairs<T>(items: readonly T[]): Array<[T, T | undefined]> {
  const out: Array<[T, T | undefined]> = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push([items[i]!, items[i + 1]]);
  }
  return out;
}

type PlatformLiveFallback = {
  viewsSeries?: Array<{ date: string; value: number }>;
  engagementSeries?: Array<{ date: string; value: number }>;
  viewsTotal?: number;
  engagementTotal?: number;
};

type PostTypeKey = 'all' | 'reels' | 'image' | 'carousel';

const POST_TYPE_LABEL: Record<PostTypeKey, string> = {
  all: 'All',
  reels: 'Videos',
  image: 'Image',
  carousel: 'Carousel',
};

function youtubeUrlIndicatesShortsPath(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim().toLowerCase();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.pathname.toLowerCase().includes('/shorts/');
  } catch {
    return u.includes('/shorts/');
  }
}

function classifyConsolePostType(
  mediaType: string | null | undefined,
  url: string | null | undefined,
  platform?: string | null
): PostTypeKey | null {
  const plat = String(platform ?? '').toUpperCase();
  if (plat === 'YOUTUBE' && youtubeUrlIndicatesShortsPath(url)) return 'reels';
  const mt = String(mediaType ?? '').toUpperCase();
  // X text-only tweets (and some LinkedIn / Pinterest rows) sync with no mediaType; they must
  // still roll into the Console posts chart / pie. Treat as a generic non-video post bucket.
  if (!mt) {
    if (plat === 'TWITTER' || plat === 'X' || plat === 'LINKEDIN' || plat === 'PINTEREST') return 'image';
    return null;
  }
  if (mt === 'REEL' || mt === 'VIDEO' || mt === 'SHORT') return 'reels';
  if (mt === 'CAROUSEL' || mt === 'ALBUM' || mt === 'CAROUSEL_ALBUM' || mt.includes('CAROUSEL')) return 'carousel';
  if (mt === 'IMAGE' || mt === 'PHOTO' || mt === 'PIN' || mt === 'PIN_IMAGE' || mt === 'STORY' || mt === 'TEXT' || mt === 'NOTE') return 'image';
  return null;
}

function normalizeHistoryPlatform(platform: string): string {
  if (platform === 'Facebook') return 'Meta';
  if (platform === 'Twitter/X') return 'X';
  return platform;
}

function postsEligiblePlatformsForPreset(
  platforms: string[],
  preset: PostTypeKey
): string[] {
  if (preset === 'image' || preset === 'carousel') {
    return platforms.filter((p) => p !== 'YouTube');
  }
  return platforms;
}

const CONSOLE_FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000;

type ConsoleFallbackSeries = {
  viewsSeries?: Array<{ date: string; value: number }>;
  engagementSeries?: Array<{ date: string; value: number }>;
  viewsTotal?: number;
  engagementTotal?: number;
};

/**
 * Always returns whatever is cached in localStorage so Twitter/X, Pinterest, and LinkedIn
 * leader rows render instantly on revisits. `isFresh` tells the caller whether a
 * background refresh is still needed (stale-while-revalidate).
 */
function readConsoleFallbackCache(
  key: string
): { data: ConsoleFallbackSeries | null; isFresh: boolean } {
  if (typeof window === 'undefined') return { data: null, isFresh: false };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { data: null, isFresh: false };
    const parsed = JSON.parse(raw) as {
      ts?: number;
      viewsSeries?: Array<{ date: string; value: number }>;
      engagementSeries?: Array<{ date: string; value: number }>;
    };
    const data: ConsoleFallbackSeries = {
      viewsSeries: Array.isArray(parsed.viewsSeries) ? parsed.viewsSeries : [],
      engagementSeries: Array.isArray(parsed.engagementSeries) ? parsed.engagementSeries : [],
    };
    const isFresh = typeof parsed?.ts === 'number' && Date.now() - parsed.ts <= CONSOLE_FALLBACK_CACHE_TTL_MS;
    return { data, isFresh };
  } catch {
    return { data: null, isFresh: false };
  }
}

function writeConsoleFallbackCache(
  key: string,
  value: {
    viewsSeries?: Array<{ date: string; value: number }>;
    engagementSeries?: Array<{ date: string; value: number }>;
    viewsTotal?: number;
    engagementTotal?: number;
  }
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ts: Date.now(),
        viewsSeries: value.viewsSeries ?? [],
        engagementSeries: value.engagementSeries ?? [],
      })
    );
  } catch {
    // ignore cache write failures
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
      }}
    />
  );
}

// ─── Platform icon helpers ────────────────────────────────────────────────────

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  switch (platform) {
    case 'Instagram': return <InstagramIcon size={size} />;
    case 'Meta': return <FacebookIcon size={size} />;
    case 'X': return <XTwitterIcon size={size} className="text-neutral-700" />;
    case 'LinkedIn': return <LinkedinIcon size={size} />;
    case 'YouTube': return <YoutubeIcon size={size} />;
    case 'TikTok': return <TikTokIcon size={size} />;
    case 'Pinterest': return <PinterestIcon size={size} />;
    default: return <FileText size={size} style={{ color: COLOR.textMuted }} />;
  }
}

const CONSOLE_ACCOUNT_PLATFORM_ORDER = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'PINTEREST', 'TWITTER'] as const;

/** Stable fallback so `useMemo` / `useEffect` deps are not a new `[]` every render (avoids update loops). */
const EMPTY_SOCIAL_ACCOUNTS: SocialAccount[] = [];
const CHART_PLATFORMS_FALLBACK: string[] = [...CHART_PLATFORMS];
const CONSOLE_PERF_PLATFORM_ORDER = ['Instagram', 'Meta', 'YouTube', 'TikTok', 'X', 'LinkedIn', 'Pinterest'] as const;

const EMPTY_KPI: UnifiedKpiSummary = {
  totalAudience: 0,
  totalImpressions: 0,
  totalEngagement: 0,
  totalPosts: 0,
  audienceGrowthPercentage: 0,
  impressionsGrowthPercentage: 0,
  engagementGrowthPercentage: 0,
  postsGrowthPercentage: 0,
};

function normalizeUnifiedSummary(d: UnifiedSummaryResponse): UnifiedSummaryResponse {
  return {
    ...d,
    kpi: d?.kpi ? { ...EMPTY_KPI, ...d.kpi } : EMPTY_KPI,
    chart: Array.isArray(d?.chart) ? d.chart : [],
    audienceChart: Array.isArray(d?.audienceChart) ? d.audienceChart : [],
    engagementChart: Array.isArray(d?.engagementChart) ? d.engagementChart : [],
    engagementBreakdown: Array.isArray(d?.engagementBreakdown) ? d.engagementBreakdown : [],
    activityBreakdown: Array.isArray(d?.activityBreakdown) ? d.activityBreakdown : [],
    postsBreakdown: Array.isArray(d?.postsBreakdown) ? d.postsBreakdown : [],
    topPosts: Array.isArray(d?.topPosts) ? d.topPosts : [],
    history: Array.isArray(d?.history) ? d.history : [],
  };
}

function AccountBadgeIcon({ platform, size = 20 }: { platform: string; size?: number }) {
  const p = (platform || '').toUpperCase();
  switch (p) {
    case 'FACEBOOK': return <FacebookIcon size={size} />;
    case 'INSTAGRAM': return <InstagramIcon size={size} />;
    case 'TIKTOK': return <TikTokIcon size={size} />;
    case 'YOUTUBE': return <YoutubeIcon size={size} />;
    case 'TWITTER': return <XTwitterIcon size={size} className="text-neutral-800" />;
    case 'LINKEDIN': return <LinkedinIcon size={size} />;
    case 'PINTEREST': return <PinterestIcon size={size} />;
    default: return <span className="text-[8px] font-bold text-neutral-400">{p.slice(0, 1) || '?'}</span>;
  }
}

// ─── KPI Card (original colored style) ────────────────────────────────────────

function KpiCard({ label, value, growthPct, icon, accent, active, onClick }: {
  label: string;
  value: string;
  growthPct: number;
  icon: React.ReactNode;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const positive = growthPct >= 0;
  const noChange = Math.abs(growthPct) < 0.005;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      style={{
        background: active ? `${accent}12` : `${accent}08`,
        border: 'none',
        borderRadius: 14,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: active ? `0 0 0 1px ${accent}33, 0 4px 14px ${accent}22` : '0 1px 3px rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: 0.03, textTransform: 'uppercase' }}>{label}</span>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: `${accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>{icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {noChange ? <Minus size={12} color="#94a3b8" /> : positive ? <TrendingUp size={12} color="#22c55e" /> : <TrendingDown size={12} color="#ef4444" />}
        <span style={{ fontSize: 11, fontWeight: 600, color: noChange ? '#94a3b8' : positive ? '#22c55e' : '#ef4444' }}>
          {noChange ? 'No change' : fmtPct(growthPct)}
        </span>
      </div>
    </button>
  );
}

// ─── Platform mix chart: lines (growth / views); grouped bars = candles (engagement) ─

function PlatformMixChart({
  data,
  activePlatforms,
  performanceMode,
}: {
  data: UnifiedChartData;
  activePlatforms: string[];
  performanceMode: 'growth' | 'engagement' | 'views';
}) {
  const growthDomain = performanceMode === 'growth' ? growthAudienceYDomain(data, activePlatforms) : undefined;
  const valueFmt = performanceMode === 'growth' ? (v: number) => fmtExactInt(v) : (v: number) => fmt(v);
  const platformKey = activePlatforms.join('|');
  const axisTicks = useMemo(
    () =>
      buildConsoleAxisTicks(
        data,
        activePlatforms.length > 0 ? activePlatforms : ([...CHART_PLATFORMS] as string[])
      ),
    [data, platformKey]
  );

  const stackKeysForEngagement = useMemo(
    () => (activePlatforms.length > 0 ? activePlatforms : ([...CHART_PLATFORMS] as string[])),
    [platformKey],
  );

  const engagementStackMax = useMemo(() => {
    const keys = stackKeysForEngagement;
    let max = 0;
    for (const row of data) {
      let s = 0;
      for (const p of keys) {
        s += Number((row as Record<string, unknown>)[p] ?? 0);
      }
      max = Math.max(max, s);
    }
    return max <= 0 ? 1 : Math.ceil(max * 1.14);
  }, [data, stackKeysForEngagement]);

  const ConsoleEngagementStackBarShape = useMemo(
    () => createMinWidthStackedBarShape(stackKeysForEngagement, { radius: 6, minWidth: 10 }),
    [stackKeysForEngagement],
  );

  const lineChartYDomain = growthDomain ?? (['auto', 'auto'] as const);

  if (performanceMode === 'engagement') {
    /** Stacked bars (one column per day) so every platform shares full width — small slices stay visible vs grouped thin columns. */
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          barCategoryGap="18%"
          margin={{ top: 16, right: 8, left: -12, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={axisTicks}
            tickFormatter={formatConsoleAxisTickLabel}
            tick={{ fontSize: 10, fill: COLOR.textMuted }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            domain={[0, engagementStackMax]}
            tickFormatter={(v) => valueFmt(Number(v))}
            tick={{ fontSize: 11, fill: COLOR.textMuted }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
            labelFormatter={(v) => fmtTooltipDate(String(v))}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [valueFmt(Number(value) ?? 0), consolePlatformDisplayName(String(name ?? ''))]}
            cursor={{ fill: 'rgba(107,114,128,0.08)' }}
          />
          {activePlatforms.map((p) => {
            const c = CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p] ?? COLOR.textSecondary;
            return (
              <Bar
                key={p}
                dataKey={p}
                stackId="engagement-stack"
                name={consolePlatformDisplayName(p)}
                fill={c}
                shape={ConsoleEngagementStackBarShape}
                isAnimationActive={false}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
        <XAxis
          dataKey="date"
          ticks={axisTicks}
          tickFormatter={formatConsoleAxisTickLabel}
          tick={{ fontSize: 10, fill: COLOR.textMuted }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          domain={lineChartYDomain}
          tickFormatter={(v) => valueFmt(Number(v))}
          tick={{ fontSize: 11, fill: COLOR.textMuted }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
          labelFormatter={(v) => fmtTooltipDate(String(v))}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [valueFmt(Number(value) ?? 0), name ?? '']}
        />
        {activePlatforms.map((p) => (
          <Line
            key={p}
            type="monotone"
            dataKey={p}
            stroke={CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Legend pills (metric toggles: likes, comments, etc.) ─────────────────────

function LegendPill({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border px-2.5 py-1 text-xs transition-colors" style={{
      borderColor: active ? color : COLOR.border, color: active ? color : COLOR.textMuted,
      background: active ? `${color}12` : 'rgba(255,255,255,0.02)',
    }}>
      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: active ? color : '#d1d5db' }} />
      {label}
    </button>
  );
}

function DotLegendPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
      style={{ borderColor: COLOR.border, background: 'rgba(255,255,255,0.02)', color: COLOR.textSecondary }}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** One legend line: flex spacer pushes [dot + name] flush next to value + %; dots share one vertical line. */
function ConsolePieLegendMetricRow({
  dotColor,
  label,
  valueText,
  percentText,
  className = '',
  style,
  role,
  'aria-label': ariaLabel,
  stretch = false,
}: {
  dotColor: string;
  label: string;
  valueText: string;
  percentText: string;
  className?: string;
  style?: React.CSSProperties;
  role?: 'status';
  'aria-label'?: string;
  /** Total row: allow full label width (no truncate). */
  stretch?: boolean;
}) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      style={style}
      className={`flex h-full min-h-0 w-full min-w-0 items-center gap-x-2 py-2.5 ${className}`}
    >
      <span className="min-w-0 flex-1 shrink" aria-hidden />
      <span
        className={`inline-flex min-w-0 items-center gap-x-2 ${stretch ? 'max-w-none' : 'max-w-[11rem] sm:max-w-[12rem]'}`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dotColor }} aria-hidden />
        <span
          className={`min-w-0 text-left text-sm ${stretch ? '' : 'truncate'}`}
          style={{ color: COLOR.text }}
        >
          {label}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: COLOR.text }}>
        {valueText}
      </span>
      <span className="shrink-0 text-xs tabular-nums whitespace-nowrap" style={{ color: COLOR.textMuted }}>
        {percentText}
      </span>
    </div>
  );
}

/** Text cards toggles; shows platform + change/total for current preset. */
function PlatformLegend({
  activePlatforms,
  toggle,
  all,
  preset,
  chartData,
}: {
  activePlatforms: string[];
  toggle: (p: string) => void;
  all: string[];
  preset: 'growth' | 'engagement' | 'views';
  chartData: UnifiedChartData;
}) {
  return (
    <div className="flex flex-nowrap justify-end gap-1.5" role="group" aria-label="Platforms shown on chart">
      {all.map((p) => {
        const active = activePlatforms.includes(p);
        const raw = platformPresetMetric(chartData, p, preset);
        const metricText = formatLegendMetric(preset, raw);
        const platformColor = CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p] ?? COLOR.textSecondary;
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            aria-pressed={active}
            aria-label={`${p}, ${preset === 'growth' ? 'change in range' : 'total in range'} ${metricText}`}
            title={`${p}: ${metricText}`}
            className="inline-flex min-w-[108px] flex-col items-start rounded-xl border px-2 py-1.5 text-left transition-[opacity,box-shadow,transform] hover:scale-[1.01] active:scale-[0.99]"
            style={{
              borderColor: active ? `${platformColor}45` : COLOR.border,
              background: `${platformColor}${active ? '10' : '08'}`,
              opacity: active ? 1 : 0.72,
              boxShadow: active ? `0 0 0 1px ${platformColor}25, 0 2px 10px rgba(15,23,42,0.06)` : '0 1px 3px rgba(15,23,42,0.04)',
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLOR.textSecondary }}>
              {consolePlatformDisplayName(p)}
            </span>
            <span className="tabular-nums text-[17px] leading-tight font-bold" style={{ color: platformColor }}>
              {metricText}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Top posts (three-column leaders, same pattern as per-account analytics) ───

type ConsoleHighlightRow = {
  id: string;
  preview: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  views: number;
  interactions: number;
  reactions: number;
  publishedAt: string;
  platform: string;
};

function formatConsolePostCardDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function consoleHighlightPreview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'View post';
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function historyPostToHighlightRow(h: UnifiedHistoryPost): ConsoleHighlightRow {
  return {
    id: h.id,
    preview: h.caption ?? '',
    permalink: h.url,
    thumbnailUrl: h.thumbnailUrl,
    views: h.impressions ?? 0,
    interactions: h.totalEngagement ?? 0,
    reactions: h.likes ?? 0,
    publishedAt: h.postedAt,
    platform: h.platform,
  };
}

function unifiedTopPostToHistoryPost(t: UnifiedTopPost): UnifiedHistoryPost {
  return {
    id: t.id,
    platform: t.platform,
    caption: t.caption,
    url: t.url,
    thumbnailUrl: t.thumbnailUrl,
    likes: t.likes,
    comments: t.comments,
    shares: t.shares,
    impressions: t.impressions,
    totalEngagement: t.totalEngagement,
    postedAt: t.postedAt,
    mediaType: null,
  };
}

function ConsoleTopPostsHighlights({
  byViews,
  byInteractions,
  byReactions,
}: {
  byViews: ConsoleHighlightRow[];
  byInteractions: ConsoleHighlightRow[];
  byReactions: ConsoleHighlightRow[];
}) {
  const rankBadge = (idx: number) => `/rank-badges/${Math.min(3, idx + 1)}.svg`;
  const cardBg = 'rgba(15,23,39,0.04)';
  const TH = 96;

  const col = (
    title: string,
    metricLabel: 'Views' | 'Interactions' | 'Reactions',
    rows: ConsoleHighlightRow[]
  ) => (
    <div className="space-y-3">
      <p className="text-base font-semibold tracking-tight" style={{ color: COLOR.text }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: COLOR.textMuted }}>
          No items yet
        </p>
      ) : (
        rows.map((r, idx) => (
          <div
            key={`${title}-${r.id}-${idx}`}
            className="flex max-h-[260px] min-h-[168px] flex-col overflow-hidden rounded-xl p-3.5"
            style={{ background: cardBg, border: `1px solid ${COLOR.border}` }}
          >
            <div className="flex min-h-0 flex-1 items-start gap-3">
              {r.platform === 'X' && !r.thumbnailUrl ? (
                <div className="relative isolate mt-1 shrink-0 pt-1" style={{ width: TH, height: TH }}>
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl border"
                    style={{ borderColor: COLOR.border, background: '#f3f4f6' }}
                  >
                    <FileText size={22} style={{ color: COLOR.textMuted }} />
                  </div>
                  <img
                    src={rankBadge(idx)}
                    alt={`Rank ${idx + 1}`}
                    className="pointer-events-none absolute left-0 top-0 z-10 h-11 w-11 -translate-x-2 -translate-y-2 object-contain drop-shadow-md sm:h-12 sm:w-12 sm:-translate-x-2.5 sm:-translate-y-2.5"
                  />
                </div>
              ) : (
                <div className="relative isolate mt-1 shrink-0 pt-1" style={{ width: TH, height: TH }}>
                  <div
                    className="absolute inset-0 overflow-hidden rounded-xl border"
                    style={{ borderColor: COLOR.border, background: '#f3f4f6' }}
                  >
                    {r.thumbnailUrl ? (
                      <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={{ color: COLOR.textMuted }}>
                        <FileText size={22} />
                      </div>
                    )}
                    {r.permalink ? (
                      <a
                        href={r.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute right-1.5 bottom-1.5 z-[1] inline-flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: 'rgba(17,24,39,0.72)', color: '#ffffff' }}
                        aria-label="Open post"
                      >
                        <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                  <img
                    src={rankBadge(idx)}
                    alt={`Rank ${idx + 1}`}
                    className="pointer-events-none absolute left-0 top-0 z-10 h-11 w-11 -translate-x-2 -translate-y-2 object-contain drop-shadow-md sm:h-12 sm:w-12 sm:-translate-x-2.5 sm:-translate-y-2.5"
                  />
                </div>
              )}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ minHeight: TH }}>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:max-h-[18px] [&>svg]:max-w-[18px]" aria-hidden>
                    <PlatformIcon platform={r.platform} size={16} />
                  </span>
                  <p className="min-w-0 truncate text-[11px] leading-4 tabular-nums" style={{ color: COLOR.textMuted }}>
                    {formatConsolePostCardDateTime(r.publishedAt)}
                  </p>
                </div>
                <p
                  className="mt-1.5 min-h-0 flex-1 overflow-hidden text-[13px] leading-snug text-ellipsis [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] break-words"
                  style={{ color: COLOR.textSecondary }}
                  title={r.preview.trim() || undefined}
                >
                  {consoleHighlightPreview(r.preview)}
                </p>
                <div className="mt-auto flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs" style={{ color: COLOR.textMuted, borderTopColor: COLOR.border }}>
                  <span
                    style={
                      metricLabel === 'Views'
                        ? { color: COLOR.text, fontWeight: 700, fontSize: 13 }
                        : undefined
                    }
                  >
                    Views {fmt(r.views)}
                  </span>
                  <span
                    style={
                      metricLabel === 'Interactions'
                        ? { color: COLOR.text, fontWeight: 700, fontSize: 13 }
                        : undefined
                    }
                  >
                    Interactions {fmt(r.interactions)}
                  </span>
                  <span
                    style={
                      metricLabel === 'Reactions'
                        ? { color: COLOR.text, fontWeight: 700, fontSize: 13 }
                        : undefined
                    }
                  >
                    Reactions {fmt(r.reactions)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4" style={{ color: COLOR.text }}>
        Top performing posts
      </h3>
      <div className="grid gap-4 lg:grid-cols-3">
        {col('Views leaders', 'Views', byViews)}
        {col('Interactions leaders', 'Interactions', byInteractions)}
        {col('Reactions leaders', 'Reactions', byReactions)}
      </div>
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

const MEDIA_ICON: Record<string, React.ReactNode> = { VIDEO: <Film size={12} />, IMAGE: <ImageIcon size={12} />, REEL: <Film size={12} /> };

/** Matches console platform strip order. Keys match `UnifiedHistoryPost.platform` (Facebook posts use `Meta`). */
const CONSOLE_HISTORY_PLATFORM_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Instagram', label: 'Instagram' },
  { key: 'Meta', label: 'Facebook' },
  { key: 'YouTube', label: 'YouTube' },
  { key: 'TikTok', label: 'TikTok' },
  { key: 'X', label: 'X/Twitter' },
  { key: 'LinkedIn', label: 'LinkedIn' },
  { key: 'Pinterest', label: 'Pinterest' },
];

function HistoryTable({ rows }: { rows: UnifiedHistoryPost[] }) {
  const [filter, setFilter] = useState<string>('All');
  const orderedPlatformFilters = useMemo(() => {
    const present = new Set(rows.map((r) => r.platform));
    const ordered = CONSOLE_HISTORY_PLATFORM_ORDER.filter(({ key }) => present.has(key));
    const known = new Set(CONSOLE_HISTORY_PLATFORM_ORDER.map((o) => o.key));
    const extras = [...present].filter((k) => !known.has(k)).sort().map((key) => ({ key, label: key }));
    return [...ordered, ...extras];
  }, [rows]);

  useEffect(() => {
    if (filter === 'All') return;
    if (!rows.some((r) => r.platform === filter)) setFilter('All');
  }, [rows, filter]);

  const visible = filter === 'All' ? rows : rows.filter((r) => r.platform === filter);

  const pillBase =
    'rounded-full border px-2.5 py-1.5 text-xs transition-[opacity,transform,box-shadow] hover:scale-[1.02] active:scale-[0.98]';
  const pillStyle = (selected: boolean) => ({
    borderColor: COLOR.border,
    background: selected ? 'rgba(255,255,255,0.98)' : 'rgba(248,250,252,0.72)',
    opacity: selected ? 1 : 0.3,
    color: selected ? COLOR.text : COLOR.textMuted,
    fontWeight: selected ? 600 : 500,
    boxShadow: selected ? '0 1px 2px rgba(15,23,42,0.07)' : 'none',
  } as const);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filter history by platform">
        <button
          key="All"
          type="button"
          onClick={() => setFilter('All')}
          aria-pressed={filter === 'All'}
          className={`${pillBase} px-3 font-medium`}
          style={pillStyle(filter === 'All')}
        >
          All
        </button>
        {orderedPlatformFilters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            title={`Show only ${label}`}
            className={`${pillBase} inline-flex items-center gap-2 font-medium`}
            style={pillStyle(filter === key)}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center [&>svg]:max-h-[18px] [&>svg]:max-w-[18px]">
              <PlatformIcon platform={key} size={16} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLOR.border}` }}>
              {['Platform', 'Post', 'Type', 'Date', 'Impressions', 'Likes', 'Comments', 'Shares', 'Engagement'].map((h) => (
                <th key={h} className="py-2 px-3 text-left text-[11px] font-semibold whitespace-nowrap" style={{ color: COLOR.textMuted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-sm" style={{ color: COLOR.textMuted }}>No posts in this period</td></tr>
            ) : visible.map((row) => {
              const c = PLATFORM_COLOR[row.platform] ?? '#ff7a00';
              return (
                <tr key={row.id} style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                  <td className="py-2.5 px-3 whitespace-nowrap"><span className="flex items-center gap-1.5"><PlatformIcon platform={row.platform} size={13} /><span className="text-xs font-medium" style={{ color: c }}>{row.platform}</span></span></td>
                  <td className="py-2.5 px-3 max-w-[240px]">
                    <span className="flex items-center gap-2">
                      {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" /> : <div className="flex w-8 h-8 rounded-md items-center justify-center shrink-0" style={{ background: `${c}12`, color: c }}><FileText size={13} /></div>}
                      <span className="truncate max-w-[180px] block" style={{ color: COLOR.text }}>{row.caption || '(no caption)'}</span>
                      {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} color={COLOR.textMuted} /></a>}
                    </span>
                  </td>
                  <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5" style={{ background: '#f1f5f9', color: COLOR.textSecondary }}>{MEDIA_ICON[row.mediaType ?? ''] ?? <FileText size={12} />}{row.mediaType ?? 'Post'}</span></td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-xs" style={{ color: COLOR.textSecondary }}><span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(row.postedAt)}</span></td>
                  {[row.impressions, row.likes, row.comments, row.shares, row.totalEngagement].map((v, i) => (
                    <td key={i} className="py-2.5 px-3 tabular-nums" style={{ color: COLOR.text, fontWeight: i === 4 ? 600 : 400 }}>{fmt(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shell card (matches FacebookAnalyticsView section blocks) ────────────────

function ShellCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border p-4 sm:p-5 ${className}`} style={{ borderColor: COLOR.border, background: COLOR.card, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
      {children}
    </div>
  );
}

// ─── Section nav labels ───────────────────────────────────────────────────────

const CONSOLE_NAV_SECTIONS = [
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.overview, label: 'Overview' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.posts, label: 'Posts' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.reels, label: 'Videos' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.history, label: 'History' },
] as const;

// ─── Main Page ────────────────────────────────────────────────────────────────

function rangeFromDaysParam(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
}

export default function UnifiedSummaryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountsCache = useAccountsCache();
  const cachedAccounts = accountsCache?.cachedAccounts ?? EMPTY_SOCIAL_ACCOUNTS;
  const setSelectedAccount = useSelectedAccount()?.setSelectedAccount;

  /** Content signature so memos do not invalidate when the cache array is a new reference with the same accounts. */
  const accountsKey =
    cachedAccounts === EMPTY_SOCIAL_ACCOUNTS
      ? ''
      : (cachedAccounts as SocialAccount[])
          .map((a) => `${a.id}:${(a.platform || '').toUpperCase()}`)
          .sort()
          .join('\u0001');

  const orderedAccounts = useMemo(() => {
    const list = (cachedAccounts as SocialAccount[]).slice();
    const orderIdx = (p: string) => { const i = (CONSOLE_ACCOUNT_PLATFORM_ORDER as readonly string[]).indexOf(p.toUpperCase()); return i === -1 ? 99 : i; };
    list.sort((a, b) => { const d = orderIdx(a.platform) - orderIdx(b.platform); return d !== 0 ? d : (a.username || '').localeCompare(b.username || ''); });
    return list;
    // accountsKey captures account set; read latest cachedAccounts from render closure
  }, [accountsKey]);

  const goToAccountDashboard = useCallback((acc: SocialAccount) => {
    setSelectedAccount?.(acc);
    router.push(`/dashboard?accountId=${encodeURIComponent(acc.id)}`);
  }, [router, setSelectedAccount]);

  const emptyAccountsInitials = ((user?.name?.trim() || user?.email?.split('@')[0] || '?').slice(0, 2) || '?').toUpperCase();

  const startParam = searchParams.get('start') ?? searchParams.get('since') ?? '';
  const endParam = searchParams.get('end') ?? searchParams.get('until') ?? '';
  const daysParam = searchParams.get('days') ?? '';

  /** Rolling default range shifts every day and was busting cache keys; pin for this session when URL has no range. */
  const consoleDefaultRangePinRef = useRef<{ start: string; end: string } | null>(null);
  const consoleDaysRangePinRef = useRef<{ key: string; start: string; end: string } | null>(null);
  const consoleDateRangeUserRef = useRef<string>('');

  const dateRange = useMemo(() => {
    const uid = user?.id ?? '';
    if (uid !== consoleDateRangeUserRef.current) {
      consoleDateRangeUserRef.current = uid;
      consoleDefaultRangePinRef.current = null;
      consoleDaysRangePinRef.current = null;
    }
    if (startParam && endParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) && /^\d{4}-\d{2}-\d{2}$/.test(endParam) && startParam <= endParam) {
      return { start: startParam, end: endParam };
    }
    const rawDays = Number(daysParam);
    if ([7, 30, 90].includes(rawDays)) {
      const key = `${uid}|days=${rawDays}`;
      if (!consoleDaysRangePinRef.current || consoleDaysRangePinRef.current.key !== key) {
        const r = rangeFromDaysParam(rawDays);
        consoleDaysRangePinRef.current = { key, start: r.start, end: r.end };
      }
      return { start: consoleDaysRangePinRef.current.start, end: consoleDaysRangePinRef.current.end };
    }
    if (user?.id) {
      const stored = readStoredAnalyticsDateRange(user.id);
      if (stored) return stored;
    }
    if (!consoleDefaultRangePinRef.current) {
      consoleDefaultRangePinRef.current = getDefaultAnalyticsDateRange();
    }
    return consoleDefaultRangePinRef.current;
  }, [startParam, endParam, daysParam, user?.id]);

  const [data, setData] = useState<UnifiedSummaryResponse | null>(null);
  /** True only when there is nothing to show yet for this range (not during silent background refetch). */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastSummaryRangeRef = useRef<string | null>(null);
  const lastHydratedSummaryRangeRef = useRef<string | null>(null);
  const summaryFetchUserRef = useRef<string | null>(null);
  /** Track accounts we've already kicked off a background post-sync for in this session. */
  const consolePostsSyncedRef = useRef<Set<string>>(new Set());

  // Performance section
  const [performanceMode, setPerformanceMode] = useState<'growth' | 'engagement' | 'views'>('growth');
  const [activePlatforms, setActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);
  const [selectedOverviewMetrics, setSelectedOverviewMetrics] = useState<Array<'followers' | 'views' | 'engagements'>>([
    'followers',
    'views',
    'engagements',
  ]);
  const [postsPreset, setPostsPreset] = useState<PostTypeKey>('all');
  const [postsActivePlatforms, setPostsActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);

  /** Chart legend and series only for accounts the user has connected (fallback: all chart keys). */
  const connectedChartPlatforms = useMemo(() => {
    const labels = new Set<string>();
    for (const acc of orderedAccounts) {
      const lab = chartLabelForAccountPlatform(acc.platform);
      if (lab) labels.add(lab);
    }
    const ordered = (CONSOLE_PERF_PLATFORM_ORDER as readonly string[]).filter((p) => labels.has(p));
    return ordered.length > 0 ? ordered : [...CONSOLE_PERF_PLATFORM_ORDER];
  }, [orderedAccounts]);

  useEffect(() => {
    setActivePlatforms((prev) => {
      const next = [...connectedChartPlatforms];
      if (prev.length === next.length && prev.every((p, i) => p === next[i])) return prev;
      return next;
    });
  }, [performanceMode, accountsKey, connectedChartPlatforms]);

  const postsEligiblePlatforms = useMemo(
    () => postsEligiblePlatformsForPreset(connectedChartPlatforms, postsPreset),
    [connectedChartPlatforms, postsPreset]
  );

  useEffect(() => {
    setPostsActivePlatforms((prev) => {
      const filteredPrev = prev.filter((p) => postsEligiblePlatforms.includes(p));
      if (filteredPrev.length > 0) return filteredPrev;
      return [...postsEligiblePlatforms];
    });
  }, [accountsKey, postsEligiblePlatforms]);

  const [livePlatformFallback, setLivePlatformFallback] = useState<Record<string, PlatformLiveFallback>>({});

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      lastSummaryRangeRef.current = null;
      lastHydratedSummaryRangeRef.current = null;
      summaryFetchUserRef.current = null;
      return;
    }
    if (summaryFetchUserRef.current !== user.id) {
      summaryFetchUserRef.current = user.id;
      lastSummaryRangeRef.current = null;
      lastHydratedSummaryRangeRef.current = null;
    }
    let cancelled = false;
    const rangeSig = `${dateRange.start}|${dateRange.end}`;
    const rangeChanged =
      lastSummaryRangeRef.current !== null && lastSummaryRangeRef.current !== rangeSig;
    lastSummaryRangeRef.current = rangeSig;

    const cachedRaw = readUnifiedSummaryCache(user.id, dateRange.start, dateRange.end);
    const cached = cachedRaw ? normalizeUnifiedSummary(cachedRaw) : null;
    const hadCache = !!cached;
    const sameRangeAlreadyHydrated = lastHydratedSummaryRangeRef.current === rangeSig;

    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      lastHydratedSummaryRangeRef.current = rangeSig;
    } else {
      if (rangeChanged && !sameRangeAlreadyHydrated) setData(null);
      if (!sameRangeAlreadyHydrated) setLoading(true);
      else setLoading(false);
    }
    setError(null);

    (async () => {
      try {
        const res = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
          params: { since: dateRange.start, until: dateRange.end },
        });
        if (cancelled) return;
        const normalized = normalizeUnifiedSummary(res.data);
        setData(normalized);
        setError(null);
        lastHydratedSummaryRangeRef.current = rangeSig;
        writeUnifiedSummaryCache(user.id, dateRange.start, dateRange.end, normalized);
      } catch {
        if (!cancelled && !hadCache && !sameRangeAlreadyHydrated) {
          setError('Failed to load analytics. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dateRange.start, dateRange.end]);

  // Twitter and Pinterest are not covered by the scheduled cron (genericAdapter is a no-op), so
  // importedPost rows only exist for accounts the user manually opened. Kick off a one-shot
  // background sync for each such account when the Console loads, then re-fetch the summary so
  // posts that just landed in the DB appear in the charts without requiring a manual refresh.
  useEffect(() => {
    if (!user?.id) return;
    const targets = orderedAccounts.filter(
      (a) => a.platform === 'TWITTER' || a.platform === 'PINTEREST'
    );
    if (targets.length === 0) return;

    let cancelled = false;
    const pendingSyncs: Promise<unknown>[] = [];
    for (const acc of targets) {
      if (consolePostsSyncedRef.current.has(acc.id)) continue;
      consolePostsSyncedRef.current.add(acc.id);
      pendingSyncs.push(
        api
          .get(`/social/accounts/${encodeURIComponent(acc.id)}/posts`, {
            params: { sync: 1, force: 1 },
            timeout: 45_000,
          })
          .catch(() => undefined)
      );
    }
    if (pendingSyncs.length === 0) return;

    (async () => {
      await Promise.all(pendingSyncs);
      if (cancelled || !user?.id) return;
      try {
        const res = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
          params: { since: dateRange.start, until: dateRange.end },
        });
        if (cancelled) return;
        const normalized = normalizeUnifiedSummary(res.data);
        setData(normalized);
        writeUnifiedSummaryCache(user.id, dateRange.start, dateRange.end, normalized);
      } catch {
        /* Keep whatever we already rendered. */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, accountsKey, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!user?.id) {
      setLivePlatformFallback({});
      return;
    }
    const targets = orderedAccounts.filter((a) => a.platform === 'TWITTER' || a.platform === 'PINTEREST' || a.platform === 'LINKEDIN');
    if (targets.length === 0) {
      setLivePlatformFallback({});
      return;
    }
    let cancelled = false;

    const keyFor = (platform: SocialAccount['platform']): 'X' | 'Pinterest' | 'LinkedIn' | null => {
      if (platform === 'TWITTER') return 'X';
      if (platform === 'PINTEREST') return 'Pinterest';
      if (platform === 'LINKEDIN') return 'LinkedIn';
      return null;
    };

    // 1) Paint any cached data immediately (ignoring TTL) so revisits render instantly.
    const initial: Record<string, PlatformLiveFallback> = {};
    const toRefresh: Array<{ acc: SocialAccount; cacheKey: string }> = [];
    for (const acc of targets) {
      const cacheKey = `console:fallback:${acc.platform}:${acc.id}:${dateRange.start}:${dateRange.end}`;
      const { data: cached, isFresh } = readConsoleFallbackCache(cacheKey);
      const fallbackKey = keyFor(acc.platform);
      if (cached && fallbackKey) initial[fallbackKey] = cached;
      const weakPinterestCache =
        acc.platform === 'PINTEREST' &&
        !!cached &&
        (Number(cached.engagementTotal ?? 0) <= 0 || (cached.engagementSeries?.length ?? 0) === 0);
      if (!cached || !isFresh || weakPinterestCache) toRefresh.push({ acc, cacheKey });
    }
    setLivePlatformFallback(initial);

    if (toRefresh.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    // 2) Revalidate stale/missing entries in the background and patch them in as they arrive.
    (async () => {
      await Promise.all(
        toRefresh.map(async ({ acc, cacheKey }) => {
          try {
            const res = await api.get(`/social/accounts/${encodeURIComponent(acc.id)}/insights`, {
              params: { since: dateRange.start, until: dateRange.end },
              timeout: 30_000,
            });
            if (cancelled) return;
            const payload = res?.data as Record<string, unknown>;
            let parsed: PlatformLiveFallback | null = null;
            let fallbackKey: 'X' | 'Pinterest' | 'LinkedIn' | null = null;
            if (acc.platform === 'TWITTER') {
              fallbackKey = 'X';
              const viewsSeries = Array.isArray(payload.impressionsTimeSeries)
                ? (payload.impressionsTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              const engagementSeries = Array.isArray(payload.twitterEngagementTimeSeries)
                ? (payload.twitterEngagementTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              parsed = {
                viewsSeries,
                engagementSeries,
                viewsTotal: Number(payload.impressionsTotal ?? 0),
                engagementTotal: engagementSeries.reduce((s, p) => s + (Number(p.value) || 0), 0),
              };
            } else if (acc.platform === 'PINTEREST') {
              fallbackKey = 'Pinterest';
              const viewsSeries = Array.isArray(payload.impressionsTimeSeries)
                ? (payload.impressionsTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              const fbAnalytics = payload.facebookAnalytics as
                | { series?: { engagement?: Array<{ date?: string; value?: number }> } }
                | undefined;
              const engagementSeries = Array.isArray(fbAnalytics?.series?.engagement)
                ? fbAnalytics!.series!.engagement!
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              const fbTotals = payload.facebookAnalytics as
                | { totals?: { engagement?: number; contentViews?: number; postImpressions?: number } }
                | undefined;
              const engagementTotalFromSeries = engagementSeries.reduce((s, p) => s + (Number(p.value) || 0), 0);
              const engagementTotalFromBundle = Number(fbTotals?.totals?.engagement ?? 0);
              parsed = {
                viewsSeries,
                engagementSeries,
                viewsTotal: Number(payload.impressionsTotal ?? fbTotals?.totals?.contentViews ?? fbTotals?.totals?.postImpressions ?? 0),
                engagementTotal: Math.max(engagementTotalFromSeries, engagementTotalFromBundle),
              };
            } else if (acc.platform === 'LINKEDIN') {
              fallbackKey = 'LinkedIn';
              const viewsSeries = Array.isArray(payload.impressionsTimeSeries)
                ? (payload.impressionsTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              parsed = { viewsSeries, viewsTotal: Number(payload.impressionsTotal ?? 0) };
            }
            if (parsed && fallbackKey) {
              writeConsoleFallbackCache(cacheKey, parsed);
              if (!cancelled) {
                const key = fallbackKey;
                const value = parsed;
                setLivePlatformFallback((prev) => ({ ...prev, [key]: value }));
              }
            }
          } catch {
            // Keep whatever cached value we already rendered.
          }
        })
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, accountsKey, dateRange.start, dateRange.end]);

  const onDateRangeChange = useCallback((range: { start: string; end: string }) => {
    if (user?.id) writeStoredAnalyticsDateRange(range, user.id);
    router.replace(`/dashboard/console?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`);
  }, [router, user?.id]);

  const togglePlatform = useCallback((p: string) => {
    setActivePlatforms((prev) => prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]);
  }, []);

  const togglePostsPlatform = useCallback((p: string) => {
    setPostsActivePlatforms((prev) => prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]);
  }, []);

  const toggleOverviewMetric = useCallback((metric: 'followers' | 'views' | 'engagements') => {
    setSelectedOverviewMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  }, []);

  const activeChartData = useMemo((): UnifiedChartData => {
    if (!data) return [];
    if (performanceMode === 'growth') return data.audienceChart ?? [];
    if (performanceMode === 'engagement') return data.engagementChart ?? [];
    return data.chart ?? [];
  }, [data, performanceMode]);

  const activeChartDataWithFallback = useMemo((): UnifiedChartData => {
    if (activeChartData.length === 0) return activeChartData;
    if (performanceMode === 'growth') return activeChartData;
    const selectedSeriesKey = performanceMode === 'views' ? 'viewsSeries' : 'engagementSeries';
    const selectedTotalKey = performanceMode === 'views' ? 'viewsTotal' : 'engagementTotal';
    const out = activeChartData.map((r) => ({ ...r })) as UnifiedChartData;
    const byDate = new Map<string, number>();
    // Merge live per-account insights for X / Pinterest / LinkedIn. Always use Math.max vs unified DB
    // series so Pinterest account-level analytics still show when ImportedPost rows are sparse or zero.
    for (const platform of ['X', 'Pinterest', 'LinkedIn']) {
      const fallbackRow = livePlatformFallback[platform];
      const fallbackSeries = fallbackRow?.[selectedSeriesKey];
      if (fallbackSeries && fallbackSeries.length > 0) {
        byDate.clear();
        for (const p of fallbackSeries) byDate.set(p.date, (byDate.get(p.date) ?? 0) + (Number(p.value) || 0));
        for (const row of out) {
          const d = String(row.date ?? '');
          const add = byDate.get(d) ?? 0;
          (row as unknown as Record<string, number>)[platform] = Math.max(
            Number((row as unknown as Record<string, number>)[platform] ?? 0),
            add
          );
        }
      }
      const synthesizedTotal = Number(fallbackRow?.[selectedTotalKey] ?? 0);
      if (synthesizedTotal > 0) {
        const totalAfterSeries = platformPresetMetric(out, platform, performanceMode);
        if (totalAfterSeries <= 0) {
          const last = out[out.length - 1] as unknown as Record<string, number> | undefined;
          if (last) {
            last[platform] = Math.max(Number(last[platform] ?? 0), synthesizedTotal);
          }
        }
      }
    }
    return out;
  }, [activeChartData, performanceMode, livePlatformFallback]);

  const overviewTrendData = useMemo(() => {
    if (!data) return [] as Array<{ date: string; followers: number; views: number; engagements: number }>;
    const map = new Map<string, { date: string; followers: number; views: number; engagements: number }>();
    const touch = (date: string) => {
      if (!map.has(date)) map.set(date, { date, followers: 0, views: 0, engagements: 0 });
      return map.get(date)!;
    };
    for (const row of data.audienceChart ?? []) {
      const entry = touch(String(row.date));
      entry.followers = sumPlatformsForRow(row as unknown as Record<string, unknown>, connectedChartPlatforms);
    }
    for (const row of data.chart ?? []) {
      const entry = touch(String(row.date));
      entry.views = sumPlatformsForRow(row as unknown as Record<string, unknown>, connectedChartPlatforms);
    }
    for (const row of data.engagementChart ?? []) {
      const entry = touch(String(row.date));
      entry.engagements = sumPlatformsForRow(row as unknown as Record<string, unknown>, connectedChartPlatforms);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, connectedChartPlatforms]);

  const overviewAxisTicks = useMemo(
    () => buildConsoleAxisTicks(overviewTrendData, selectedOverviewMetrics),
    [overviewTrendData, selectedOverviewMetrics.join('|')]
  );

  const overviewFollowersStart = overviewTrendData.length > 0 ? Number(overviewTrendData[0]?.followers ?? 0) : 0;
  const overviewFollowersEnd = overviewTrendData.length > 0 ? Number(overviewTrendData[overviewTrendData.length - 1]?.followers ?? 0) : 0;
  const overviewFollowersDelta = Math.round(overviewFollowersEnd - overviewFollowersStart);
  const overviewFollowersGrowthPct = followerSeriesGrowthPct(overviewTrendData);
  const postsTimelineData = useMemo(() => {
    const rows = (data?.chart ?? []).map((r) => ({ date: String(r.date) })) as Array<{ date: string } & Record<string, number>>;
    const byDate = new Map<string, { date: string } & Record<string, number>>();
    for (const r of rows) {
      const base: { date: string } & Record<string, number> = { date: r.date } as { date: string } & Record<string, number>;
      for (const t of ['reels', 'image', 'carousel'] as const) {
        for (const p of connectedChartPlatforms) base[`${t}_${p}`] = 0;
      }
      for (const p of connectedChartPlatforms) {
        base[`all_${p}`] = 0;
      }
      byDate.set(r.date, base);
    }

    // Prefer the uncapped server-side breakdown so platforms with many posts (or
    // text-only tweets pushed outside the 60-row history window) still show up.
    const breakdown = (data as unknown as { postsBreakdown?: UnifiedPostsBreakdownDay[] } | null)?.postsBreakdown;
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      for (const day of breakdown) {
        const row = byDate.get(day.date);
        if (!row) continue;
        for (const p of connectedChartPlatforms) {
          row[`reels_${p}`] = Number(day.reels?.[p] ?? 0);
          row[`image_${p}`] = Number(day.image?.[p] ?? 0);
          row[`carousel_${p}`] = Number(day.carousel?.[p] ?? 0);
          row[`all_${p}`] =
            Number(row[`reels_${p}`] ?? 0) + Number(row[`image_${p}`] ?? 0) + Number(row[`carousel_${p}`] ?? 0);
        }
      }
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    // Fallback: older cached summaries (no postsBreakdown field) still use history.
    for (const post of data?.history ?? []) {
      const d = toLocalCalendarDate(new Date(post.postedAt));
      const row = byDate.get(d);
      if (!row) continue;
      const p = normalizeHistoryPlatform(String(post.platform ?? ''));
      const t = classifyConsolePostType(post.mediaType, post.url, post.platform);
      if (!t) continue;
      const key = `${t}_${p}`;
      if (key in row) row[key] += 1;
    }
    for (const row of byDate.values()) {
      for (const p of connectedChartPlatforms) {
        row[`all_${p}`] =
          Number(row[`reels_${p}`] ?? 0) + Number(row[`image_${p}`] ?? 0) + Number(row[`carousel_${p}`] ?? 0);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, connectedChartPlatforms]);

  const postsAxisTicks = useMemo(
    () =>
      buildConsoleAxisTicks(
        postsTimelineData,
        postsEligiblePlatformsForPreset(connectedChartPlatforms, postsPreset).map((p) => `${postsPreset}_${p}`)
      ),
    [postsTimelineData, connectedChartPlatforms.join('|'), postsPreset]
  );

  const selectedOverviewLegendItems = useMemo(() => {
    const items: Array<{ key: 'followers' | 'engagements' | 'views'; label: string; color: string }> = [
      { key: 'followers', label: 'Followers', color: COLOR.mint },
      { key: 'engagements', label: 'Engagements', color: CONSOLE_ENGAGEMENT_ACCENT },
      { key: 'views', label: 'Views', color: CONSOLE_VIEWS_ACCENT },
    ];
    return items.filter((i) => selectedOverviewMetrics.includes(i.key));
  }, [selectedOverviewMetrics]);

  const selectedPlatformLegendItems = useMemo(
    () =>
      connectedChartPlatforms
        .filter((p) => activePlatforms.includes(p))
        .map((p) => ({ label: consolePlatformDisplayName(p), color: CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p] ?? COLOR.textSecondary })),
    [connectedChartPlatforms, activePlatforms]
  );

  const platformDistributionPieData = useMemo(() => {
    const items: Array<{ name: string; value: number; color: string }> = [];
    for (const platform of connectedChartPlatforms) {
      if (!activePlatforms.includes(platform)) continue;
      const raw = platformPresetMetric(activeChartDataWithFallback, platform, performanceMode);
      const absVal = Math.abs(raw);
      if (absVal > 0) {
        items.push({
          name: consolePlatformDisplayName(platform),
          value: absVal,
          color: CONSOLE_PLATFORM_COLOR[platform] ?? PLATFORM_COLOR[platform] ?? COLOR.textSecondary,
        });
      }
    }
    items.sort((a, b) => b.value - a.value);
    return items;
  }, [connectedChartPlatforms, activePlatforms, activeChartDataWithFallback, performanceMode]);

  const platformDistributionTotal = useMemo(
    () => platformDistributionPieData.reduce((s, p) => s + p.value, 0),
    [platformDistributionPieData]
  );

  const postsPresetLegendItems = useMemo(
    () =>
      connectedChartPlatforms
        .filter((p) => postsActivePlatforms.includes(p))
        .map((p) => ({ label: consolePlatformDisplayName(p), color: CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p] ?? COLOR.textSecondary })),
    [connectedChartPlatforms, postsActivePlatforms]
  );

  const postsBarStackKeys = useMemo(
    () =>
      postsEligiblePlatforms
        .filter((p) => postsActivePlatforms.includes(p))
        .map((p) => `${postsPreset}_${p}`),
    [postsEligiblePlatforms, postsActivePlatforms, postsPreset],
  );

  const postsBarStackMax = useMemo(() => {
    if (postsTimelineData.length === 0 || postsBarStackKeys.length === 0) return 1;
    let max = 0;
    for (const row of postsTimelineData) {
      let s = 0;
      for (const k of postsBarStackKeys) {
        s += Number((row as Record<string, unknown>)[k] ?? 0);
      }
      max = Math.max(max, s);
    }
    return max <= 0 ? 1 : Math.ceil(max * 1.14);
  }, [postsTimelineData, postsBarStackKeys]);

  const PostsConsoleStackBarShape = useMemo(
    () => createMinWidthStackedBarShape(postsBarStackKeys, { radius: 6, minWidth: 10 }),
    [postsBarStackKeys],
  );

  const postsPresetPlatformPieData = useMemo(() => {
    const items: Array<{ name: string; value: number; color: string }> = [];
    for (const platform of connectedChartPlatforms) {
      if (!postsActivePlatforms.includes(platform)) continue;
      const key = `${postsPreset}_${platform}`;
      const value = postsTimelineData.reduce(
        (sum, row) => sum + Number((row as unknown as Record<string, number>)[key] ?? 0),
        0
      );
      if (value <= 0) continue;
      items.push({
        name: consolePlatformDisplayName(platform),
        value,
        color: CONSOLE_PLATFORM_COLOR[platform] ?? PLATFORM_COLOR[platform] ?? COLOR.textSecondary,
      });
    }
    items.sort((a, b) => b.value - a.value);
    return items;
  }, [connectedChartPlatforms, postsActivePlatforms, postsPreset, postsTimelineData]);
  const postsPresetPlatformPieTotal = useMemo(
    () => postsPresetPlatformPieData.reduce((s, p) => s + p.value, 0),
    [postsPresetPlatformPieData]
  );

  const consoleTopPostsPool = useMemo((): UnifiedHistoryPost[] => {
    if (!data) return [];
    const map = new Map<string, UnifiedHistoryPost>();
    for (const h of data.history) map.set(h.id, h);
    for (const t of data.topPosts) {
      if (!map.has(t.id)) map.set(t.id, unifiedTopPostToHistoryPost(t));
    }
    return Array.from(map.values());
  }, [data]);

  const consoleLeaderRows = useMemo(
    () => consoleTopPostsPool.map(historyPostToHighlightRow),
    [consoleTopPostsPool]
  );

  const consoleTopByViews = useMemo(
    () => [...consoleLeaderRows].sort((a, b) => b.views - a.views).slice(0, 3),
    [consoleLeaderRows]
  );
  const consoleTopByInteractions = useMemo(
    () => [...consoleLeaderRows].sort((a, b) => b.interactions - a.interactions).slice(0, 3),
    [consoleLeaderRows]
  );
  const consoleTopByReactions = useMemo(
    () => [...consoleLeaderRows].sort((a, b) => b.reactions - a.reactions).slice(0, 3),
    [consoleLeaderRows]
  );

  if (!user) return <div className="flex items-center justify-center h-[60vh]" style={{ color: COLOR.textMuted }}>Sign in to view your unified analytics.</div>;

  return (
    <div className="p-0 md:p-0.5 space-y-3" style={{ maxWidth: 1400, background: COLOR.pageBg }}>
      {/* ── Upgrade banner ── */}
      <div className="w-full rounded-2xl border upgrade-banner-warm px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-slate-200/70 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 upgrade-badge-warm"><Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden /><span className="text-[11px] font-semibold uppercase tracking-wide">Your plan</span></div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span className="text-lg font-bold text-neutral-900 tracking-tight leading-tight">Free</span>
            <span className="text-sm text-neutral-700 leading-snug">Unlock more than 30 days of history without watermarks and more analytics when you upgrade.</span>
          </div>
        </div>
        <button type="button" onClick={() => router.push('/pricing')} className="shrink-0 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] gradient-cta-pro">
          Upgrade now <ArrowRight className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {/* ── Header (avatars + sync + date + nav) ── */}
      <section className="rounded-[20px] border p-3 md:p-3.5" style={{ background: COLOR.section, borderColor: COLOR.border, boxShadow: '0 4px 22px rgba(15,23,42,0.06)' }}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {orderedAccounts.length === 0 ? (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: '#fff7ed', color: COLOR.violet }} aria-hidden>{emptyAccountsInitials}</div>
              ) : orderedAccounts.map((acc) => {
                const label = acc.username || acc.platform || 'Account';
                const initials = label.replace(/^@/, '').slice(0, 2).toUpperCase() || '?';
                return (
                  <button key={acc.id} type="button" onClick={() => goToAccountDashboard(acc)} className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2" title={`Open ${label} dashboard`}>
                    <span className="relative block h-11 w-11 transition-transform group-hover:scale-[1.03] group-active:scale-[0.98]">
                      <span className="block h-11 w-11 overflow-hidden rounded-full bg-neutral-100 shadow-sm ring-2 ring-white">
                        {acc.profilePicture ? <img src={acc.profilePicture} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-semibold" style={{ background: '#fff7ed', color: COLOR.violet }}>{initials}</span>}
                      </span>
                      <span className="pointer-events-none absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center [&>svg]:h-5 [&>svg]:w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" aria-hidden><AccountBadgeIcon platform={acc.platform} /></span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: COLOR.textSecondary }}>
                  <RefreshCw size={13} className="animate-spin opacity-75" aria-hidden />
                  Loading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm" style={{ color: COLOR.textSecondary }}>
                  <RefreshCw size={13} className="opacity-75" aria-hidden />
                  Ready
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2"><AnalyticsDateRangePicker start={dateRange.start} end={dateRange.end} onChange={onDateRangeChange} /></div>
        </div>
        <div className="mt-2">
          <StickySectionNav sections={[...CONSOLE_NAV_SECTIONS]} activeSection={FACEBOOK_ANALYTICS_SECTION_IDS.overview} ariaLabel="Console analytics sections" />
        </div>
      </section>

      {error && !data ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }}>{error}</div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════════
          OVERVIEW: KPI cards on top, then Performance chart below
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-28 space-y-4">
        {/* KPI cards — always shown when data exists (including during silent refetch) */}
        {data ? (
          <ShellCard className="!p-3 sm:!p-4 space-y-2">
            <h4 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance</h4>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="Followers"
                value={`${overviewFollowersDelta > 0 ? '+' : ''}${fmtExactInt(overviewFollowersDelta)}`}
                growthPct={overviewFollowersGrowthPct}
                icon={<Users size={15} />}
                accent={COLOR.mint}
                active={selectedOverviewMetrics.includes('followers')}
                onClick={() => toggleOverviewMetric('followers')}
              />
              <KpiCard
                label="Engagements"
                value={fmtExactInt(data.kpi.totalEngagement)}
                growthPct={data.kpi.engagementGrowthPercentage}
                icon={<Heart size={15} />}
                accent={CONSOLE_ENGAGEMENT_ACCENT}
                active={selectedOverviewMetrics.includes('engagements')}
                onClick={() => toggleOverviewMetric('engagements')}
              />
              <KpiCard
                label="Views"
                value={fmtExactInt(data.kpi.totalImpressions)}
                growthPct={data.kpi.impressionsGrowthPercentage}
                icon={<Eye size={15} />}
                accent={CONSOLE_VIEWS_ACCENT}
                active={selectedOverviewMetrics.includes('views')}
                onClick={() => toggleOverviewMetric('views')}
              />
            </div>
            <InsightChartCard title="Performance" hideHeader flat>
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {selectedOverviewLegendItems.map((item) => (
                  <DotLegendPill key={item.key} label={item.label} color={item.color} />
                ))}
              </div>
              {selectedOverviewMetrics.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm px-4 text-center" style={{ color: COLOR.textMuted }}>
                  {ANALYTICS_CHART_SELECT_METRIC_MESSAGE}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overviewTrendData} margin={{ top: 8, right: 8, left: -12, bottom: 22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis
                      dataKey="date"
                      ticks={overviewAxisTicks}
                      tickFormatter={formatConsoleAxisTickLabel}
                      tick={{ fontSize: 10, fill: COLOR.textMuted }}
                      dy={8}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 'auto']}
                      tickFormatter={(v) => fmt(Number(v))}
                      tick={{ fontSize: 11, fill: COLOR.textMuted }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(v) => fmtTooltipDate(String(v))}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [fmtExactInt(Number(value) || 0), String(name ?? '')]}
                    />
                    {selectedOverviewMetrics.includes('followers') && (
                      <Line type="monotone" dataKey="followers" name="Followers" stroke={COLOR.mint} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {selectedOverviewMetrics.includes('views') && (
                      <Line type="monotone" dataKey="views" name="Views" stroke={CONSOLE_VIEWS_ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {selectedOverviewMetrics.includes('engagements') && (
                      <Line type="monotone" dataKey="engagements" name="Engagements" stroke={CONSOLE_ENGAGEMENT_ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </InsightChartCard>
          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}</div>
          </ShellCard>
        ) : null}

        {/* Performance chart */}
        {data ? (
          <ShellCard className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance per platform</h3>
            </div>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex shrink-0 gap-2">
                {(['growth', 'engagement', 'views'] as const).map((mode) => {
                  const active = performanceMode === mode;
                  return (
                    <button key={mode} type="button" onClick={() => setPerformanceMode(mode)} aria-pressed={active}
                      className="rounded-lg px-3 py-1.5 text-sm"
                      style={{ background: active ? 'rgba(139,124,255,0.15)' : 'rgba(255,255,255,0.03)', color: active ? COLOR.text : COLOR.textSecondary, border: `1px solid ${COLOR.border}` }}>
                      {mode === 'views' ? 'Views' : mode === 'engagement' ? 'Engagement' : 'Growth'}
                    </button>
                  );
                })}
              </div>
              <div className="-mt-3 min-w-0 flex-1 overflow-x-auto">
                <PlatformLegend
                  all={connectedChartPlatforms}
                  activePlatforms={activePlatforms}
                  toggle={togglePlatform}
                  preset={performanceMode}
                  chartData={activeChartDataWithFallback}
                />
              </div>
            </div>
            <InsightChartCard title="Performance" hideHeader flat>
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {selectedPlatformLegendItems.map((item) => (
                  <DotLegendPill key={item.label} label={item.label} color={item.color} />
                ))}
              </div>
              {activeChartDataWithFallback.length > 0 ? (
                <PlatformMixChart
                  data={activeChartDataWithFallback}
                  activePlatforms={activePlatforms.filter((p) => connectedChartPlatforms.includes(p))}
                  performanceMode={performanceMode}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm" style={{ color: COLOR.textMuted }}>
                  {performanceMode === 'growth' ? 'No audience data yet.' : performanceMode === 'engagement' ? 'No engagement data yet.' : 'No impressions data yet.'}
                </div>
              )}
            </InsightChartCard>

            {/* Platform distribution donut chart - only for Engagement/Views (Growth can be negative) */}
            {performanceMode !== 'growth' && platformDistributionPieData.length > 0 && (
              <div className="relative mt-4 rounded-[16px] border p-4 overflow-hidden" style={{ borderColor: COLOR.border, background: COLOR.card }}>
                <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
                  <span className="absolute left-[16%] top-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute right-[16%] top-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute left-[16%] bottom-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute right-[16%] bottom-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                </div>
                <div className="relative z-10 flex flex-col">
                <h4 className="text-sm font-semibold mb-3" style={{ color: COLOR.text }}>
                  {performanceMode === 'engagement' ? 'Engagement' : 'Views'} by platform
                </h4>
                <div className="flex flex-col md:flex-row md:items-stretch gap-6">
                  <div className="mx-auto w-[200px] h-[200px] shrink-0 md:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={platformDistributionPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={0}
                          stroke="none"
                          strokeWidth={0}
                        >
                          {platformDistributionPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
                          formatter={(value, name) => {
                            const v = Number(value) || 0;
                            return [
                              `${fmtExactInt(v)} (${platformDistributionTotal > 0 ? ((v / platformDistributionTotal) * 100).toFixed(1) : 0}%)`,
                              String(name ?? ''),
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-y-2.5">
                    {chunkIntoPairs(platformDistributionPieData).map(([left, right], rowIdx) => {
                      const pct = (item: (typeof platformDistributionPieData)[number]) =>
                        platformDistributionTotal > 0 ? ((item.value / platformDistributionTotal) * 100).toFixed(1) : '0';
                      return (
                        <div
                          key={`platform-pie-legend-row-${rowIdx}`}
                          className="grid min-h-[2.5rem] grid-cols-2 items-stretch gap-x-2"
                        >
                          <ConsolePieLegendMetricRow
                            key={left.name}
                            dotColor={left.color}
                            label={left.name}
                            valueText={fmtExactInt(left.value)}
                            percentText={`(${pct(left)}%)`}
                          />
                          {right ? (
                            <ConsolePieLegendMetricRow
                              key={right.name}
                              dotColor={right.color}
                              label={right.name}
                              valueText={fmtExactInt(right.value)}
                              percentText={`(${pct(right)}%)`}
                            />
                          ) : (
                            <span className="min-w-0" aria-hidden />
                          )}
                        </div>
                      );
                    })}
                    <div className="mt-2 border-t pt-3" style={{ borderTopColor: COLOR.border }}>
                      <ConsolePieLegendMetricRow
                        stretch
                        dotColor={COLOR.text}
                        label={performanceMode === 'engagement' ? 'Total engagement' : 'Total views'}
                        valueText={fmtExactInt(platformDistributionTotal)}
                        percentText="(100%)"
                        role="status"
                        aria-label={`${performanceMode === 'engagement' ? 'Total engagement' : 'Total views'}: ${fmtExactInt(platformDistributionTotal)}`}
                      />
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}

          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4"><Skeleton className="h-[300px] rounded-xl" /></ShellCard>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          POSTS: uploaded posts timeline (candlestick-style bars)
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard className="space-y-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Posts</h3>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex shrink-0 flex-wrap gap-2">
                {(['all', 'reels', 'image', 'carousel'] as const).map((preset) => {
                  const active = postsPreset === preset;
                  return (
                    <button
                      key={`posts-type-pill-${preset}`}
                      type="button"
                      onClick={() => setPostsPreset(preset)}
                      aria-pressed={active}
                      className="rounded-lg px-3 py-1.5 text-sm"
                      style={{
                        background: active ? 'rgba(139,124,255,0.15)' : 'rgba(255,255,255,0.03)',
                        color: active ? COLOR.text : COLOR.textSecondary,
                        border: `1px solid ${COLOR.border}`,
                      }}
                    >
                      {POST_TYPE_LABEL[preset]}
                    </button>
                  );
                })}
              </div>
              <div className="-mt-3 min-w-0 flex-1 overflow-x-auto">
                <PlatformLegend
                  all={postsEligiblePlatforms}
                  activePlatforms={postsActivePlatforms}
                  toggle={togglePostsPlatform}
                  preset="views"
                  chartData={postsTimelineData.map((row) => {
                    const shaped: Record<string, unknown> = { date: row.date };
                    for (const p of postsEligiblePlatforms) {
                      shaped[p] = Number((row as unknown as Record<string, number>)[`${postsPreset}_${p}`] ?? 0);
                    }
                    return shaped as UnifiedChartData[number];
                  }) as UnifiedChartData}
                />
              </div>
            </div>
            <InsightChartCard title="Posts" hideHeader flat>
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {postsPresetLegendItems.map((item) => (
                  <DotLegendPill
                    key={`post-legend-${item.label}`}
                    label={item.label}
                    color={item.color}
                  />
                ))}
              </div>
              {postsTimelineData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm" style={{ color: COLOR.textMuted }}>
                  No posts uploaded in this selected timeframe.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={postsTimelineData} barCategoryGap="18%" margin={{ top: 16, right: 8, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      ticks={postsAxisTicks}
                      tickFormatter={formatConsoleAxisTickLabel}
                      tick={{ fill: COLOR.textMuted, fontSize: 10 }}
                      dy={8}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, postsBarStackMax]}
                      allowDecimals={false}
                      tickFormatter={(v) => fmtExactInt(Math.round(Number(v)))}
                      tick={{ fill: COLOR.textMuted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, n: any) => [fmtExactInt(Number(v) || 0), consolePlatformDisplayName(String(n ?? ''))]} labelFormatter={(l) => fmtTooltipDate(String(l))} />
                    {postsEligiblePlatforms
                      .filter((p) => postsActivePlatforms.includes(p))
                      .map((p) => (
                        <Bar
                          key={`post-bar-${postsPreset}-${p}`}
                          dataKey={`${postsPreset}_${p}`}
                          stackId="posts-by-platform"
                          name={consolePlatformDisplayName(p)}
                          fill={CONSOLE_PLATFORM_COLOR[p] ?? PLATFORM_COLOR[p] ?? COLOR.violet}
                          shape={PostsConsoleStackBarShape}
                        />
                      ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </InsightChartCard>
            {postsPresetPlatformPieData.length > 0 && (
              <div className="relative mt-4 rounded-[16px] border p-4 overflow-hidden" style={{ borderColor: COLOR.border, background: COLOR.card }}>
                <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
                  <span className="absolute left-[16%] top-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute right-[16%] top-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute left-[16%] bottom-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                  <span className="absolute right-[16%] bottom-[18%] text-[14px] font-semibold tracking-wide" style={{ color: 'rgba(102,112,133,0.22)' }}>Agent4Socials</span>
                </div>
                <div className="relative z-10 flex flex-col">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: COLOR.text }}>
                    {postsPreset === 'all' ? 'All posts by platform' : `${POST_TYPE_LABEL[postsPreset]} by platform`}
                  </h4>
                  <div className="flex flex-col md:flex-row md:items-stretch gap-6">
                    <div className="mx-auto w-[200px] h-[200px] shrink-0 md:mx-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={postsPresetPlatformPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={0}
                            stroke="none"
                            strokeWidth={0}
                          >
                            {postsPresetPlatformPieData.map((entry, idx) => (
                              <Cell key={`posts-preset-platform-cell-${idx}`} fill={entry.color} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
                            formatter={(value, name) => {
                              const v = Number(value) || 0;
                              return [
                                `${fmtExactInt(v)} (${postsPresetPlatformPieTotal > 0 ? ((v / postsPresetPlatformPieTotal) * 100).toFixed(1) : 0}%)`,
                                String(name ?? ''),
                              ];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-y-2.5">
                      {chunkIntoPairs(postsPresetPlatformPieData).map(([left, right], rowIdx) => {
                        const pct = (item: (typeof postsPresetPlatformPieData)[number]) =>
                          postsPresetPlatformPieTotal > 0 ? ((item.value / postsPresetPlatformPieTotal) * 100).toFixed(1) : '0';
                        return (
                          <div
                            key={`posts-pie-legend-row-${rowIdx}`}
                            className="grid min-h-[2.5rem] grid-cols-2 items-stretch gap-x-2"
                          >
                            <ConsolePieLegendMetricRow
                              key={left.name}
                              dotColor={left.color}
                              label={left.name}
                              valueText={fmtExactInt(left.value)}
                              percentText={`(${pct(left)}%)`}
                            />
                            {right ? (
                              <ConsolePieLegendMetricRow
                                key={right.name}
                                dotColor={right.color}
                                label={right.name}
                                valueText={fmtExactInt(right.value)}
                                percentText={`(${pct(right)}%)`}
                              />
                            ) : (
                              <span className="min-w-0" aria-hidden />
                            )}
                          </div>
                        );
                      })}
                      <div className="mt-2 border-t pt-3" style={{ borderTopColor: COLOR.border }}>
                        <ConsolePieLegendMetricRow
                          stretch
                          dotColor={COLOR.text}
                          label={
                            postsPreset === 'all'
                              ? 'Total posts'
                              : `Total (${POST_TYPE_LABEL[postsPreset]})`
                          }
                          valueText={fmtExactInt(postsPresetPlatformPieTotal)}
                          percentText="(100%)"
                          role="status"
                          aria-label={`Total posts in range: ${fmtExactInt(postsPresetPlatformPieTotal)}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4"><Skeleton className="h-20 rounded-[20px]" /><Skeleton className="h-[300px] rounded-xl" /></ShellCard>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          POSTS: Top performing posts (leaders)
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard>
            {consoleLeaderRows.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: COLOR.textMuted }}>
                No posts in this period yet. Sync accounts and publish in the selected range to see leaders here.
              </div>
            ) : (
              <ConsoleTopPostsHighlights
                byViews={consoleTopByViews}
                byInteractions={consoleTopByInteractions}
                byReactions={consoleTopByReactions}
              />
            )}
          </ShellCard>
        ) : loading ? (
          <ShellCard>
            <Skeleton className="h-48 w-full rounded-xl" />
          </ShellCard>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          HISTORY: uploads table
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.history} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard>
            <h3 className="text-lg font-semibold mb-3" style={{ color: COLOR.text }}>History</h3>
            <HistoryTable rows={data.history} />
          </ShellCard>
        ) : loading ? (
          <ShellCard><Skeleton className="h-96 rounded-xl" /></ShellCard>
        ) : null}
      </section>
    </div>
  );
}
