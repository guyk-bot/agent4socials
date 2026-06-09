'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, Play, Users } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { YoutubeIcon } from '@/components/SocialPlatformIcons';

import { BRAND_LIME_DOT, FUNNEL_ANALYTICS_KPIS, FUNNEL_DEMO_BEST_POST_WEEK_SRC, FUNNEL_DEMO_IG_WEEK_POSTS, FUNNEL_DEMO_POST_VIDEO_SRC } from './funnel-demo-assets';

const BRAND = {
  primary: '#7C3AED',
  strong: '#A58DF6',
  soft: '#A78BFA',
  grid: 'rgba(0, 0, 0, 0.018)',
} as const;

/** Daily points with realistic ups/downs; card totals derived from cumulative series. */
const FUNNEL_GROWTH_DAILY = [
  { date: 'Feb 18', followers: 14_712, views: 1_920, engagement: 94 },
  { date: 'Feb 20', followers: 14_728, views: 2_100, engagement: 108 },
  { date: 'Feb 22', followers: 14_701, views: 1_680, engagement: 82 },
  { date: 'Feb 24', followers: 14_734, views: 2_380, engagement: 121 },
  { date: 'Feb 26', followers: 14_719, views: 1_980, engagement: 97 },
  { date: 'Mar 01', followers: 14_768, views: 2_240, engagement: 115 },
  { date: 'Mar 04', followers: 14_751, views: 1_750, engagement: 88 },
  { date: 'Mar 07', followers: 14_809, views: 2_510, engagement: 134 },
  { date: 'Mar 10', followers: 14_847, views: 1_872, engagement: 98 },
];

function buildFunnelGrowthChartData() {
  let viewsSum = 0;
  let engagementSum = 0;
  return FUNNEL_GROWTH_DAILY.map((d) => {
    viewsSum += d.views;
    engagementSum += d.engagement;
    return {
      ...d,
      viewsCumulative: viewsSum,
      engagementCumulative: engagementSum,
    };
  });
}

function formatKpiNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function DemoAvatar({
  label,
  colorClass,
  size = 'sm',
}: {
  label: string;
  colorClass: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'lg'
      ? 'h-9 w-9 text-[11px]'
      : size === 'md'
        ? 'h-7 w-7 text-[10px]'
        : 'h-6 w-6 text-[9px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${colorClass} ${dim}`}
    >
      {label}
    </span>
  );
}

