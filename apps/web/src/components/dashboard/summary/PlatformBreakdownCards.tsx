'use client';

import React from 'react';
import type { SummaryPlatform } from './types';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={24} />,
  FACEBOOK: <FacebookIcon size={24} />,
  TIKTOK: <TikTokIcon size={24} />,
  YOUTUBE: <YoutubeIcon size={24} />,
  TWITTER: <XTwitterIcon size={24} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={24} />,
};

const PLATFORM_STYLES: Record<string, { gradient: string; bg: string }> = {
  INSTAGRAM: { gradient: 'from-pink-400/20 to-purple-500/20', bg: 'bg-pink-50/80' },
  FACEBOOK: { gradient: 'from-blue-400/20 to-blue-600/20', bg: 'bg-blue-50/80' },
  TIKTOK: { gradient: 'from-slate-700/20 to-pink-500/20', bg: 'bg-slate-100/80' },
  YOUTUBE: { gradient: 'from-red-500/20 to-red-700/20', bg: 'bg-red-50/80' },
  TWITTER: { gradient: 'from-slate-400/20 to-slate-600/20', bg: 'bg-slate-100/80' },
  LINKEDIN: { gradient: 'from-blue-600/20 to-blue-800/20', bg: 'bg-blue-50/80' },
};

function MiniTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 80;
  const h = 32;
  const path = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="opacity-70">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type PlatformBreakdownCardsProps = {
  platforms: SummaryPlatform[];
};

const PLATFORM_ORDER = ['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'TWITTER', 'LINKEDIN'];

export function PlatformBreakdownCards({ platforms }: PlatformBreakdownCardsProps) {
  if (platforms.length === 0) return null;

  const sorted = [...platforms].sort((a, b) => {
    const ai = PLATFORM_ORDER.indexOf(a.platform);
    const bi = PLATFORM_ORDER.indexOf(b.platform);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Platform Breakdown</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 scrollbar-thin">
        {sorted.map((p) => {
          const style = PLATFORM_STYLES[p.platform] ?? { gradient: 'from-slate-400/20 to-slate-600/20', bg: 'bg-slate-100/80' };
          const icon = PLATFORM_ICON[p.platform];
          const trendValues = p.timeSeries.slice(-7).map((d) => d.value);
          if (trendValues.length === 0 && p.reach > 0) trendValues.push(p.reach);
          return (
            <div
              key={p.id}
              className={`flex-shrink-0 w-[220px] rounded-[20px] p-5 ${style.bg} border border-slate-200/60 relative overflow-hidden`}
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-50 pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3 text-slate-700">
                  {icon}
                  <span className="font-semibold text-slate-900">{p.platform}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-slate-500">{p.platform === 'YOUTUBE' ? 'Subscribers' : 'Followers'}</p>
                    <p className="font-semibold text-slate-900">{p.followers.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Reach</p>
                    <p className="font-semibold text-slate-900">{p.reach.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Posts</p>
                    <p className="font-semibold text-slate-900">{p.posts}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Engagement</p>
                    <p className="font-semibold text-slate-900">{p.engagement.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end text-slate-500">
                  <MiniTrend values={trendValues} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
