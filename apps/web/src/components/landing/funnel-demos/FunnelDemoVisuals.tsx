'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Play } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { YoutubeIcon } from '@/components/SocialPlatformIcons';

import { FUNNEL_ANALYTICS_KPIS } from './funnel-demo-assets';

const BRAND = {
  primary: '#7C3AED',
  strong: '#A58DF6',
  soft: '#A78BFA',
  grid: 'rgba(0, 0, 0, 0.018)',
} as const;

/** Daily points; card totals and chart cumulative series derived from these. */
const FUNNEL_GROWTH_DAILY = [
  { date: 'Feb 18', followers: 14_830, views: 2_500, engagement: 130 },
  { date: 'Feb 22', followers: 14_855, views: 2_800, engagement: 145 },
  { date: 'Feb 26', followers: 14_880, views: 3_000, engagement: 150 },
  { date: 'Mar 01', followers: 14_910, views: 2_900, engagement: 140 },
  { date: 'Mar 04', followers: 14_940, views: 3_100, engagement: 155 },
  { date: 'Mar 07', followers: 14_975, views: 3_200, engagement: 160 },
  { date: 'Mar 10', followers: 15_000, views: 2_500, engagement: 120 },
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

/** Matches AysopMessageAttachments image styling in user bubbles */
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`block w-full rounded-lg border border-white/20 object-contain bg-black/10 ${className}`}
      draggable={false}
    />
  );
}

const ATTACH_DROP_THRESHOLDS = [0.1, 0.24, 0.38, 0.52];

/** Single image drag-and-drop into chat (matches real attachment UI). */
export function ChatDragDropImage({
  progress,
  src,
  alt,
}: {
  progress: number;
  src: string;
  alt: string;
}) {
  const showZone = progress >= 0.08 && progress < 0.18;
  const showImage = progress >= 0.14;
  const dragging = showImage && progress < 0.42;

  if (progress < 0.08) return null;

  return (
    <div className={`relative w-full ${showImage ? 'min-h-[88px]' : ''}`}>
      {showZone ? (
        <div
          className={`flex h-[88px] items-center justify-center rounded-lg border-2 border-dashed border-white/45 bg-white/10 text-[10px] font-medium text-white/80 transition-opacity ${
            showImage ? 'opacity-40' : 'opacity-100'
          }`}
          aria-hidden
        >
          Drop media here
        </div>
      ) : null}
      {showImage ? (
        <div
          className={`${showZone || dragging ? 'absolute inset-x-0 top-0 z-10' : ''} ${
            dragging ? 'funnel-demo-drag-into-chat' : ''
          }`}
        >
          <ChatAttachmentImage src={src} alt={alt} className="max-h-[88px] w-full" />
        </div>
      ) : null}
    </div>
  );
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
  const viewsDomain: [number, number] = [0, views + 2_000];
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
        <div className="h-[88px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 2, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="funnelFollowersArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.soft} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="funnelViewsArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="funnelEngagementArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
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
              <Area
                yAxisId="followers"
                type="monotone"
                dataKey="followers"
                stroke="none"
                fill="url(#funnelFollowersArea)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="followers"
                type="monotone"
                dataKey="followers"
                stroke={BRAND.primary}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="views"
                type="monotone"
                dataKey="viewsCumulative"
                stroke="none"
                fill="url(#funnelViewsArea)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="viewsCumulative"
                stroke="#2563eb"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="engagement"
                type="monotone"
                dataKey="engagementCumulative"
                stroke="none"
                fill="url(#funnelEngagementArea)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="engagement"
                type="monotone"
                dataKey="engagementCumulative"
                stroke="#059669"
                strokeWidth={1.5}
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

export function AdsPerformanceChart({ show }: { show: boolean }) {
  if (!show) return null;
  const bars = [
    { label: 'Google', h: 52, roas: '3.8×', spend: '$2.4K' },
    { label: 'Meta', h: 38, roas: '2.9×', spend: '$5.1K' },
    { label: 'TikTok', h: 60, roas: '4.2×', spend: '$1.8K' },
  ];
  return (
    <div className="mb-2 flex items-end justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-3">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{b.roas}</span>
          <div
            className="w-full max-w-[36px] rounded-t-md bg-gradient-to-t from-[#7C3AED] to-[#A78BFA]"
            style={{ height: `${b.h}px` }}
          />
          <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">{b.label}</span>
          <span className="text-[10px] text-neutral-500">{b.spend}</span>
        </div>
      ))}
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
}: {
  name: string;
  avatar: string;
  colorClass: string;
  text: string;
  highlight?: boolean;
  replied?: boolean;
  replyText?: string;
  show: boolean;
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
          <p className="mt-1 rounded-md border border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-1.5 py-0.5 text-[9px] text-emerald-800 dark:text-emerald-200 leading-snug line-clamp-2">
            <span className="font-semibold">AI reply: </span>
            {replyText}
          </p>
        ) : null}
        {replied ? (
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={10} /> Reply sent
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function LeadsSpreadsheet({ show }: { show: boolean }) {
  if (!show) return null;
  const rows = [
    {
      name: 'Sarah Chen',
      avatar: 'SC',
      color: 'bg-violet-500',
      comment: 'How much for my team?',
      intent: 'High',
      dm: 'Happy to share pricing in DM',
    },
    {
      name: 'Mike Torres',
      avatar: 'MT',
      color: 'bg-sky-500',
      comment: 'Available in Europe?',
      intent: 'Medium',
      dm: 'Yes, we ship worldwide',
    },
  ];
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
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
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
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    row.intent === 'High'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  }`}
                >
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
