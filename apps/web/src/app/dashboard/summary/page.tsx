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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
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
  UnifiedKpiSummary,
  UnifiedChartData,
  UnifiedTopPost,
  UnifiedHistoryPost,
  UnifiedSummaryResponse,
} from '@/lib/analytics/unified-metrics-types';
import { PLATFORM_COLOR, CHART_PLATFORMS } from '@/lib/analytics/unified-metrics-types';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { StickySectionNav, FACEBOOK_ANALYTICS_SECTION_IDS } from '@/components/analytics/facebook/FacebookAnalyticsView';

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

function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

// ─── Platform Icon ────────────────────────────────────────────────────────────

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const props = { size };
  switch (platform) {
    case 'Instagram': return <InstagramIcon {...props} />;
    case 'Meta': return <FacebookIcon {...props} />;
    case 'X': return <XTwitterIcon {...props} className="text-neutral-700" />;
    case 'LinkedIn': return <LinkedinIcon {...props} />;
    case 'YouTube': return <YoutubeIcon {...props} />;
    case 'TikTok': return <TikTokIcon {...props} />;
    case 'Pinterest': return <PinterestIcon {...props} />;
    default: return null;
  }
}

const CONSOLE_ACCOUNT_PLATFORM_ORDER = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'LINKEDIN',
  'PINTEREST',
  'TWITTER',
] as const;

function AccountBadgeIcon({ platform, size = 12 }: { platform: string; size?: number }) {
  const p = (platform || '').toUpperCase();
  const iconProps = { size };
  switch (p) {
    case 'FACEBOOK':
      return <FacebookIcon {...iconProps} />;
    case 'INSTAGRAM':
      return <InstagramIcon {...iconProps} />;
    case 'TIKTOK':
      return <TikTokIcon {...iconProps} />;
    case 'YOUTUBE':
      return <YoutubeIcon {...iconProps} />;
    case 'TWITTER':
      return <XTwitterIcon {...iconProps} className="text-neutral-700" />;
    case 'LINKEDIN':
      return <LinkedinIcon {...iconProps} />;
    case 'PINTEREST':
      return <PinterestIcon {...iconProps} />;
    default:
      return <span className="text-[8px] font-bold text-neutral-400">{p.slice(0, 1) || '?'}</span>;
  }
}

/** Matches `FacebookAnalyticsView` header tokens for a consistent shell. */
const CONSOLE_HEADER_COLOR = {
  text: '#111827',
  textSecondary: '#667085',
  violet: '#7c6cff',
} as const;

const CONSOLE_SUMMARY_NAV_SECTIONS = [
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.overview, label: 'Overview' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.traffic, label: 'Traffic' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.posts, label: 'Posts' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.reels, label: 'Reels' },
  { id: FACEBOOK_ANALYTICS_SECTION_IDS.history, label: 'History' },
] as const;

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  growthPct,
  icon,
  accent,
  period,
}: {
  label: string;
  value: string;
  growthPct: number;
  icon: React.ReactNode;
  accent: string;
  period: string;
}) {
  const positive = growthPct >= 0;
  const noChange = Math.abs(growthPct) < 0.05;

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 20,
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', letterSpacing: 0.2 }}>{label}</span>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${accent}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
          }}
        >
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {noChange ? (
          <Minus size={14} color="#94a3b8" />
        ) : positive ? (
          <TrendingUp size={14} color="#22c55e" />
        ) : (
          <TrendingDown size={14} color="#ef4444" />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: noChange ? '#94a3b8' : positive ? '#22c55e' : '#ef4444',
          }}
        >
          {noChange ? 'No change' : fmtPct(growthPct)}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>vs prev {period}</span>
      </div>
    </div>
  );
}

// ─── Platform Mix Chart ────────────────────────────────────────────────────────

const AREA_OPACITY = 0.55;

