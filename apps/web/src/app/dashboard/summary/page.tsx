'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
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

// ─── Date Selector ─────────────────────────────────────────────────────────────

function DayToggle({
  days,
  onChange,
}: {
  days: number;
  onChange: (d: number) => void;
}) {
  const options = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        background: '#f1f5f9',
        borderRadius: 12,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '6px 16px',
            borderRadius: 9,
            border: 'none',
            background: days === o.value ? '#ffffff' : 'transparent',
            color: days === o.value ? '#0f172a' : '#64748b',
            fontWeight: days === o.value ? 600 : 400,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.15s',
            boxShadow: days === o.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UnifiedSummaryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const days = useMemo(() => {
    const raw = Number(searchParams.get('days'));
    return [7, 30, 90].includes(raw) ? raw : 30;
  }, [searchParams]);

  const [data, setData] = useState<UnifiedSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([...CHART_PLATFORMS]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
        params: { days },
      });
      setData(res.data);
    } catch {
      setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDaysChange = useCallback(
    (d: number) => {
      router.push(`/dashboard/summary?days=${d}`);
    },
    [router]
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

  const periodLabel = days === 7 ? '7d' : days === 30 ? '30d' : '90d';

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
      style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '32px 24px 64px',
        fontFamily: 'var(--font-inter, system-ui, sans-serif)',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Command Center
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>
            Unified analytics across all your connected platforms
          </p>
        </div>
        <DayToggle days={days} onChange={handleDaysChange} />
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* ── KPI Grid ── */}
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

      {/* ── Platform Mix Chart + Top Posts (2-col) ── */}
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
          {/* Platform Mix */}
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

          {/* Top Posts */}
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
        </div>
      ) : null}

      {/* ── Combined History ── */}
      {loading ? (
        <Skeleton className="" style={{ height: 400 } as React.CSSProperties} />
      ) : data ? (
        <Card>
          <SectionTitle>
            Combined Uploads History · Last {days} days
          </SectionTitle>
          <HistoryTable rows={data.history} />
        </Card>
      ) : null}
    </div>
  );
}