export function DemoImage({
  src,
  alt,
  className = '',
  objectFit = 'contain',
}: {
  src: string;
  alt: string;
  className?: string;
  objectFit?: 'contain' | 'cover';
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`block w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
      draggable={false}
    />
  );
}

/** Portrait frame: 3:4 for schedule demo attachments (slightly smaller in chat bubble). */
const USER_ATTACH_FRAME = 'ml-auto aspect-[3/4] w-full max-w-[52%]';

/** Vertical Reel / Shorts attachment in chat (1080×1920, 9:16). */
const USER_REEL_ATTACH_FRAME = 'ml-auto aspect-[9/16] w-full max-w-[38%]';

/** Thin border on the image only (not the purple chat bubble). */
export function ChatAttachmentImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-white/25 ${USER_ATTACH_FRAME} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-full w-full object-cover object-center pointer-events-none select-none"
        draggable={false}
      />
    </div>
  );
}

/** Reel / Shorts attachment with play overlay and 1080×1920 badge. */
export function ChatAttachmentReel({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-white/25 ${USER_REEL_ATTACH_FRAME} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-full w-full object-cover object-center pointer-events-none select-none"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-black/45 shadow-lg backdrop-blur-[2px]">
          <Play size={20} className="ml-0.5 fill-white text-white" />
        </span>
      </div>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-semibold tracking-wide text-white">
        1080×1920
      </span>
    </div>
  );
}

const ATTACH_DROP_THRESHOLDS = [0.1, 0.24, 0.38, 0.52];

/** Single image drag-and-drop into chat (in document flow so side column scroll works). */
export function ChatDragDropImage({
  progress,
  src,
  alt,
}: {
  progress: number;
  src: string;
  alt: string;
}) {
  const showZone = progress >= 0.08 && progress < 0.16;
  const showImage = progress >= 0.14;

  if (progress < 0.08) return null;

  if (showImage) {
    return (
      <div className="funnel-demo-drag-into-chat">
        <ChatAttachmentImage src={src} alt={alt} />
      </div>
    );
  }

  if (showZone) {
    return (
      <div
        className={`flex ${USER_ATTACH_FRAME} items-center justify-center rounded-md border border-dashed border-white/25 bg-white/5 text-[11px] font-medium text-white/70`}
        aria-hidden
      >
        Drop media here
      </div>
    );
  }

  return null;
}

/** @deprecated use ChatDragDropImage for schedule demo */
export function ChatMediaDropStack({
  progress,
  items,
}: {
  progress: number;
  items: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleCount = ATTACH_DROP_THRESHOLDS.filter((t) => progress >= t).length;
  const scrollIndex = Math.max(0, visibleCount - 2);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (visibleCount <= 2) {
      el.scrollTop = 0;
      return;
    }
    const firstItem = el.querySelector('[data-attach-item]') as HTMLElement | null;
    const gap = 8;
    const itemH = firstItem?.offsetHeight ?? 84;
    el.scrollTo({ top: scrollIndex * (itemH + gap), behavior: 'smooth' });
  }, [visibleCount, scrollIndex]);

  if (visibleCount === 0) return null;

  return (
    <div className="relative w-full">
      {visibleCount > 2 ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 rounded-t-lg bg-gradient-to-b from-black/25 to-transparent"
          aria-hidden
        />
      ) : null}
      <div
        ref={scrollRef}
        className="funnel-demo-attach-scroll max-h-[176px] overflow-y-auto overscroll-contain space-y-2"
        aria-label="Attached media"
      >
        {items.slice(0, visibleCount).map((src, i) => (
          <div
            key={`attach-${i}`}
            data-attach-item
            className="funnel-demo-attach-drop h-[84px] shrink-0"
          >
            <ChatAttachmentImage src={src} alt={`Video ${i + 1}`} className="h-full max-h-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** @deprecated use ChatAttachmentImage or ChatMediaDropStack */
export function InstagramPostPreview({ src, alt }: { src: string; alt: string }) {
  return <ChatAttachmentImage src={src} alt={alt} className="max-h-48" />;
}

/** YouTube video frame: landscape 16:9, full thumbnail visible */
export function YouTubeVideoPreview({ src, alt, title }: { src: string; alt: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
      <div className="relative aspect-video w-full bg-neutral-900">
        <DemoImage src={src} alt={alt} objectFit="contain" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-14 items-center justify-center rounded-xl bg-red-600/95 shadow-lg">
            <Play size={22} className="ml-0.5 fill-white text-white" />
          </span>
        </div>
      </div>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-800">
          <YoutubeIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100 line-clamp-2">
            {title ?? 'Top performing video'}
          </p>
          <p className="text-[10px] text-neutral-500">2.1M views · 184K likes</p>
        </div>
      </div>
    </div>
  );
}

function MiniKpiCard({
  label,
  value,
  trend,
  tint,
}: {
  label: string;
  value: string;
  trend?: string;
  tint: 'violet' | 'blue' | 'emerald';
}) {
  const styles = {
    violet: { bg: 'bg-[#F3EDFF]', border: 'border-[#DDD6FE]', text: 'text-[#1a1a1a]' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
  }[tint];

  return (
    <div
      className={`relative rounded-xl border-2 ${styles.border} ${styles.bg} px-2 py-1.5 shadow-sm min-h-[52px] flex flex-col justify-center`}
    >
      {trend ? (
        <span className="absolute top-1 right-1.5 text-[9px] font-medium text-emerald-600">{trend}</span>
      ) : null}
      <p className={`text-base font-semibold tabular-nums leading-none ${styles.text}`}>{value}</p>
      <p className="text-[10px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

/** Matches dashboard Growth section: KPI cards + composed chart */
export function AnalyticsChart({ show }: { show: boolean }) {
  const chartData = useMemo(() => buildFunnelGrowthChartData(), []);
  const { followers, followersGain, views, engagement } = FUNNEL_ANALYTICS_KPIS;

  if (!show) return null;

  const followersDomain: [number, number] = [
    FUNNEL_GROWTH_DAILY[0].followers - 40,
    followers + 40,
  ];
  const maxDailyViews = Math.max(...FUNNEL_GROWTH_DAILY.map((d) => d.views));
  const viewsDomain: [number, number] = [maxDailyViews * 0.55, maxDailyViews + 180];
  const engagementDomain: [number, number] = [0, engagement + 120];

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 shadow-md overflow-hidden">
      <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-neutral-100 dark:border-neutral-800">
        <MiniKpiCard
          label="Followers"
          value={formatKpiNumber(followers)}
          trend={`+${followersGain}`}
          tint="violet"
        />
        <MiniKpiCard label="Views" value={formatKpiNumber(views)} tint="blue" />
        <MiniKpiCard label="Engagement" value={formatKpiNumber(engagement)} tint="emerald" />
      </div>
      <div className="px-1 pb-1">
        <p className="px-2 pt-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          Audience growth over time
        </p>
        <div className="h-[96px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 2, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BRAND.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                yAxisId="followers"
                tick={{ fontSize: 7, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={32}
                domain={followersDomain}
                tickFormatter={(v) => `${(Number(v) / 1000).toFixed(1)}k`}
              />
              <YAxis
                yAxisId="views"
                orientation="right"
                tick={{ fontSize: 7, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={viewsDomain}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <YAxis yAxisId="engagement" hide domain={engagementDomain} />
              <Line
                yAxisId="followers"
                type="linear"
                dataKey="followers"
                stroke={BRAND.primary}
                strokeWidth={2}
                dot={{ r: 2, fill: BRAND.primary, strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="linear"
                dataKey="views"
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={{ r: 1.5, fill: '#2563eb', strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="engagement"
                type="linear"
                dataKey="engagementCumulative"
                stroke="#059669"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function parseDemoMetric(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  if (value.toUpperCase().includes('K')) return n * 1000;
  return n;
}

function DemoReelPlayOverlay({ show = true, onHover = false }: { show?: boolean; onHover?: boolean }) {
  if (!show) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 ${
        onHover ? 'opacity-0 transition-opacity group-hover:opacity-100' : ''
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/35 bg-black/50 shadow-sm backdrop-blur-[1px]">
        <Play size={10} className="ml-0.5 fill-white text-white" />
      </span>
    </div>
  );
}

const IG_FORMAT_MIX = [
  { name: 'Reels', value: 42, color: '#7C3AED' },
  { name: 'Images', value: 35, color: '#2563eb' },
  { name: 'Carousels', value: 23, color: '#059669' },
];

const IG_WEEK_BY_DAY = [
  { day: 'Mon', posts: 1, postIndices: [0] as number[] },
  { day: 'Tue', posts: 0, postIndices: [] as number[] },
  { day: 'Wed', posts: 2, postIndices: [1, 2] as number[] },
  { day: 'Thu', posts: 1, postIndices: [3] as number[] },
  { day: 'Fri', posts: 1, postIndices: [4] as number[] },
  { day: 'Sat', posts: 1, postIndices: [5] as number[] },
  { day: 'Sun', posts: 0, postIndices: [] as number[] },
];

function IgPostThumb({
  postIndex,
  showPlay,
  className = '',
}: {
  postIndex: number;
  showPlay?: boolean;
  className?: string;
}) {
  const post = FUNNEL_DEMO_IG_WEEK_POSTS[postIndex];
  if (!post) return null;
  const isReel = post.format === 'reel';
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.src} alt={post.label} className="h-full w-full object-cover" draggable={false} />
      <DemoReelPlayOverlay show={showPlay && isReel} />
    </div>
  );
}

function IgPostsHoverPopup({
  day,
  postIndices,
  style,
  showPlay,
}: {
  day: string;
  postIndices: number[];
  style?: React.CSSProperties;
  showPlay?: boolean;
}) {
  if (!postIndices.length) return null;
  return (
    <div
      className="funnel-demo-ig-post-popup absolute z-30 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-xl dark:border-neutral-700 dark:bg-neutral-950"
      style={style}
    >
      <p className="mb-2 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">{day} · {postIndices.length} post{postIndices.length > 1 ? 's' : ''}</p>
      <div className="flex gap-2">
        {postIndices.map((idx) => {
          const post = FUNNEL_DEMO_IG_WEEK_POSTS[idx];
          return (
            <div key={idx} className="w-[84px] shrink-0">
              <div className="aspect-[3/4] overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                <IgPostThumb postIndex={idx} showPlay={showPlay} className="h-full w-full" />
              </div>
              <p className="mt-1 text-[9px] font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
                {post.label}
              </p>
              <p className="text-[8px] text-neutral-500">{post.views} views · {post.likes} likes</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IgPostPerformanceChart({
  activeDay,
  onActiveDayChange,
}: {
  activeDay: string | null;
  onActiveDayChange: (day: string | null) => void;
}) {
  const chartH = 72;
  const points = IG_WEEK_BY_DAY.map((row, i) => {
    const primaryIdx = row.postIndices[0];
    const post = primaryIdx != null ? FUNNEL_DEMO_IG_WEEK_POSTS[primaryIdx] : null;
    const score = post ? parseDemoMetric(post.views) : 0;
    return { ...row, score, postIndex: primaryIdx ?? -1, xPct: (i / (IG_WEEK_BY_DAY.length - 1)) * 100 };
  });
  const maxScore = Math.max(...points.map((p) => p.score), 1);

  const activePoint = points.find((p) => p.day === activeDay);

  const linePoints = points
    .map((p) => {
      const yPct = p.score === 0 ? 92 : 8 + (1 - p.score / maxScore) * 78;
      return `${p.xPct},${yPct}`;
    })
    .join(' ');

  return (
    <div className="relative h-[88px] w-full">
      <svg className="h-[72px] w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={BRAND.primary}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          points={linePoints}
        />
        {points.map((p) => {
          const yPct = p.score === 0 ? 92 : 8 + (1 - p.score / maxScore) * 78;
          return (
            <circle
              key={p.day}
              cx={p.xPct}
              cy={yPct}
              r={activeDay === p.day ? 2.8 : 1.8}
              fill={p.postIndex >= 0 ? BRAND.primary : '#d4d4d4'}
              className="cursor-pointer"
              onMouseEnter={() => onActiveDayChange(p.postIndices.length > 0 ? p.day : null)}
            />
          );
        })}
      </svg>
      <div className="flex justify-between px-0.5">
        {points.map((p) => (
          <span key={p.day} className="text-[7px] text-neutral-500">
            {p.day}
          </span>
        ))}
      </div>
      {activePoint && activePoint.postIndex >= 0 ? (
        <div
          className="pointer-events-none absolute z-20 w-[72px] -translate-x-1/2 transition-all duration-150 ease-out"
          style={{
            left: `${activePoint.xPct}%`,
            top: `${((activePoint.score === 0 ? 92 : 8 + (1 - activePoint.score / maxScore) * 78) / 100) * chartH - 4}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
            <div className="aspect-[3/4] w-[72px]">
              <IgPostThumb postIndex={activePoint.postIndex} showPlay className="h-full w-full" />
            </div>
            <p className="px-1.5 py-1 text-[8px] font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
              {FUNNEL_DEMO_IG_WEEK_POSTS[activePoint.postIndex]?.label}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IgInteractiveFormatPie() {
  const [activeFormat, setActiveFormat] = useState<string | null>(null);

  return (
    <div className="relative">
      <div className="h-[52px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={IG_FORMAT_MIX}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={activeFormat ? 10 : 12}
              outerRadius={activeFormat ? 26 : 22}
              paddingAngle={2}
              isAnimationActive={false}
              onMouseLeave={() => setActiveFormat(null)}
            >
              {IG_FORMAT_MIX.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  opacity={activeFormat && activeFormat !== entry.name ? 0.35 : 1}
                  stroke={activeFormat === entry.name ? entry.color : 'transparent'}
                  strokeWidth={activeFormat === entry.name ? 2 : 0}
                  onMouseEnter={() => setActiveFormat(entry.name)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {activeFormat ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-lg bg-white/95 px-2 py-1 text-center shadow-md dark:bg-neutral-950/95">
            <p className="text-[10px] font-bold text-neutral-900 dark:text-neutral-100">{activeFormat}</p>
            <p className="text-[13px] font-black tabular-nums text-[#7C3AED]">
              {IG_FORMAT_MIX.find((f) => f.name === activeFormat)?.value}%
            </p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[7px] text-neutral-500">
        {IG_FORMAT_MIX.map((f) => (
          <span
            key={f.name}
            className={`inline-flex items-center gap-0.5 transition-all ${activeFormat === f.name ? 'font-bold text-neutral-800 dark:text-neutral-200 scale-105' : ''}`}
            onMouseEnter={() => setActiveFormat(f.name)}
            onMouseLeave={() => setActiveFormat(null)}
          >
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: f.color }} />
            {f.name} {f.value}%
          </span>
        ))}
      </div>
    </div>
  );
}

function IgPostsWeekBarChart({
  activeDay,
  onActiveDayChange,
}: {
  activeDay: string | null;
  onActiveDayChange: (day: string | null) => void;
}) {
  const maxPosts = Math.max(...IG_WEEK_BY_DAY.map((d) => d.posts), 1);

  return (
    <div className="relative h-[52px] w-full">
      <div className="flex h-full items-end justify-between gap-1 px-0.5">
        {IG_WEEK_BY_DAY.map((row) => {
          const heightPct = row.posts === 0 ? 8 : Math.max(18, (row.posts / maxPosts) * 100);
          const isActive = activeDay === row.day;
          return (
            <div
              key={row.day}
              className="relative flex flex-1 flex-col items-center justify-end h-full"
              onMouseEnter={() => onActiveDayChange(row.posts > 0 ? row.day : null)}
              onMouseLeave={() => onActiveDayChange(null)}
            >
              {isActive && row.postIndices.length > 0 ? (
                <IgPostsHoverPopup
                  day={row.day}
                  postIndices={row.postIndices}
                  showPlay
                  style={{
                    bottom: `calc(${heightPct}% + 6px)`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                />
              ) : null}
              <div
                className={`w-full max-w-[22px] rounded-t-sm transition-colors ${
                  isActive ? 'bg-[#6D28D9]' : row.posts > 0 ? 'bg-[#7C3AED]' : 'bg-neutral-200 dark:bg-neutral-700'
                }`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="mt-0.5 text-[7px] text-neutral-500">{row.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Instagram weekly analytics with hover post popups, week strip, and KPIs. */
export function InstagramWeeklyAnalyticsPanel() {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [activeLineDay, setActiveLineDay] = useState<string | null>(null);
  const { followers, followersGain, views, engagement } = FUNNEL_ANALYTICS_KPIS;

  return (
    <div
      className="funnel-demo-analytics-panel rounded-2xl border border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 shadow-md overflow-visible"
      onMouseLeave={() => {
        setActiveDay(null);
        setActiveLineDay(null);
      }}
    >
      <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-neutral-100 dark:border-neutral-800">
        <MiniKpiCard label="Followers" value={formatKpiNumber(followers)} trend={`+${followersGain}`} tint="violet" />
        <MiniKpiCard label="Views" value={formatKpiNumber(views)} tint="blue" />
        <MiniKpiCard label="Engagement" value={formatKpiNumber(engagement)} tint="emerald" />
      </div>

      <div
        className="relative overflow-visible px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800"
        onMouseLeave={() => setActiveLineDay(null)}
      >
        <p className="text-[9px] font-semibold text-neutral-800 dark:text-neutral-200 mb-0.5">
          Post performance (hover for previews)
        </p>
        <IgPostPerformanceChart activeDay={activeLineDay} onActiveDayChange={setActiveLineDay} />
      </div>

      <div className="grid grid-cols-2 gap-2 p-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="relative overflow-visible">
          <p className="text-[9px] font-semibold text-neutral-800 dark:text-neutral-200 mb-0.5">
            Posts last 7 days
          </p>
          <IgPostsWeekBarChart activeDay={activeDay} onActiveDayChange={setActiveDay} />
        </div>
        <div>
          <p className="text-[9px] font-semibold text-neutral-800 dark:text-neutral-200 mb-0.5">Post formats</p>
          <IgInteractiveFormatPie />
        </div>
      </div>

      <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
        <p className="text-[9px] font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">Published this week</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 funnel-demo-scene-scroll">
          {FUNNEL_DEMO_IG_WEEK_POSTS.map((post, i) => (
            <div key={post.src} className="group relative w-[56px] shrink-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.src} alt={post.label} className="h-full w-full object-cover" draggable={false} />
                <DemoReelPlayOverlay show={post.format === 'reel'} onHover />
              </div>
              <div className="funnel-demo-ig-post-popup funnel-demo-ig-post-popup--animate pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-[96px] -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg group-hover:block dark:border-neutral-700 dark:bg-neutral-950">
                <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700 mb-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.src} alt={post.label} className="h-full w-full object-cover" draggable={false} />
                  <DemoReelPlayOverlay show={post.format === 'reel'} onHover />
                </div>
                <p className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">{post.label}</p>
                <p className="mt-0.5 text-[8px] text-neutral-500">{post.views} views · {post.likes} likes</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-2">
        <p className="text-[9px] font-semibold text-neutral-800 dark:text-neutral-200 mb-1">Best post this week</p>
        <div className="flex gap-2">
          <div className="relative aspect-[3/4] w-[56px] shrink-0 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FUNNEL_DEMO_BEST_POST_WEEK_SRC}
              alt="Best performing creator app Reel"
              className="h-full w-full object-cover object-center"
              draggable={false}
            />
            <DemoReelPlayOverlay show />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">The best app for content creators</p>
            <p className="mt-0.5 text-[8px] leading-snug text-neutral-600 dark:text-neutral-400">
              420 likes · 86 comments · 6.8K views. Your Reel outperformed carousels by 2.1x.
            </p>
            <p className="mt-1 text-[8px] text-neutral-500">Reel · with audio</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const ADS_PLATFORM_STATS = [
  {
    label: 'Google',
    hPct: 72,
    roas: '3.84×',
    spend: '$2,437',
    cpa: '$12.40',
    conv: 196,
    colorFrom: '#8ecf3a',
    colorTo: BRAND_LIME_DOT,
  },
  {
    label: 'Meta',
    hPct: 48,
    roas: '2.91×',
    spend: '$5,084',
    cpa: '$18.20',
    conv: 279,
    colorFrom: '#5B21B6',
    colorTo: '#7C3AED',
  },
  {
    label: 'TikTok',
    hPct: 88,
    roas: '4.17×',
    spend: '$1,792',
    cpa: '$9.85',
    conv: 182,
    colorFrom: '#ea580c',
    colorTo: '#fb923c',
  },
] as const;

export function AdsPerformanceChart({ show }: { show: boolean }) {
  if (!show) return null;
  const totalSpend = 9431;
  const blendedRoas = '3.42×';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-neutral-500">Total spend</p>
          <p className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
            ${totalSpend.toLocaleString('en-US')}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-neutral-500">Blended ROAS</p>
          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{blendedRoas}</p>
        </div>
      </div>
      <div className="flex items-end gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-2">
        {ADS_PLATFORM_STATS.map((b) => (
          <div key={b.label} className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5">
            <span className="text-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {b.roas}
            </span>
            <div className="flex h-[80px] items-end">
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.round(80 * (b.hPct / 100))}px`,
                  background: `linear-gradient(to top, ${b.colorFrom}, ${b.colorTo})`,
                }}
              />
            </div>
            <span className="text-center text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
              {b.label}
            </span>
            <span className="text-center text-[9px] text-neutral-500 tabular-nums">{b.spend}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {ADS_PLATFORM_STATS.map((b) => (
          <div
            key={`${b.label}-cpa`}
            className="rounded-md border border-neutral-100 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 px-1.5 py-1 text-center"
          >
            <p className="text-[8px] uppercase text-neutral-500">{b.label} CPA</p>
            <p className="text-[10px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">{b.cpa}</p>
            <p className="text-[8px] text-neutral-500 tabular-nums">{b.conv} conv.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommentRow({
  name,
  avatar,
  colorClass,
  text,
  highlight,
  replied,
  replyText,
  show,
  draft,
}: {
  name: string;
  avatar: string;
  colorClass: string;
  text: string;
  highlight?: boolean;
  replied?: boolean;
  replyText?: string;
  show: boolean;
  /** Draft reply pending approval (no "Reply sent" badge). */
  draft?: boolean;
}) {
  if (!show) return null;
  return (
    <li
      className={`flex items-start gap-1.5 rounded-md border p-1.5 ${
        highlight
          ? 'border-[#7C3AED]/50 bg-[#7C3AED]/10 dark:bg-[#7C3AED]/15'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
      }`}
    >
      <DemoAvatar label={avatar} colorClass={colorClass} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">{name}</p>
        <p className="text-[10px] text-neutral-600 dark:text-neutral-400 leading-snug line-clamp-2">{text}</p>
        {replied && replyText ? (
          <p className="mt-1 rounded-md border border-violet-200/80 bg-violet-50/80 dark:bg-violet-950/30 dark:border-violet-800/50 px-1.5 py-0.5 text-[9px] text-violet-900 dark:text-violet-200 leading-snug line-clamp-3">
            <span className="font-semibold">{draft ? 'Draft reply: ' : 'AI reply: '}</span>
            {replyText}
          </p>
        ) : null}
        {replied && !draft ? (
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={10} /> Reply sent
          </p>
        ) : null}
      </div>
    </li>
  );
}

const LEADS_DEMO_ROWS = [
  {
    name: 'Sarah Chen',
    avatar: 'SC',
    color: 'bg-violet-500',
    comment: 'How much for my team?',
    intent: 'High',
    intentStyle: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
    dm: 'Happy to share pricing in DM',
    showAt: 0.1,
  },
  {
    name: 'Priya Sharma',
    avatar: 'PS',
    color: 'bg-emerald-500',
    comment: 'Does this integrate with Shopify?',
    intent: 'Contact',
    intentStyle: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    dm: 'Yes, setup takes 5 min in DM',
    showAt: 0.22,
  },
  {
    name: 'Mike Torres',
    avatar: 'MT',
    color: 'bg-sky-500',
    comment: 'Available in Europe?',
    intent: 'Medium',
    intentStyle: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    dm: 'Yes, we ship worldwide',
    showAt: 0.34,
  },
  {
    name: 'Daniel Frost',
    avatar: 'DF',
    color: 'bg-amber-500',
    comment: 'Can I book a demo this week?',
    intent: 'High',
    intentStyle: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
    dm: 'Sending calendar link now',
    showAt: 0.46,
  },
] as const;

export function LeadsSpreadsheet({ show, progress = 1 }: { show: boolean; progress?: number }) {
  if (!show) return null;
  const visibleRows = LEADS_DEMO_ROWS.filter((row) => progress >= row.showAt || progress >= 1);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-[9px] uppercase tracking-wide text-neutral-500">
            <th className="px-1.5 py-1.5 font-semibold">Lead</th>
            <th className="px-1.5 py-1.5 font-semibold">Comment</th>
            <th className="px-1.5 py-1.5 font-semibold">Class</th>
            <th className="px-1.5 py-1.5 font-semibold">AI DM</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.name} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0 funnel-demo-message-in">
              <td className="px-1.5 py-1.5 align-top">
                <div className="flex items-center gap-1.5">
                  <DemoAvatar label={row.avatar} colorClass={row.color} size="md" />
                  <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="px-1.5 py-1.5 text-[10px] text-neutral-600 dark:text-neutral-400 align-top max-w-[80px] leading-snug">
                {row.comment}
              </td>
              <td className="px-1.5 py-1.5 align-top">
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${row.intentStyle}`}>
                  {row.intent}
                </span>
              </td>
              <td className="px-1.5 py-1.5 text-[10px] text-[var(--primary)] align-top max-w-[90px] leading-snug font-medium">
                {row.dm}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TEAM_DEMO_ROWS = [
  {
    name: 'Guy K.',
    avatar: 'GK',
    color: 'bg-violet-500',
    role: 'Admin',
    roleStyle: 'border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    activity: 'Active now',
    activityStyle: 'text-emerald-600 dark:text-emerald-400',
    showAt: 0.12,
  },
  {
    name: 'Maya Rodriguez',
    avatar: 'MR',
    color: 'bg-sky-500',
    role: 'Editor',
    roleStyle: 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    activity: '2h ago',
    activityStyle: 'text-neutral-500',
    showAt: 0.28,
  },
  {
    name: 'Alex Kim',
    avatar: 'AK',
    color: 'bg-emerald-500',
    role: 'Viewer',
    roleStyle: 'border-neutral-300 bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
    activity: 'Yesterday',
    activityStyle: 'text-neutral-500',
    showAt: 0.44,
  },
] as const;

export function TeamMembersPanel({ show, progress = 1 }: { show: boolean; progress?: number }) {
  if (!show) return null;
  const visibleRows = TEAM_DEMO_ROWS.filter((row) => progress >= row.showAt || progress >= 1);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-1.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 py-1.5">
        <Users size={12} className="text-[#7C3AED]" />
        <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">Team activity</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-neutral-100 dark:border-neutral-800 text-[9px] uppercase tracking-wide text-neutral-500">
            <th className="px-1.5 py-1 font-semibold">Member</th>
            <th className="px-1.5 py-1 font-semibold">Role</th>
            <th className="px-1.5 py-1 font-semibold text-right">Last active</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.name} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <td className="px-1.5 py-1.5 align-middle">
                <div className="flex items-center gap-1.5">
                  <DemoAvatar label={row.avatar} colorClass={row.color} size="md" />
                  <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="px-1.5 py-1.5 align-middle">
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${row.roleStyle}`}>
                  {row.role}
                </span>
              </td>
              <td className={`px-1.5 py-1.5 text-right text-[9px] font-medium tabular-nums ${row.activityStyle}`}>
                {row.activity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(progress > 0.58 || progress >= 1) && (
        <p className="flex items-center gap-1 border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={11} /> Invite sent to maya@studio.com
        </p>
      )}
    </div>
  );
}

export function AnalyticsReportPreview({ show, progress = 1 }: { show: boolean; progress?: number }) {
  if (!show) return null;
  const showDownload = progress > 0.55 || progress >= 1;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/25 dark:border-orange-900/60 p-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
          Mar 1 to Mar 31 · 8 platforms
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {[
            { label: 'Impressions', value: '1.2M' },
            { label: 'Engagement', value: '48.3K' },
            { label: 'Posts', value: '124' },
            { label: 'Audience', value: '89.4K' },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-md border border-orange-100 bg-white/80 dark:bg-neutral-900/60 dark:border-orange-900/40 px-1.5 py-1"
            >
              <p className="text-[11px] font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{m.value}</p>
              <p className="text-[8px] text-neutral-500">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { title: 'Simplified report', sub: 'PDF · 4 pages' },
          { title: 'Detailed report', sub: 'PDF · 12 pages' },
        ].map((card, i) => (
          <div
            key={card.title}
            className={`rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 ${
              progress > 0.32 + i * 0.12 || progress >= 1 ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <FileText size={14} className="text-[#7C3AED] mb-1" />
            <p className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 leading-snug">{card.title}</p>
            <p className="text-[8px] text-neutral-500">{card.sub}</p>
          </div>
        ))}
      </div>
      {showDownload ? (
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary)]">
          <CheckCircle2 size={11} /> analytics-report-mar.pdf ready
        </p>
      ) : null}
    </div>
  );
}