function PlatformMixChart({
  data,
  activePlatforms,
}: {
  data: UnifiedChartData;
  activePlatforms: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {activePlatforms.map((p) => (
            <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PLATFORM_COLOR[p]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={PLATFORM_COLOR[p]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtAxisDate}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => fmt(v)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          labelFormatter={(v) => fmtAxisDate(String(v))}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [fmt(value ?? 0), name ?? '']}
        />
        {activePlatforms.map((p) => (
          <Area
            key={p}
            type="monotone"
            dataKey={p}
            stackId="1"
            stroke={PLATFORM_COLOR[p]}
            strokeWidth={1.5}
            fill={`url(#grad-${p})`}
            fillOpacity={AREA_OPACITY}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Platform Legend Pills ─────────────────────────────────────────────────────

function PlatformLegend({
  activePlatforms,
  toggle,
  all,
}: {
  activePlatforms: string[];
  toggle: (p: string) => void;
  all: string[];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {all.map((p) => {
        const active = activePlatforms.includes(p);
        return (
          <button
            key={p}
            onClick={() => toggle(p)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              border: `1.5px solid ${active ? PLATFORM_COLOR[p] : 'rgba(0,0,0,0.1)'}`,
              background: active ? `${PLATFORM_COLOR[p]}12` : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontSize: 12,
              fontWeight: 500,
              color: active ? PLATFORM_COLOR[p] : '#94a3b8',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: active ? PLATFORM_COLOR[p] : '#d1d5db',
                display: 'inline-block',
              }}
            />
            {p}
          </button>
        );
      })}
    </div>
  );
}

// ─── Top Posts Feed ────────────────────────────────────────────────────────────

function TopPostCard({ post, rank }: { post: UnifiedTopPost; rank: number }) {
  const color = PLATFORM_COLOR[post.platform] ?? '#8b5cf6';
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        alignItems: 'flex-start',
      }}
    >
      {/* Rank */}
      <div
        style={{
          minWidth: 28,
          height: 28,
          borderRadius: 8,
          background: rank <= 3 ? `${color}18` : '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: rank <= 3 ? color : '#94a3b8',
        }}
      >
        {rank}
      </div>

      {/* Thumbnail */}
      {post.thumbnailUrl ? (
        <img
          src={post.thumbnailUrl}
          alt=""
          style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            background: `${color}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}
        >
          <FileText size={18} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <PlatformIcon platform={post.platform} size={13} />
          <span style={{ fontSize: 11, fontWeight: 600, color }}>
            {post.platform}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
            {fmtDate(post.postedAt)}
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: '#334155',
            margin: 0,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
          }}
        >
          {post.caption || '(no caption)'}
        </p>
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <Stat icon={<Heart size={11} />} value={fmt(post.likes)} />
          <Stat icon={<Eye size={11} />} value={fmt(post.impressions)} />
          {post.url && (
            <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto' }}>
              <ExternalLink size={12} color="#94a3b8" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
      {icon}
      {value}
    </span>
  );
}

// ─── Combined History Table ────────────────────────────────────────────────────

const MEDIA_ICON: Record<string, React.ReactNode> = {
  VIDEO: <Film size={12} />,
  IMAGE: <ImageIcon size={12} />,
  REEL: <Film size={12} />,
};

function HistoryTable({ rows }: { rows: UnifiedHistoryPost[] }) {
  const [filter, setFilter] = useState<string>('All');
  const platforms = useMemo(() => {
    const set = new Set(rows.map((r) => r.platform));
    return ['All', ...Array.from(set)];
  }, [rows]);

  const visible = filter === 'All' ? rows : rows.filter((r) => r.platform === filter);

  return (
    <div>
      {/* Platform filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1.5px solid ${filter === p ? (PLATFORM_COLOR[p] ?? '#8b5cf6') : 'rgba(0,0,0,0.1)'}`,
              background: filter === p ? `${PLATFORM_COLOR[p] ?? '#8b5cf6'}12` : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: filter === p ? (PLATFORM_COLOR[p] ?? '#8b5cf6') : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {p !== 'All' && <PlatformIcon platform={p} size={12} />}
            {p}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              {['Platform', 'Post', 'Type', 'Date', 'Impressions', 'Likes', 'Comments', 'Shares', 'Engagement'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  style={{ padding: '32px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
                >
                  No posts in this period
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const color = PLATFORM_COLOR[row.platform] ?? '#8b5cf6';
                return (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                  >
                    {/* Platform */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PlatformIcon platform={row.platform} size={13} />
                        <span style={{ fontSize: 12, fontWeight: 500, color }}>{row.platform}</span>
                      </div>
                    </td>
                    {/* Post */}
                    <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.thumbnailUrl ? (
                          <img
                            src={row.thumbnailUrl}
                            alt=""
                            style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              background: `${color}12`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color,
                              flexShrink: 0,
                            }}
                          >
                            <FileText size={13} />
                          </div>
                        )}
                        <span
                          style={{
                            color: '#334155',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 180,
                            display: 'block',
                          }}
                        >
                          {row.caption || '(no caption)'}
                        </span>
                        {row.url && (
                          <a href={row.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={11} color="#94a3b8" />
                          </a>
                        )}
                      </div>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 11,
                          color: '#64748b',
                          background: '#f1f5f9',
                          borderRadius: 6,
                          padding: '2px 7px',
                        }}
                      >
                        {MEDIA_ICON[row.mediaType ?? ''] ?? <FileText size={12} />}
                        {row.mediaType ?? 'Post'}
                      </span>
                    </td>
                    {/* Date */}
                    <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} />
                        {fmtDate(row.postedAt)}
                      </div>
                    </td>
                    {/* Metrics */}
                    {[row.impressions, row.likes, row.comments, row.shares, row.totalEngagement].map((v, i) => (
                      <td key={i} style={{ padding: '10px 12px', color: '#0f172a', fontWeight: i === 4 ? 600 : 400 }}>
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#0f172a',
        margin: '0 0 16px',
      }}
    >
      {children}
    </h2>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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
    const orderIdx = (p: string) => {
      const u = p.toUpperCase();
      const i = (CONSOLE_ACCOUNT_PLATFORM_ORDER as readonly string[]).indexOf(u);
      return i === -1 ? 99 : i;
    };
    list.sort((a, b) => {
      const d = orderIdx(a.platform) - orderIdx(b.platform);
      if (d !== 0) return d;
      return (a.username || '').localeCompare(b.username || '');
    });
    return list;
  }, [cachedAccounts]);

  const goToAccountDashboard = useCallback(
    (acc: SocialAccount) => {
      setSelectedAccount?.(acc);
      router.push(`/dashboard?accountId=${encodeURIComponent(acc.id)}`);
    },
    [router, setSelectedAccount]
  );

  const headerTitle = (user?.name?.trim() || user?.email?.split('@')[0] || 'Console').trim();

  const dateRange = useMemo(() => {
    const start = searchParams.get('start') ?? searchParams.get('since');
    const end = searchParams.get('end') ?? searchParams.get('until');
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end) {
      return { start, end };
    }
    const rawDays = Number(searchParams.get('days'));
    if ([7, 30, 90].includes(rawDays)) {
      return rangeFromDaysParam(rawDays);
    }
    if (user?.id) {
      const stored = readStoredAnalyticsDateRange(user.id);
      if (stored) return stored;
    }
    return getDefaultAnalyticsDateRange();
  }, [searchParams, user?.id]);

  const [data, setData] = useState<UnifiedSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = readUnifiedSummaryCache(user.id, dateRange.start, dateRange.end);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    (async () => {
      try {
        const res = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
          params: { since: dateRange.start, until: dateRange.end },
        });
        if (cancelled) return;
        setData(res.data);
        writeUnifiedSummaryCache(user.id, dateRange.start, dateRange.end, res.data);
      } catch {
        if (!cancelled) setError('Failed to load analytics. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dateRange.start, dateRange.end]);

  const onDateRangeChange = useCallback(
    (range: { start: string; end: string }) => {
      if (user?.id) writeStoredAnalyticsDateRange(range, user.id);
      router.replace(
        `/dashboard/summary?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
      );
    },
    [router, user?.id]
  );

  const togglePlatform = useCallback((p: string) => {
    setActivePlatforms((prev) =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
    );
  }, []);

  // Platforms that actually have data
  const platformsWithData = useMemo(() => {
    if (!data?.chart) return [...CHART_PLATFORMS];
    const hasData = new Set<string>();
    for (const row of data.chart) {
      for (const p of CHART_PLATFORMS) {
        if ((row[p] as number) > 0) hasData.add(p);
      }
    }
    return CHART_PLATFORMS.filter((p) => hasData.has(p));
  }, [data]);

  const periodLabel = useMemo(() => {
    const a = new Date(`${dateRange.start}T12:00:00`).getTime();
    const b = new Date(`${dateRange.end}T12:00:00`).getTime();
    const days = Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
    return `${days}d`;
  }, [dateRange.start, dateRange.end]);

  if (!user) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}
      >
        Sign in to view your unified analytics.
      </div>
    );
  }

  return (
    <div
      className="p-0 md:p-0.5 space-y-3"
      style={{
        maxWidth: 1400,
        background: '#f6f7fb',
        fontFamily: 'var(--font-inter, system-ui, sans-serif)',
      }}
    >
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
          onClick={() => router.push('/pricing')}
          className="shrink-0 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] gradient-cta-pro"
        >
          Upgrade now
          <ArrowRight className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <section className="rounded-[20px] p-3 md:p-3.5" style={{ background: '#ffffff' }}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {orderedAccounts.length === 0 ? (
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    background: '#eef2ff',
                    color: CONSOLE_HEADER_COLOR.violet,
                  }}
                  aria-hidden
                >
                  {headerTitle.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                orderedAccounts.map((acc) => {
                  const label = acc.username || acc.platform || 'Account';
                  const initials = label.replace(/^@/, '').slice(0, 2).toUpperCase() || '?';
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => goToAccountDashboard(acc)}
                      className="group shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                      title={`Open ${label} dashboard`}
                      aria-label={`Open ${label} dashboard`}
                    >
                      <span className="relative block h-11 w-11 overflow-hidden rounded-full bg-neutral-100 shadow-sm ring-2 ring-white transition-transform group-hover:scale-[1.03] group-active:scale-[0.98]">
                        {acc.profilePicture ? (
                          <img src={acc.profilePicture} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span
                            className="flex h-full w-full items-center justify-center text-xs font-semibold"
                            style={{ background: '#eef2ff', color: CONSOLE_HEADER_COLOR.violet }}
                          >
                            {initials}
                          </span>
                        )}
                        <span
                          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-neutral-200/90 [&>svg]:shrink-0"
                          aria-hidden
                        >
                          <AccountBadgeIcon platform={acc.platform} size={11} />
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold" style={{ color: CONSOLE_HEADER_COLOR.text }}>
                  {headerTitle}
                </h1>
              </div>
              {loading ? (
                <span
                  className="inline-flex items-center gap-2 text-sm font-medium"
                  style={{ color: CONSOLE_HEADER_COLOR.textSecondary }}
                >
                  <RefreshCw size={13} className="animate-spin opacity-75" aria-hidden />
                  Refreshing…
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-2 text-sm"
                  style={{ color: CONSOLE_HEADER_COLOR.textSecondary }}
                >
                  <RefreshCw size={13} className="opacity-75" aria-hidden />
                  Updated just now
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AnalyticsDateRangePicker start={dateRange.start} end={dateRange.end} onChange={onDateRangeChange} />
          </div>
        </div>
        <div className="mt-2">
          <StickySectionNav
            sections={[...CONSOLE_SUMMARY_NAV_SECTIONS]}
            activeSection={FACEBOOK_ANALYTICS_SECTION_IDS.overview}
            ariaLabel="Console analytics sections"
          />
        </div>
        {loading && !error ? (
          <p className="mt-2.5 text-xs font-medium animate-pulse" style={{ color: CONSOLE_HEADER_COLOR.textSecondary }}>
            Refreshing unified analytics. Numbers and charts will update when ready.
          </p>
        ) : null}
      </section>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#dc2626',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ── KPI Grid (Overview) ── */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.overview} className="scroll-mt-28 space-y-4">
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="" style={{ height: 140 } as React.CSSProperties} />
            ))}
          </div>
        ) : data ? (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}
          >
            <KpiCard
              label="Total Audience"
              value={fmt(data.kpi.totalAudience)}
              growthPct={data.kpi.audienceGrowthPercentage}
              icon={<Users size={18} />}
              accent="#8b5cf6"
              period={periodLabel}
            />
            <KpiCard
              label="Total Impressions"
              value={fmt(data.kpi.totalImpressions)}
              growthPct={data.kpi.impressionsGrowthPercentage}
              icon={<Eye size={18} />}
              accent="#3b82f6"
              period={periodLabel}
            />
            <KpiCard
              label="Total Engagement"
              value={fmt(data.kpi.totalEngagement)}
              growthPct={data.kpi.engagementGrowthPercentage}
              icon={<Heart size={18} />}
              accent="#e1306c"
              period={periodLabel}
            />
            <KpiCard
              label="Posts Published"
              value={fmt(data.kpi.totalPosts)}
              growthPct={data.kpi.postsGrowthPercentage}
              icon={<FileText size={18} />}
              accent="#f59e0b"
              period={periodLabel}
            />
          </div>
        ) : null}
      </section>

      {/* ── Platform Mix + Top Posts (Traffic / Posts; Reels scroll target wraps grid) ── */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.reels} className="scroll-mt-28 space-y-4">
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>
            <Skeleton className="" style={{ height: 380 } as React.CSSProperties} />
            <Skeleton className="" style={{ height: 380 } as React.CSSProperties} />
          </div>
        ) : data ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 340px',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <section id={FACEBOOK_ANALYTICS_SECTION_IDS.traffic} className="min-w-0 scroll-mt-28 space-y-4">
              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <SectionTitle>Platform Mix · Impressions</SectionTitle>
                  <PlatformLegend
                    all={platformsWithData.length > 0 ? (platformsWithData as string[]) : ([...CHART_PLATFORMS] as string[])}
                    activePlatforms={activePlatforms}
                    toggle={togglePlatform}
                  />
                </div>
                {data.chart.every((row) => activePlatforms.every((p) => (row[p] as number) === 0)) ? (
                  <div
                    style={{
                      height: 280,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: 14,
                    }}
                  >
                    No impression data for this period.
                    <br />
                    Post some content to see it here!
                  </div>
                ) : (
                  <PlatformMixChart
                    data={data.chart}
                    activePlatforms={activePlatforms.filter((p) =>
                      platformsWithData.length > 0 ? (platformsWithData as string[]).includes(p) : true
                    )}
                  />
                )}
              </Card>
            </section>

            <section id={FACEBOOK_ANALYTICS_SECTION_IDS.posts} className="min-w-0 scroll-mt-28 space-y-4">
              <Card style={{ overflow: 'hidden' }}>
                <SectionTitle>Top Posts</SectionTitle>
                {data.topPosts.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                    No posts found in this period.
                  </div>
                ) : (
                  <div>
                    {data.topPosts.map((post, i) => (
                      <TopPostCard key={post.id} post={post} rank={i + 1} />
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </div>
        ) : null}
      </section>

      {/* ── Combined History ── */}
      <section id={FACEBOOK_ANALYTICS_SECTION_IDS.history} className="scroll-mt-28 space-y-4">
        {loading ? (
          <Skeleton className="" style={{ height: 400 } as React.CSSProperties} />
        ) : data ? (
          <Card>
            <SectionTitle>
              Combined Uploads History · {dateRange.start} to {dateRange.end}
            </SectionTitle>
            <HistoryTable rows={data.history} />
          </Card>
        ) : null}
      </section>
    </div>
  );
}
