'use client';

import React from 'react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { SummaryPlatform } from './types';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={20} />,
  FACEBOOK: <FacebookIcon size={20} />,
  TIKTOK: <TikTokIcon size={20} />,
  YOUTUBE: <YoutubeIcon size={20} />,
  TWITTER: <XTwitterIcon size={20} className="text-sky-500" />,
  LINKEDIN: <LinkedinIcon size={20} />,
};

const PLATFORM_HEX: Record<string, string> = {
  INSTAGRAM: '#E1306C',
  FACEBOOK: '#1877F2',
  TIKTOK: '#010101',
  YOUTUBE: '#FF0000',
  TWITTER: '#1D9BF0',
  LINKEDIN: '#0A66C2',
};

const PLATFORM_BG: Record<string, string> = {
  INSTAGRAM: 'bg-pink-50',
  FACEBOOK: 'bg-blue-50',
  TIKTOK: 'bg-neutral-100',
  YOUTUBE: 'bg-red-50',
  TWITTER: 'bg-sky-50',
  LINKEDIN: 'bg-blue-50',
};

const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube', TWITTER: 'X (Twitter)', LINKEDIN: 'LinkedIn',
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="h-10 w-20" />;
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 80, height: 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={(props) => {
              const { active, payload } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }> };
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-neutral-200 rounded-lg px-2 py-1 text-xs shadow-lg font-medium">
                  {(payload[0]?.value ?? 0).toLocaleString()}
                </div>
              );
            }}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
            fill={`url(#spark-${color.replace('#', '')})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PLATFORM_ORDER = ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'TWITTER', 'LINKEDIN'];

export function PlatformBreakdownCards({ platforms }: { platforms: SummaryPlatform[] }) {
  if (platforms.length === 0) return null;

  const sorted = [...platforms].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.platform);
    const bi = PLATFORM_ORDER.indexOf(b.platform);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Platform Breakdown</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((p, idx) => {
          const color = PLATFORM_HEX[p.platform] ?? '#5ff6fd';
          const bg = PLATFORM_BG[p.platform] ?? 'bg-slate-100';
          const trendValues = p.timeSeries.slice(-14).map((d) => d.value);
          if (trendValues.length < 2 && p.reach > 0) {
            trendValues.push(0, p.reach);
          }
          return (
            <div
              key={p.id}
              className={`min-w-0 rounded-2xl p-4 ${bg} border border-slate-200/60 relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
              style={{
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                animation: `slide-up 0.4s ease-out ${idx * 60}ms both`,
              }}
            >
              {/* Colored top bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ backgroundColor: color }} />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  {PLATFORM_ICON[p.platform]}
                  <span className="text-sm font-semibold text-slate-800">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                </div>
                {p.username && (
                  <span className="text-xs text-slate-400 truncate max-w-[80px]">@{p.username}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm mb-3">
                <div>
                  <p className="text-xs text-slate-500">{p.platform === 'YOUTUBE' ? 'Subscribers' : 'Followers'}</p>
                  <p className="font-bold text-slate-900 tabular-nums" style={{ color }}>{p.followers.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Reach</p>
                  <p className="font-bold text-slate-900 tabular-nums">{p.reach.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Posts</p>
                  <p className="font-semibold text-slate-900">{p.posts}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Engagement</p>
                  <p className="font-semibold text-slate-900">{p.engagement.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex justify-end" style={{ color }}>
                <Sparkline values={trendValues} color={color} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
