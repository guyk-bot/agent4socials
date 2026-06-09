'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export function DemoAvatar({
  label,
  colorClass,
  size = 'sm',
}: {
  label: string;
  colorClass: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'md' ? 'h-7 w-7 text-[9px]' : 'h-5 w-5 text-[7px]';
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
      className={`block w-full object-cover ${className}`}
      draggable={false}
    />
  );
}

export function AnalyticsChart({ show }: { show: boolean }) {
  if (!show) return null;
  const points = '4,52 18,44 32,48 46,28 60,32 74,18 88,22 100,12';
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="grid grid-cols-3 gap-1 border-b border-neutral-100 dark:border-neutral-800 p-1.5">
        {[
          { label: 'Views', value: '124K' },
          { label: 'Engagement', value: '8.2K' },
          { label: 'Followers', value: '+412' },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-1 py-1 text-center"
          >
            <p className="text-[6px] uppercase tracking-wide text-neutral-500">{m.label}</p>
            <p className="text-[10px] font-bold text-neutral-900 dark:text-neutral-100">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="px-2 pt-2 pb-1">
        <svg viewBox="0 0 100 56" className="h-[72px] w-full" aria-hidden>
          <defs>
            <linearGradient id="funnel-demo-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            fill="url(#funnel-demo-chart-fill)"
            stroke="none"
            points={`0,56 ${points} 100,56`}
          />
          <polyline
            fill="none"
            stroke="#7C3AED"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    </div>
  );
}

export function AdsPerformanceChart({ show }: { show: boolean }) {
  if (!show) return null;
  const bars = [
    { label: 'Google', h: 38, roas: '3.8×' },
    { label: 'Meta', h: 28, roas: '2.9×' },
    { label: 'TikTok', h: 44, roas: '4.2×' },
  ];
  return (
    <div className="mb-1.5 flex items-end justify-between gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-950/80 px-2 py-2">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-0.5">
          <span className="text-[7px] font-semibold text-emerald-600 dark:text-emerald-400">{b.roas}</span>
          <div
            className="w-full max-w-[28px] rounded-t bg-gradient-to-t from-[#7C3AED] to-[#A78BFA]"
            style={{ height: `${b.h}px` }}
          />
          <span className="text-[6px] text-neutral-500">{b.label}</span>
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
  show,
}: {
  name: string;
  avatar: string;
  colorClass: string;
  text: string;
  highlight?: boolean;
  replied?: boolean;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <li
      className={`flex items-start gap-1.5 rounded-md border p-1 ${
        highlight
          ? 'border-[#7C3AED]/50 bg-[#7C3AED]/10 dark:bg-[#7C3AED]/15'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
      }`}
    >
      <DemoAvatar label={avatar} colorClass={colorClass} />
      <div className="min-w-0 flex-1">
        <p className="text-[7px] font-semibold text-neutral-800 dark:text-neutral-200">{name}</p>
        <p className="text-[7px] text-neutral-600 dark:text-neutral-400 leading-snug">{text}</p>
        {replied ? (
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[6px] text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={7} /> Reply sent
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
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-[6px] uppercase tracking-wide text-neutral-500">
            <th className="px-1 py-1 font-medium">Lead</th>
            <th className="px-1 py-1 font-medium">Comment</th>
            <th className="px-1 py-1 font-medium">Class</th>
            <th className="px-1 py-1 font-medium">AI DM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <td className="px-1 py-1 align-top">
                <div className="flex items-center gap-1">
                  <DemoAvatar label={row.avatar} colorClass={row.color} />
                  <span className="text-[7px] font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    {row.name}
                  </span>
                </div>
              </td>
              <td className="px-1 py-1 text-[6px] text-neutral-600 dark:text-neutral-400 align-top max-w-[72px]">
                {row.comment}
              </td>
              <td className="px-1 py-1 align-top">
                <span
                  className={`rounded-full px-1 py-px text-[6px] font-semibold ${
                    row.intent === 'High'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  }`}
                >
                  {row.intent}
                </span>
              </td>
              <td className="px-1 py-1 text-[6px] text-[var(--primary)] align-top max-w-[80px] leading-snug">
                {row.dm}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
