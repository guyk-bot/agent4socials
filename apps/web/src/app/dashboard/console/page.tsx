'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { AnalyticsDateRangePicker } from '@/components/analytics/AnalyticsDateRangePicker';
import {
  getDefaultAnalyticsDateRange,
  readStoredAnalyticsDateRange,
  toLocalCalendarDate,
  writeStoredAnalyticsDateRange,
} from '@/lib/calendar-date';
import { readUnifiedSummaryCache, writeUnifiedSummaryCache } from '@/lib/dashboard-unified-summary-cache';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  LineChart,
  ComposedChart,
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
  violet: '#7c6cff',
  mint: '#31c48d',
  amber: '#f5b942',
  coral: '#ff8b7b',
  magenta: '#d946ef',
  cyan: '#6366f1',
} as const;

const ENGAGEMENT_COLORS = {
  likes: '#7c6cff',
  comments: '#f5b942',
  shares: '#31c48d',
  reposts: '#ff8b7b',
} as const;

const ACTIVITY_COLORS = {
  posts: '#f5b942',
} as const;

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
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
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

type PlatformLiveFallback = {
  viewsSeries?: Array<{ date: string; value: number }>;
  engagementSeries?: Array<{ date: string; value: number }>;
};

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
    default: return null;
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
  const noChange = Math.abs(growthPct) < 0.05;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      style={{
        background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: active ? `0 0 0 1px ${accent}40, 0 4px 14px ${accent}22` : '0 1px 3px rgba(0,0,0,0.05)',
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

// ─── Platform mix chart: stacked lines only (no gradient area fill) ───────────

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
          domain={growthDomain ?? ['auto', 'auto']}
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
            type="natural"
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
    <div className="flex flex-nowrap justify-end gap-2" role="group" aria-label="Platforms shown on chart">
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
            className="inline-flex min-w-[132px] flex-col items-start rounded-[14px] border px-3 py-2.5 text-left transition-[opacity,box-shadow,transform] hover:scale-[1.01] active:scale-[0.99]"
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

// ─── Top Posts ─────────────────────────────────────────────────────────────────

function TopPostCard({ post, rank }: { post: UnifiedTopPost; rank: number }) {
  const color = PLATFORM_COLOR[post.platform] ?? '#8b5cf6';
  return (
    <div className="flex gap-3.5 py-3.5 items-start" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ background: rank <= 3 ? `${color}18` : '#f1f5f9', color: rank <= 3 ? color : COLOR.textMuted }}>{rank}</div>
      {post.thumbnailUrl ? <img src={post.thumbnailUrl} alt="" className="w-12 h-12 rounded-[10px] object-cover shrink-0" /> : (
        <div className="flex w-12 h-12 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${color}12`, color }}><FileText size={18} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <PlatformIcon platform={post.platform} size={13} />
          <span className="text-[11px] font-semibold" style={{ color }}>{post.platform}</span>
          <span className="text-[11px] ml-auto" style={{ color: COLOR.textMuted }}>{fmtDate(post.postedAt)}</span>
        </div>
        <p className="text-[13px] m-0 leading-snug line-clamp-2" style={{ color: COLOR.text }}>{post.caption || '(no caption)'}</p>
        <div className="flex gap-3.5 mt-1.5">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: COLOR.textMuted }}><Heart size={11} />{fmt(post.likes)}</span>
          <span className="flex items-center gap-1 text-[11px]" style={{ color: COLOR.textMuted }}><Eye size={11} />{fmt(post.impressions)}</span>
          {post.url && <a href={post.url} target="_blank" rel="noopener noreferrer" className="ml-auto"><ExternalLink size={12} color={COLOR.textMuted} /></a>}
        </div>
      </div>
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

const MEDIA_ICON: Record<string, React.ReactNode> = { VIDEO: <Film size={12} />, IMAGE: <ImageIcon size={12} />, REEL: <Film size={12} /> };

function HistoryTable({ rows }: { rows: UnifiedHistoryPost[] }) {
  const [filter, setFilter] = useState<string>('All');
  const platforms = useMemo(() => ['All', ...Array.from(new Set(rows.map((r) => r.platform)))], [rows]);
  const visible = filter === 'All' ? rows : rows.filter((r) => r.platform === filter);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filter history by platform">
        {platforms.map((p) =>
          p === 'All' ? (
            <button
              key="All"
              type="button"
              onClick={() => setFilter('All')}
              aria-pressed={filter === 'All'}
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity"
              style={{
                borderColor: COLOR.border,
                background: filter === 'All' ? 'rgba(255,255,255,0.95)' : 'rgba(248,250,252,0.9)',
                opacity: filter === 'All' ? 1 : 0.5,
                color: filter === 'All' ? COLOR.text : COLOR.textMuted,
              }}
            >
              All
            </button>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setFilter(p)}
              aria-pressed={filter === p}
              title={`Show only ${p}`}
              className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-[opacity,transform] hover:scale-[1.02] active:scale-[0.98]"
              style={{
                borderColor: COLOR.border,
                background: filter === p ? 'rgba(255,255,255,0.95)' : 'rgba(248,250,252,0.9)',
                opacity: filter === p ? 1 : 0.45,
                color: filter === p ? COLOR.text : COLOR.textMuted,
              }}
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center [&>svg]:max-h-[18px] [&>svg]:max-w-[18px]">
                <PlatformIcon platform={p} size={16} />
              </span>
              <span>{p}</span>
            </button>
          )
        )}
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
              const c = PLATFORM_COLOR[row.platform] ?? '#8b5cf6';
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
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.traffic, label: 'Traffic' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.posts, label: 'Posts' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.reels, label: 'Reels' },
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

  // Performance section
  const [performanceMode, setPerformanceMode] = useState<'growth' | 'engagement' | 'views'>('growth');
  const [activePlatforms, setActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);
  const [selectedOverviewMetrics, setSelectedOverviewMetrics] = useState<Array<'followers' | 'views' | 'engagements'>>([
    'followers',
    'views',
    'engagements',
  ]);

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

  // Engagement section
  const [selectedEngagement, setSelectedEngagement] = useState<('likes' | 'comments' | 'shares' | 'reposts')[]>(['likes', 'comments', 'shares']);
  const [livePlatformFallback, setLivePlatformFallback] = useState<Record<string, PlatformLiveFallback>>({});

  // Activity section
  const [selectedActivity, setSelectedActivity] = useState<('posts')[]>(['posts']);

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
    (async () => {
      const next: Record<string, PlatformLiveFallback> = {};
      await Promise.all(
        targets.map(async (acc) => {
          try {
            const res = await api.get(`/social/accounts/${encodeURIComponent(acc.id)}/insights`, {
              params: { since: dateRange.start, until: dateRange.end },
              timeout: 30_000,
            });
            const payload = res?.data as Record<string, unknown>;
            if (acc.platform === 'TWITTER') {
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
              next.X = { viewsSeries, engagementSeries };
            } else if (acc.platform === 'PINTEREST') {
              const viewsSeries = Array.isArray(payload.impressionsTimeSeries)
                ? (payload.impressionsTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              next.Pinterest = { viewsSeries };
            } else if (acc.platform === 'LINKEDIN') {
              const viewsSeries = Array.isArray(payload.impressionsTimeSeries)
                ? (payload.impressionsTimeSeries as Array<Record<string, unknown>>)
                    .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
                : [];
              next.LinkedIn = { viewsSeries };
            }
          } catch {
            // Keep fallback empty on error
          }
        })
      );
      if (!cancelled) setLivePlatformFallback(next);
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

  const toggleOverviewMetric = useCallback((metric: 'followers' | 'views' | 'engagements') => {
    setSelectedOverviewMetrics((prev) => (
      prev.includes(metric)
        ? (prev.length > 1 ? prev.filter((m) => m !== metric) : prev)
        : [...prev, metric]
    ));
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
    const out = activeChartData.map((r) => ({ ...r })) as UnifiedChartData;
    const byDate = new Map<string, number>();
    for (const platform of ['X', 'Pinterest', 'LinkedIn']) {
      const currentTotal = platformPresetMetric(activeChartData, platform, performanceMode);
      if (currentTotal !== 0) continue;
      const fallbackSeries = livePlatformFallback[platform]?.[selectedSeriesKey];
      if (!fallbackSeries || fallbackSeries.length === 0) continue;
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

  // Engagement totals
  const engTotals = useMemo(() => {
    const bd = data?.engagementBreakdown ?? [];
    const t = { likes: 0, comments: 0, shares: 0, reposts: 0 };
    for (const d of bd) { t.likes += d.likes; t.comments += d.comments; t.shares += d.shares; t.reposts += d.reposts; }
    return t;
  }, [data]);

  // Activity totals
  const actTotals = useMemo(() => {
    const bd = data?.activityBreakdown ?? [];
    let posts = 0;
    for (const d of bd) posts += d.posts;
    return { posts };
  }, [data]);

  const platformPeriodTotals = useMemo(() => {
    if (!data?.chart) return [];
    const imp: Record<string, number> = {}; const eng: Record<string, number> = {};
    for (const p of CHART_PLATFORMS) { imp[p] = 0; eng[p] = 0; }
    for (const row of data.chart) for (const p of CHART_PLATFORMS) imp[p] += (row[p] as number) ?? 0;
    for (const row of (data.engagementChart ?? [])) for (const p of CHART_PLATFORMS) eng[p] += (row[p] as number) ?? 0;
    return CHART_PLATFORMS.map((p) => ({ platform: p, impressions: imp[p], engagement: eng[p] })).filter((x) => x.impressions > 0 || x.engagement > 0);
  }, [data]);

  const engagementAxisTicks = useMemo(
    () => buildConsoleAxisTicks(data?.engagementBreakdown ?? [], selectedEngagement),
    [data?.engagementBreakdown, selectedEngagement.join('|')]
  );
  const overviewAxisTicks = useMemo(
    () => buildConsoleAxisTicks(overviewTrendData, selectedOverviewMetrics),
    [overviewTrendData, selectedOverviewMetrics.join('|')]
  );

  const overviewFollowersStart = overviewTrendData.length > 0 ? Number(overviewTrendData[0]?.followers ?? 0) : 0;
  const overviewFollowersEnd = overviewTrendData.length > 0 ? Number(overviewTrendData[overviewTrendData.length - 1]?.followers ?? 0) : 0;
  const overviewFollowersDelta = Math.round(overviewFollowersEnd - overviewFollowersStart);
  const overviewFollowersGrowthPct = overviewFollowersStart <= 0
    ? (overviewFollowersEnd > 0 ? 100 : 0)
    : ((overviewFollowersEnd - overviewFollowersStart) / overviewFollowersStart) * 100;
  const activityAxisTicks = useMemo(
    () => buildConsoleAxisTicks(data?.activityBreakdown ?? [], ['posts']),
    [data?.activityBreakdown]
  );

  const selectedOverviewLegendItems = useMemo(() => {
    const items: Array<{ key: 'followers' | 'engagements' | 'views'; label: string; color: string }> = [
      { key: 'followers', label: 'Followers', color: COLOR.mint },
      { key: 'engagements', label: 'Engagements', color: COLOR.violet },
      { key: 'views', label: 'Views', color: COLOR.magenta },
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

  if (!user) return <div className="flex items-center justify-center h-[60vh]" style={{ color: COLOR.textMuted }}>Sign in to view your unified analytics.</div>;

  const engagementStackTopKey = [...selectedEngagement].reverse().find(() => true) ?? 'likes';

  return (
    <div className="p-0 md:p-0.5 space-y-3" style={{ maxWidth: 1400, background: COLOR.pageBg }}>
      {/* ── Upgrade banner ── */}
      <div className="w-full rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-rose-50/40 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-violet-100/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-violet-800"><Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden /><span className="text-[11px] font-semibold uppercase tracking-wide">Your plan</span></div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span className="text-lg font-bold text-neutral-900 tracking-tight leading-tight">Free</span>
            <span className="text-sm text-neutral-600 leading-snug">Unlock more than 30 days of history without watermarks and more analytics when you upgrade.</span>
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
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: '#eef2ff', color: COLOR.violet }} aria-hidden>{emptyAccountsInitials}</div>
              ) : orderedAccounts.map((acc) => {
                const label = acc.username || acc.platform || 'Account';
                const initials = label.replace(/^@/, '').slice(0, 2).toUpperCase() || '?';
                return (
                  <button key={acc.id} type="button" onClick={() => goToAccountDashboard(acc)} className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2" title={`Open ${label} dashboard`}>
                    <span className="relative block h-11 w-11 transition-transform group-hover:scale-[1.03] group-active:scale-[0.98]">
                      <span className="block h-11 w-11 overflow-hidden rounded-full bg-neutral-100 shadow-sm ring-2 ring-white">
                        {acc.profilePicture ? <img src={acc.profilePicture} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-semibold" style={{ background: '#eef2ff', color: COLOR.violet }}>{initials}</span>}
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
                accent={COLOR.violet}
                active={selectedOverviewMetrics.includes('engagements')}
                onClick={() => toggleOverviewMetric('engagements')}
              />
              <KpiCard
                label="Views"
                value={fmtExactInt(data.kpi.totalImpressions)}
                growthPct={data.kpi.impressionsGrowthPercentage}
                icon={<Eye size={15} />}
                accent={COLOR.magenta}
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
                <div className="h-full flex items-center justify-center text-sm" style={{ color: COLOR.textMuted }}>
                  Select at least one Overview card to display trend data.
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
                      <Line type="natural" dataKey="followers" name="Followers" stroke={COLOR.mint} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {selectedOverviewMetrics.includes('views') && (
                      <Line type="natural" dataKey="views" name="Views" stroke={COLOR.magenta} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {selectedOverviewMetrics.includes('engagements') && (
                      <Line type="natural" dataKey="engagements" name="Engagements" stroke={COLOR.violet} strokeWidth={2} dot={false} isAnimationActive={false} />
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

            {/* Platform distribution donut chart */}
            {platformDistributionPieData.length > 0 && (
              <div className="mt-4 rounded-[16px] border p-4" style={{ borderColor: COLOR.border, background: COLOR.card }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: COLOR.text }}>
                  {performanceMode === 'growth' ? 'Growth' : performanceMode === 'engagement' ? 'Engagement' : 'Views'} by platform
                </h4>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-[200px] h-[200px] shrink-0">
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
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {platformDistributionPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
                          formatter={(value, name) => {
                            const v = Number(value) || 0;
                            return [
                              `${fmt(v)} (${platformDistributionTotal > 0 ? ((v / platformDistributionTotal) * 100).toFixed(1) : 0}%)`,
                              String(name ?? ''),
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2">
                    {platformDistributionPieData.map((item) => {
                      const pct = platformDistributionTotal > 0 ? ((item.value / platformDistributionTotal) * 100).toFixed(1) : '0';
                      return (
                        <div key={item.name} className="flex items-center justify-between gap-2 py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-sm truncate" style={{ color: COLOR.text }}>{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold tabular-nums" style={{ color: COLOR.text }}>{fmt(item.value)}</span>
                            <span className="text-xs tabular-nums" style={{ color: COLOR.textMuted }}>({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
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
          ENGAGEMENT: Likes / Comments / Shares / Reposts — stacked bar chart
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.traffic} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard className="space-y-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Engagement</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Likes" source="All platforms · likeCount" color={ENGAGEMENT_COLORS.likes} value={fmt(engTotals.likes)} active={selectedEngagement.includes('likes')} onClick={() => setSelectedEngagement((p) => p.includes('likes') ? p.filter((m) => m !== 'likes') : [...p, 'likes'])} />
              <MetricCard label="Comments" source="All platforms · commentsCount" color={ENGAGEMENT_COLORS.comments} value={fmt(engTotals.comments)} active={selectedEngagement.includes('comments')} onClick={() => setSelectedEngagement((p) => p.includes('comments') ? p.filter((m) => m !== 'comments') : [...p, 'comments'])} />
              <MetricCard label="Shares" source="All platforms · sharesCount" color={ENGAGEMENT_COLORS.shares} value={fmt(engTotals.shares)} active={selectedEngagement.includes('shares')} onClick={() => setSelectedEngagement((p) => p.includes('shares') ? p.filter((m) => m !== 'shares') : [...p, 'shares'])} />
              <MetricCard label="Reposts" source="All platforms · repostsCount" color={ENGAGEMENT_COLORS.reposts} value={fmt(engTotals.reposts)} active={selectedEngagement.includes('reposts')} onClick={() => setSelectedEngagement((p) => p.includes('reposts') ? p.filter((m) => m !== 'reposts') : [...p, 'reposts'])} />
            </div>
            <div className="flex justify-end">
              <div className="flex flex-wrap gap-2">
                {selectedEngagement.map((m) => (
                  <span key={m} className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: COLOR.border, color: COLOR.textSecondary }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ENGAGEMENT_COLORS[m] }} />{m.charAt(0).toUpperCase() + m.slice(1)}
                  </span>
                ))}
              </div>
            </div>
            <InsightChartCard title="Engagement" hideHeader flat>
              {selectedEngagement.length === 0 ? (
                <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
                  <div className="absolute inset-0 z-[2] flex items-center justify-center">
                    <div className="rounded-2xl px-5 py-3 text-sm font-medium text-center" style={{ background: '#fff', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}>Select at least one metric card to display engagement data.</div>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.engagementBreakdown ?? []} barCategoryGap="20%" barGap={0} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      ticks={engagementAxisTicks}
                      tickFormatter={formatConsoleAxisTickLabel}
                      tick={{ fill: COLOR.textMuted, fontSize: 10 }}
                      dy={8}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, n: any) => [fmt(Number(v) || 0), String(n ?? '').charAt(0).toUpperCase() + String(n ?? '').slice(1)]} labelFormatter={(l) => fmtTooltipDate(String(l))} />
                    {selectedEngagement.includes('likes') && <Bar dataKey="likes" stackId="e" fill={ENGAGEMENT_COLORS.likes} radius={engagementStackTopKey === 'likes' ? [6,6,0,0] : [0,0,0,0]} barSize={14} />}
                    {selectedEngagement.includes('comments') && <Bar dataKey="comments" stackId="e" fill={ENGAGEMENT_COLORS.comments} radius={engagementStackTopKey === 'comments' ? [6,6,0,0] : [0,0,0,0]} barSize={14} />}
                    {selectedEngagement.includes('shares') && <Bar dataKey="shares" stackId="e" fill={ENGAGEMENT_COLORS.shares} radius={engagementStackTopKey === 'shares' ? [6,6,0,0] : [0,0,0,0]} barSize={14} />}
                    {selectedEngagement.includes('reposts') && <Bar dataKey="reposts" stackId="e" fill={ENGAGEMENT_COLORS.reposts} radius={engagementStackTopKey === 'reposts' ? [6,6,0,0] : [0,0,0,0]} barSize={14} />}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </InsightChartCard>
          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4"><Skeleton className="h-20 rounded-[20px]" /><Skeleton className="h-[300px] rounded-xl" /></ShellCard>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          ACTIVITY: Posts per day — line chart
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard className="space-y-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Activity</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Posts" source="All platforms · posts published in range" color={ACTIVITY_COLORS.posts} value={fmt(actTotals.posts)} active={selectedActivity.includes('posts')} onClick={() => setSelectedActivity((p) => p.includes('posts') ? p.filter((m) => m !== 'posts') : [...p, 'posts'])} />
            </div>
            <div className="flex justify-end">
              <div className="flex flex-wrap gap-2">
                {selectedActivity.map((m) => (
                  <span key={m} className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: COLOR.border, color: COLOR.textSecondary }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ACTIVITY_COLORS[m] }} />{m.charAt(0).toUpperCase() + m.slice(1)}
                  </span>
                ))}
              </div>
            </div>
            <InsightChartCard title="Activity" hideHeader flat>
              {selectedActivity.length === 0 ? (
                <div className="h-[300px] rounded-xl border border-dashed relative overflow-hidden" style={{ borderColor: COLOR.border }}>
                  <div className="absolute inset-0 z-[2] flex items-center justify-center">
                    <div className="rounded-2xl px-5 py-3 text-sm font-medium text-center" style={{ background: '#fff', color: COLOR.textSecondary, boxShadow: '0 1px 16px rgba(15,23,42,0.12)' }}>Select at least one metric card to display activity data.</div>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.activityBreakdown ?? []} margin={{ bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      ticks={activityAxisTicks}
                      tickFormatter={formatConsoleAxisTickLabel}
                      tick={{ fill: COLOR.textMuted, fontSize: 10 }}
                      dy={8}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, n: any) => [fmt(Number(v) || 0), n === 'posts' ? 'Posts' : String(n ?? '')]} labelFormatter={(l) => fmtTooltipDate(String(l))} />
                    {selectedActivity.includes('posts') && <Line type="natural" dataKey="posts" stroke={ACTIVITY_COLORS.posts} strokeWidth={2} dot={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </InsightChartCard>
          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4"><Skeleton className="h-20 rounded-[20px]" /><Skeleton className="h-[300px] rounded-xl" /></ShellCard>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          POSTS: Top posts + Traffic totals side by side
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="scroll-mt-28 space-y-4">
        {data ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
            <ShellCard>
              <h3 className="text-lg font-semibold mb-3" style={{ color: COLOR.text }}>Period totals by platform</h3>
              {platformPeriodTotals.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: COLOR.textMuted }}>No cross-platform totals yet.</div>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr style={{ borderBottom: `1px solid ${COLOR.border}`, color: COLOR.textSecondary }} className="text-left"><th className="py-2 px-2">Platform</th><th className="py-2 px-2">Impressions</th><th className="py-2 px-2">Engagement</th></tr></thead>
                  <tbody>
                    {platformPeriodTotals.map((r) => (
                      <tr key={r.platform} style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                        <td className="py-3 px-2 font-semibold" style={{ color: PLATFORM_COLOR[r.platform] ?? COLOR.text }}>{r.platform}</td>
                        <td className="py-3 px-2 tabular-nums" style={{ color: COLOR.text }}>{fmt(r.impressions)}</td>
                        <td className="py-3 px-2 tabular-nums" style={{ color: COLOR.text }}>{fmt(r.engagement)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ShellCard>
            <ShellCard className="overflow-hidden">
              <h3 className="text-lg font-semibold mb-3" style={{ color: COLOR.text }}>Top Posts</h3>
              {data.topPosts.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: COLOR.textMuted }}>No posts found in this period.</div>
              ) : data.topPosts.map((post, i) => <TopPostCard key={post.id} post={post} rank={i + 1} />)}
            </ShellCard>
          </div>
        ) : loading ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}><ShellCard><Skeleton className="h-64 rounded-xl" /></ShellCard><ShellCard><Skeleton className="h-64 rounded-xl" /></ShellCard></div>
        ) : null}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          HISTORY: Combined uploads table
         ══════════════════════════════════════════════════════════════════════ */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.history} className="scroll-mt-28 space-y-4">
        {data ? (
          <ShellCard>
            <h3 className="text-lg font-semibold mb-3" style={{ color: COLOR.text }}>Combined Uploads History · {dateRange.start} to {dateRange.end}</h3>
            <HistoryTable rows={data.history} />
          </ShellCard>
        ) : loading ? (
          <ShellCard><Skeleton className="h-96 rounded-xl" /></ShellCard>
        ) : null}
      </section>
    </div>
  );
}
