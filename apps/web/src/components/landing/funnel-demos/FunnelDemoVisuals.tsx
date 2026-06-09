'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, Play } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { InstagramIcon, YoutubeIcon } from '@/components/SocialPlatformIcons';

const BRAND = {
  primary: '#7C3AED',
  strong: '#A58DF6',
  soft: '#A78BFA',
  grid: 'rgba(0, 0, 0, 0.018)',
} as const;

const POSTS_CHART_COLOR = { stroke: '#A58DF6', fill: '#F3EDFF' };

const FUNNEL_GROWTH_DATA = [
  { date: 'Feb 18', followers: 8200, views: 820, posts: 0 },
  { date: 'Feb 22', followers: 8310, views: 940, posts: 1 },
  { date: 'Feb 26', followers: 8450, views: 1100, posts: 1 },
  { date: 'Mar 01', followers: 8580, views: 1280, posts: 0 },
  { date: 'Mar 04', followers: 8720, views: 1450, posts: 2 },
  { date: 'Mar 07', followers: 8890, views: 1620, posts: 1 },
  { date: 'Mar 10', followers: 9120, views: 1840, posts: 0 },
];

function formatKpi(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
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

/** Instagram post frame: portrait 3:4, full image visible */
export function InstagramPostPreview({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
      <div className="flex items-center gap-1.5 border-b border-neutral-100 dark:border-neutral-800 px-2 py-1.5">
        <InstagramIcon size={14} />
        <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">yourbrand</span>
        <span className="ml-auto text-[9px] text-neutral-400">Post</span>
      </div>
      <div className="relative aspect-[3/4] w-full bg-neutral-100 dark:bg-neutral-900">
        <DemoImage src={src} alt={alt} objectFit="contain" />
      </div>
    </div>
  );
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
  const chartData = useMemo(() => FUNNEL_GROWTH_DATA, []);

  if (!show) return null;

  const last = chartData[chartData.length - 1];
  const first = chartData[0];
  const followersGain = last.followers - first.followers;
  const totalViews = chartData.reduce((s, d) => s + d.views, 0);

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800 shadow-md overflow-hidden">
      <div className="grid grid-cols-3 gap-1.5 p-2 border-b border-neutral-100 dark:border-neutral-800">
        <MiniKpiCard label="Followers" value={formatKpi(last.followers)} trend={`+${followersGain}`} tint="violet" />
        <MiniKpiCard label="Views" value={formatKpi(totalViews)} tint="blue" />
        <MiniKpiCard label="Engagement" value="8.2K" tint="emerald" />
      </div>
      <div className="px-1 pb-1">
        <p className="px-2 pt-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          Audience growth over time
        </p>
        <div className="h-[88px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="funnelFollowersArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.soft} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="funnelViewsArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
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
                yAxisId="left"
                tick={{ fontSize: 8, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={['dataMin - 200', 'dataMax + 200']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 8, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={24}
                domain={[0, 'dataMax + 400']}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="followers"
                stroke="none"
                fill="url(#funnelFollowersArea)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="followers"
                stroke={BRAND.primary}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="views"
                stroke="none"
                fill="url(#funnelViewsArea)"
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="views"
                stroke="#2563eb"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="right"
                dataKey="posts"
                fill={POSTS_CHART_COLOR.stroke}
                radius={[2, 2, 0, 0]}
                barSize={6}
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
      className={`flex items-start gap-2 rounded-lg border p-2 ${
        highlight
          ? 'border-[#7C3AED]/50 bg-[#7C3AED]/10 dark:bg-[#7C3AED]/15'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
      }`}
    >
      <DemoAvatar label={avatar} colorClass={colorClass} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">{name}</p>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-snug mt-0.5">{text}</p>
        {replied && replyText ? (
          <p className="mt-1.5 rounded-md border border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-2 py-1 text-[10px] text-emerald-800 dark:text-emerald-200 leading-snug">
            <span className="font-semibold">AI reply: </span>
            {replyText}
          </p>
        ) : null}
        {replied ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={11} /> Reply sent
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
