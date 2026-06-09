'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, FileText, Play, Users } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { YoutubeIcon } from '@/components/SocialPlatformIcons';

import { BRAND_LIME_DOT, FUNNEL_ANALYTICS_KPIS } from './funnel-demo-assets';

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
      loading="lazy"
      className={`block w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
      draggable={false}
    />
  );
}

/** Portrait frame: 3:4, fills card without crowding text below. */
const USER_ATTACH_FRAME =
  'ml-auto aspect-[3/4] w-full max-w-[86%] max-h-[156px]';

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
        loading="lazy"
        className="block h-full w-full object-cover object-center pointer-events-none select-none"
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
    <div className="funnel-inner-card overflow-hidden">
      <div className="relative aspect-video w-full bg-black">
        <DemoImage src={src} alt={alt} objectFit="contain" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-14 items-center justify-center rounded-xl bg-red-600/95 shadow-lg">
            <Play size={22} className="ml-0.5 fill-white text-white" />
          </span>
        </div>
      </div>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A1A24]">
          <YoutubeIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-white line-clamp-2">
            {title ?? 'Top performing video'}
          </p>
          <p className="text-[10px] text-[#888780]">2.1M views · 184K likes</p>
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
      className={`funnel-inner-card flex items-start gap-1.5 p-1.5 ${
        highlight ? 'border-[#7C3AED]/40' : ''
      }`}
    >
      <DemoAvatar label={avatar} colorClass={colorClass} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-white truncate">{name}</p>
        <p className="text-[10px] text-[#888780] leading-snug line-clamp-2">{text}</p>
        {replied && replyText ? (
          <p className="mt-1 rounded-md border border-emerald-800/50 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] text-emerald-300 leading-snug line-clamp-2">
            <span className="font-semibold">AI reply: </span>
            {replyText}
          </p>
        ) : null}
        {replied ? (
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-400">
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
    <div className="funnel-inner-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#1E1E2A] text-[9px] uppercase tracking-wide text-[#888780]">
            <th className="px-1.5 py-1.5 font-semibold">Lead</th>
            <th className="px-1.5 py-1.5 font-semibold">Comment</th>
            <th className="px-1.5 py-1.5 font-semibold">Class</th>
            <th className="px-1.5 py-1.5 font-semibold">AI DM</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.name} className="border-b border-[#1E1E2A] last:border-0 funnel-demo-message-in">
              <td className="px-1.5 py-1.5 align-top">
                <div className="flex items-center gap-1.5">
                  <DemoAvatar label={row.avatar} colorClass={row.color} size="md" />
                  <span className="text-[10px] font-semibold text-white whitespace-nowrap">{row.name}</span>
                </div>
              </td>
              <td className="px-1.5 py-1.5 text-[10px] text-[#888780] align-top max-w-[80px] leading-snug">
                {row.comment}
              </td>
              <td className="px-1.5 py-1.5 align-top">
                <span className="rounded-full border border-[#2A2A38] bg-[#1A1A24] px-1.5 py-0.5 text-[9px] font-semibold text-[#AAFF45]">
                  {row.intent}
                </span>
              </td>
              <td className="px-1.5 py-1.5 text-[10px] text-[#A78BFA] align-top max-w-[90px] leading-snug font-medium">
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
    <div className="funnel-inner-card overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[#1E1E2A] px-2 py-1.5">
        <Users size={12} className="text-[#7C3AED]" />
        <span className="text-[10px] font-semibold text-white">Team activity</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#1E1E2A] text-[9px] uppercase tracking-wide text-[#888780]">
            <th className="px-1.5 py-1 font-semibold">Member</th>
            <th className="px-1.5 py-1 font-semibold">Role</th>
            <th className="px-1.5 py-1 font-semibold text-right">Last active</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.name} className="border-b border-[#1E1E2A] last:border-0">
              <td className="px-1.5 py-1.5 align-middle">
                <div className="flex items-center gap-1.5">
                  <DemoAvatar label={row.avatar} colorClass={row.color} size="md" />
                  <span className="text-[10px] font-semibold text-white whitespace-nowrap">{row.name}</span>
                </div>
              </td>
              <td className="px-1.5 py-1.5 align-middle">
                <span className="rounded-full border border-[#2A2A38] bg-[#1A1A24] px-1.5 py-0.5 text-[9px] font-semibold text-[#888780]">
                  {row.role}
                </span>
              </td>
              <td
                className={`px-1.5 py-1.5 text-right text-[9px] font-medium tabular-nums ${
                  row.activity === 'Active now' ? 'text-emerald-400' : 'text-[#888780]'
                }`}
              >
                {row.activity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(progress > 0.58 || progress >= 1) && (
        <p className="flex items-center gap-1 border-t border-[#1E1E2A] px-2 py-1.5 text-[10px] font-semibold text-emerald-400">
          <CheckCircle2 size={11} /> Invite sent to maya@studio.com
        </p>
      )}
    </div>
  );
}

const TEAM_PERF_ROWS = [
  { name: 'Maya Rodriguez', posts: 8, replies: 124, rate: '4.2%' },
  { name: 'Alex Kim', posts: 6, replies: 89, rate: '3.8%' },
  { name: 'Guy K.', posts: 5, replies: 67, rate: '3.1%' },
] as const;

export function TeamPerformancePanel({ show, progress = 1 }: { show: boolean; progress?: number }) {
  if (!show) return null;

  return (
    <div className="funnel-inner-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#1E1E2A] text-[9px] uppercase tracking-wide text-[#888780]">
            <th className="px-1.5 py-1.5 font-semibold">Member</th>
            <th className="px-1.5 py-1.5 font-semibold text-right">Posts</th>
            <th className="px-1.5 py-1.5 font-semibold text-right">Replies</th>
            <th className="px-1.5 py-1.5 font-semibold text-right">Eng. rate</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_PERF_ROWS.map((row, i) => (
            <tr
              key={row.name}
              className={`border-b border-[#1E1E2A] last:border-0 ${
                progress > 0.2 + i * 0.15 || progress >= 1 ? 'opacity-100' : 'opacity-30'
              }`}
            >
              <td className="px-1.5 py-1.5 text-[10px] font-semibold text-white">{row.name}</td>
              <td className="px-1.5 py-1.5 text-right text-[10px] text-white tabular-nums">{row.posts}</td>
              <td className="px-1.5 py-1.5 text-right text-[10px] text-white tabular-nums">{row.replies}</td>
              <td className="px-1.5 py-1.5 text-right text-[10px] text-[#AAFF45] tabular-nums">{row.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsReportPreview({ show, progress = 1 }: { show: boolean; progress?: number }) {
  if (!show) return null;
  const showDownload = progress > 0.55 || progress >= 1;

  return (
    <div className="space-y-2">
      <div className="funnel-inner-card p-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[#888780]">
          MAR 1 TO MAR 31 · 8 PLATFORMS
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {[
            { label: 'Impressions', value: '1.2M' },
            { label: 'Engagement', value: '48.3K' },
            { label: 'Posts', value: '124' },
            { label: 'Audience', value: '89.4K' },
          ].map((m) => (
            <div key={m.label} className="rounded-md border border-[#1E1E2A] bg-[#1A1A24] px-1.5 py-1">
              <p className="text-[11px] font-bold tabular-nums text-white">{m.value}</p>
              <p className="text-[8px] text-[#888780]">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { title: 'Simplified report PDF', sub: '4 pages' },
          { title: 'Detailed report PDF', sub: '12 pages' },
        ].map((card, i) => (
          <div
            key={card.title}
            className={`funnel-inner-card p-2 ${
              progress > 0.32 + i * 0.12 || progress >= 1 ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <FileText size={14} className="text-[#7C3AED] mb-1" />
            <p className="text-[10px] font-semibold text-white leading-snug">{card.title}</p>
            <p className="text-[8px] text-[#888780]">{card.sub}</p>
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
