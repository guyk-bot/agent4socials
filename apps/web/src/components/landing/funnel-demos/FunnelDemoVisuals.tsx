'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Play } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
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
  { date: 'Feb 18', followers: 14_705, views: 2_187, engagement: 98 },
  { date: 'Feb 22', followers: 14_738, views: 2_643, engagement: 121 },
  { date: 'Feb 26', followers: 14_761, views: 2_904, engagement: 134 },
  { date: 'Mar 01', followers: 14_789, views: 2_712, engagement: 118 },
  { date: 'Mar 04', followers: 14_812, views: 3_156, engagement: 147 },
  { date: 'Mar 07', followers: 14_831, views: 3_389, engagement: 156 },
  { date: 'Mar 10', followers: 14_847, views: 1_441, engagement: 163 },
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

/** Portrait frame: 3:4, compact, full frame visible in one shot. */
const USER_ATTACH_FRAME =
  'mx-auto aspect-[3/4] w-full max-w-[72%] max-h-[132px]';

/** User-sent media: thinner faded border; object-contain shows the full clip. */
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
      className={`overflow-hidden rounded-lg border border-white/10 bg-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${USER_ATTACH_FRAME} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-full w-full object-contain object-center pointer-events-none select-none"
        draggable={false}
      />
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
  const dragging = showImage && progress < 0.42;

  if (progress < 0.08) return null;

  if (showImage) {
    return (
      <div className={dragging ? 'funnel-demo-drag-into-chat' : undefined}>
        <ChatAttachmentImage src={src} alt={alt} />
      </div>
    );
  }

  if (showZone) {
    return (
      <div
        className={`flex ${USER_ATTACH_FRAME} items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-[11px] font-medium text-white/70`}
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
                dataKey="viewsCumulative"
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
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

const ADS_PLATFORM_STATS = [
  {
    label: 'Google',
    h: 54,
    roas: '3.84×',
    spend: '$2,437',
    cpa: '$12.40',
    conv: 196,
    colorFrom: '#1a73e8',
    colorTo: '#8ab4f8',
  },
  {
    label: 'Meta',
    h: 36,
    roas: '2.91×',
    spend: '$5,084',
    cpa: '$18.20',
    conv: 279,
    colorFrom: '#0866ff',
    colorTo: '#6ea8fe',
  },
  {
    label: 'TikTok',
    h: 62,
    roas: '4.17×',
    spend: '$1,792',
    cpa: '$9.85',
    conv: 182,
    colorFrom: '#ee1d52',
    colorTo: '#ff6b8a',
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
      <div className="flex items-end justify-between gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2.5 py-2.5 min-h-[108px]">
        {ADS_PLATFORM_STATS.map((b) => (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-0.5">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{b.roas}</span>
            <div
              className="w-full max-w-[34px] rounded-t-md"
              style={{
                height: `${b.h}px`,
                background: `linear-gradient(to top, ${b.colorFrom}, ${b.colorTo})`,
              }}
            />
            <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">{b.label}</span>
            <span className="text-[9px] text-neutral-500 tabular-nums">{b.spend}</span>
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
