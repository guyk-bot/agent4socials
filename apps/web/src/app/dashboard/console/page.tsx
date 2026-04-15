'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
  UnifiedEngagementDay,
  UnifiedActivityDay,
} from '@/lib/analytics/unified-metrics-types';
import { PLATFORM_COLOR, CHART_PLATFORMS } from '@/lib/analytics/unified-metrics-types';
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

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    default: return null;
  }
}

const CONSOLE_ACCOUNT_PLATFORM_ORDER = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'PINTEREST', 'TWITTER'] as const;

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

function KpiCard({ label, value, growthPct, icon, accent, period }: {
  label: string; value: string; growthPct: number; icon: React.ReactNode; accent: string; period: string;
}) {
  const positive = growthPct >= 0;
  const noChange = Math.abs(growthPct) < 0.05;
  return (
    <div style={{
      background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 20,
      padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', letterSpacing: 0.2 }}>{label}</span>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>{icon}</div>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {noChange ? <Minus size={14} color="#94a3b8" /> : positive ? <TrendingUp size={14} color="#22c55e" /> : <TrendingDown size={14} color="#ef4444" />}
        <span style={{ fontSize: 12, fontWeight: 600, color: noChange ? '#94a3b8' : positive ? '#22c55e' : '#ef4444' }}>
          {noChange ? 'No change' : fmtPct(growthPct)}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>vs prev {period}</span>
      </div>
    </div>
  );
}

// ─── Platform mix chart: stacked lines only (no gradient area fill) ───────────

function PlatformMixChart({ data, activePlatforms }: { data: UnifiedChartData; activePlatforms: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
        <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11, fill: COLOR.textMuted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: COLOR.textMuted }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12, fontSize: 12 }}
          labelFormatter={(v) => fmtAxisDate(String(v))}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [fmt(Number(value) ?? 0), name ?? '']}
        />
        {activePlatforms.map((p) => (
          <Line
            key={p}
            type="monotone"
            dataKey={p}
            stroke={PLATFORM_COLOR[p]}
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

/** Toggle which platform series are shown on the chart; uses platform logos like the sidebar. */
function PlatformLegend({ activePlatforms, toggle, all }: { activePlatforms: string[]; toggle: (p: string) => void; all: string[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Platforms shown on chart">
      {all.map((p) => {
        const active = activePlatforms.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            aria-pressed={active}
            title={active ? `Hide ${p}` : `Show ${p}`}
            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-[opacity,box-shadow,transform] hover:scale-[1.02] active:scale-[0.98]"
            style={{
              borderColor: COLOR.border,
              background: active ? 'rgba(255,255,255,0.95)' : 'rgba(248,250,252,0.9)',
              opacity: active ? 1 : 0.45,
              boxShadow: active ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              color: active ? COLOR.text : COLOR.textMuted,
            }}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center [&>svg]:max-h-[18px] [&>svg]:max-w-[18px]">
              <PlatformIcon platform={p} size={16} />
            </span>
            <span>{p}</span>
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
  const cachedAccounts = accountsCache?.cachedAccounts ?? [];
  const setSelectedAccount = useSelectedAccount()?.setSelectedAccount;

  const orderedAccounts = useMemo(() => {
    const list = (cachedAccounts as SocialAccount[]).slice();
    const orderIdx = (p: string) => { const i = (CONSOLE_ACCOUNT_PLATFORM_ORDER as readonly string[]).indexOf(p.toUpperCase()); return i === -1 ? 99 : i; };
    list.sort((a, b) => { const d = orderIdx(a.platform) - orderIdx(b.platform); return d !== 0 ? d : (a.username || '').localeCompare(b.username || ''); });
    return list;
  }, [cachedAccounts]);

  const goToAccountDashboard = useCallback((acc: SocialAccount) => {
    setSelectedAccount?.(acc);
    router.push(`/dashboard?accountId=${encodeURIComponent(acc.id)}`);
  }, [router, setSelectedAccount]);

  const emptyAccountsInitials = ((user?.name?.trim() || user?.email?.split('@')[0] || '?').slice(0, 2) || '?').toUpperCase();

  const dateRange = useMemo(() => {
    const start = searchParams.get('start') ?? searchParams.get('since');
    const end = searchParams.get('end') ?? searchParams.get('until');
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end) return { start, end };
    const rawDays = Number(searchParams.get('days'));
    if ([7, 30, 90].includes(rawDays)) return rangeFromDaysParam(rawDays);
    if (user?.id) { const stored = readStoredAnalyticsDateRange(user.id); if (stored) return stored; }
    return getDefaultAnalyticsDateRange();
  }, [searchParams, user?.id]);

  const [data, setData] = useState<UnifiedSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Performance section
  const [performanceMode, setPerformanceMode] = useState<'growth' | 'engagement' | 'views'>('growth');
  const [activePlatforms, setActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);
  useEffect(() => { setActivePlatforms([...CHART_PLATFORMS]); }, [performanceMode]);

  // Engagement section
  const [selectedEngagement, setSelectedEngagement] = useState<('likes' | 'comments' | 'shares' | 'reposts')[]>(['likes', 'comments', 'shares']);

  // Activity section
  const [selectedActivity, setSelectedActivity] = useState<('posts')[]>(['posts']);

  useEffect(() => {
    if (!user?.id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    const cached = readUnifiedSummaryCache(user.id, dateRange.start, dateRange.end);
    const hadCache = !!cached;
    if (cached) { setData(cached); setError(null); setLoading(false); } else { setLoading(true); }
    setError(null);
    (async () => {
      try {
        const res = await api.get<UnifiedSummaryResponse>('/analytics/summary', { params: { since: dateRange.start, until: dateRange.end } });
        if (cancelled) return;
        setData(res.data); setError(null);
        writeUnifiedSummaryCache(user.id, dateRange.start, dateRange.end, res.data);
      } catch { if (!cancelled && !hadCache) setError('Failed to load analytics. Please try again.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id, dateRange.start, dateRange.end]);

  const onDateRangeChange = useCallback((range: { start: string; end: string }) => {
    if (user?.id) writeStoredAnalyticsDateRange(range, user.id);
    router.replace(`/dashboard/console?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`);
  }, [router, user?.id]);

  const togglePlatform = useCallback((p: string) => {
    setActivePlatforms((prev) => prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]);
  }, []);

  const activeChartData = useMemo((): UnifiedChartData => {
    if (!data) return [];
    if (performanceMode === 'growth') return data.audienceChart ?? [];
    if (performanceMode === 'engagement') return data.engagementChart ?? [];
    return data.chart ?? [];
  }, [data, performanceMode]);

  const platformsWithChartData = useMemo(() => {
    if (!activeChartData.length) return [...CHART_PLATFORMS];
    const s = new Set<string>();
    for (const row of activeChartData) for (const p of CHART_PLATFORMS) if ((row[p] as number) > 0) s.add(p);
    return CHART_PLATFORMS.filter((p) => s.has(p));
  }, [activeChartData]);

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

  const periodLabel = useMemo(() => {
    const a = new Date(`${dateRange.start}T12:00:00`).getTime();
    const b = new Date(`${dateRange.end}T12:00:00`).getTime();
    return `${Math.max(1, Math.floor((b - a) / 86_400_000) + 1)}d`;
  }, [dateRange.start, dateRange.end]);

  const platformPeriodTotals = useMemo(() => {
    if (!data?.chart) return [];
    const imp: Record<string, number> = {}; const eng: Record<string, number> = {};
    for (const p of CHART_PLATFORMS) { imp[p] = 0; eng[p] = 0; }
    for (const row of data.chart) for (const p of CHART_PLATFORMS) imp[p] += (row[p] as number) ?? 0;
    for (const row of (data.engagementChart ?? [])) for (const p of CHART_PLATFORMS) eng[p] += (row[p] as number) ?? 0;
    return CHART_PLATFORMS.map((p) => ({ platform: p, impressions: imp[p], engagement: eng[p] })).filter((x) => x.impressions > 0 || x.engagement > 0);
  }, [data]);

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
              {loading
                ? <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: COLOR.textSecondary }}><RefreshCw size={13} className="animate-spin opacity-75" aria-hidden />Refreshing…</span>
                : <span className="inline-flex items-center gap-2 text-sm" style={{ color: COLOR.textSecondary }}><RefreshCw size={13} className="opacity-75" aria-hidden />Updated just now</span>
              }
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
        {/* KPI cards — always shown when data exists (even while refreshing) */}
        {data ? (
          <ShellCard className="space-y-3">
            <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Overview</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard label="Followers" value={fmt(data.kpi.totalAudience)} growthPct={data.kpi.audienceGrowthPercentage} icon={<Users size={18} />} accent={COLOR.mint} period={periodLabel} />
              <KpiCard label="Views" value={fmt(data.kpi.totalImpressions)} growthPct={data.kpi.impressionsGrowthPercentage} icon={<Eye size={18} />} accent={COLOR.magenta} period={periodLabel} />
              <KpiCard label="Engagements" value={fmt(data.kpi.totalEngagement)} growthPct={data.kpi.engagementGrowthPercentage} icon={<Heart size={18} />} accent={COLOR.violet} period={periodLabel} />
            </div>
          </ShellCard>
        ) : loading ? (
          <ShellCard className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-20 rounded-[20px]" />)}</div>
          </ShellCard>
        ) : null}

        {/* Performance chart */}
        {data ? (
          <ShellCard className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold" style={{ color: COLOR.text }}>Performance</h3>
            </div>
            <div className="mb-5 flex gap-2">
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
            <div className="flex justify-end">
              <PlatformLegend all={platformsWithChartData.length > 0 ? platformsWithChartData as string[] : [...CHART_PLATFORMS] as string[]} activePlatforms={activePlatforms} toggle={togglePlatform} />
            </div>
            <InsightChartCard title="Performance" hideHeader flat>
              {activeChartData.length > 0 && !activeChartData.every((row) => activePlatforms.every((p) => (row[p] as number) === 0)) ? (
                <PlatformMixChart data={activeChartData} activePlatforms={activePlatforms.filter((p) => platformsWithChartData.length > 0 ? (platformsWithChartData as string[]).includes(p) : true)} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm" style={{ color: COLOR.textMuted }}>
                  {performanceMode === 'growth' ? 'No audience data yet.' : performanceMode === 'engagement' ? 'No engagement data yet.' : 'No impressions data yet.'}
                </div>
              )}
            </InsightChartCard>
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
                  <BarChart data={data.engagementBreakdown ?? []} barCategoryGap="20%" barGap={0} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={28} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, n: any) => [fmt(Number(v) || 0), String(n ?? '').charAt(0).toUpperCase() + String(n ?? '').slice(1)]} labelFormatter={(l) => fmtAxisDate(String(l))} />
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
                  <ComposedChart data={data.activityBreakdown ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fill: COLOR.textMuted, fontSize: 11 }} dy={8} minTickGap={18} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 'auto']} tick={{ fill: COLOR.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLOR.border}`, borderRadius: 12 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, n: any) => [fmt(Number(v) || 0), n === 'posts' ? 'Posts' : String(n ?? '')]} labelFormatter={(l) => fmtAxisDate(String(l))} />
                    {selectedActivity.includes('posts') && <Line type="monotone" dataKey="posts" stroke={ACTIVITY_COLORS.posts} strokeWidth={2} dot={false} />}
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
