'use client';

import React, { useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  TooltipProps,
} from 'recharts';

type DailyPublishing = { date: string; count: number; byPlatform: Record<string, number> };
type DailyEngagement = { date: string; likes: number; comments: number; shares: number; clicks: number };

type ContentActivityPanelsProps = {
  dailyPublishing: DailyPublishing[];
  dailyEngagement: DailyEngagement[];
};

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: '#E1306C',
  FACEBOOK: '#1877F2',
  TIKTOK: '#010101',
  YOUTUBE: '#FF0000',
  TWITTER: '#1D9BF0',
  LINKEDIN: '#0A66C2',
};

const ACCENT = '#6366f1';

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}
function formatDateFull(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

export function ContentActivityPanels({ dailyPublishing, dailyEngagement }: ContentActivityPanelsProps) {
  const maxPublish = Math.max(...dailyPublishing.map((d) => d.count), 1);
  const allPlatforms = Array.from(
    new Set(dailyPublishing.flatMap((d) => Object.keys(d.byPlatform)))
  );

  type SafeTooltipProps = { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string };

  const PublishTooltip = useCallback(
    (rawProps: TooltipProps<number, string>) => {
      const { active, payload, label } = rawProps as unknown as SafeTooltipProps;
      if (!active || !payload?.length || !label) return null;
      const row = dailyPublishing.find((d) => d.date === label);
      return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl text-sm">
          <p className="text-xs font-semibold text-slate-500 mb-2">{formatDateFull(label)}</p>
          {row && Object.entries(row.byPlatform).map(([platform, count]) => (
            <div key={platform} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLATFORM_COLORS[platform] ?? '#94a3b8' }} />
              <span className="text-slate-700">{platform.charAt(0) + platform.slice(1).toLowerCase()}: <strong>{count}</strong></span>
            </div>
          ))}
          <div className="mt-1 pt-1 border-t border-slate-100 text-slate-500">Total: <strong>{row?.count ?? 0}</strong></div>
        </div>
      );
    },
    [dailyPublishing]
  );

  const EngageTooltip = useCallback(
    (rawProps: TooltipProps<number, string>) => {
      const { active, payload, label } = rawProps as unknown as SafeTooltipProps;
      if (!active || !payload?.length || !label) return null;
      return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl text-sm">
          <p className="text-xs font-semibold text-slate-500 mb-2">{formatDateFull(label)}</p>
          {payload.map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
              <span className="text-slate-700">{p.name}: <strong>{p.value}</strong></span>
            </div>
          ))}
        </div>
      );
    },
    []
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Publishing Activity */}
      <section
        className="rounded-[20px] bg-white p-5 border border-slate-200/60"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
      >
        <h2 className="text-base font-semibold text-slate-900 mb-1">Publishing Activity</h2>
        <p className="text-xs text-slate-500 mb-4">Posts published per day</p>
        {dailyPublishing.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">No publishing data yet</div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPublishing} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, maxPublish + 1]} />
                <Tooltip content={<PublishTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dailyPublishing.map((entry) => {
                    const topPlatform = Object.entries(entry.byPlatform).sort((a, b) => b[1] - a[1])[0]?.[0];
                    return <Cell key={entry.date} fill={PLATFORM_COLORS[topPlatform ?? ''] ?? ACCENT} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {allPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {allPlatforms.map((p) => (
              <span key={p} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: PLATFORM_COLORS[p] ?? '#94a3b8' }} />
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Engagement Activity */}
      <section
        className="rounded-[20px] bg-white p-5 border border-slate-200/60"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
      >
        <h2 className="text-base font-semibold text-slate-900 mb-1">Engagement Activity</h2>
        <p className="text-xs text-slate-500 mb-4">Likes and comments over time</p>
        {dailyEngagement.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">No engagement data yet</div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyEngagement} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<EngageTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="likes" name="Likes" fill="#E1306C" radius={[3, 3, 0, 0]} stackId="engage" />
                <Bar dataKey="comments" name="Comments" fill="#6366f1" radius={[3, 3, 0, 0]} stackId="engage" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-600"><span className="w-2 h-2 rounded-sm bg-[#E1306C]" />Likes</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600"><span className="w-2 h-2 rounded-sm bg-[#6366f1]" />Comments</span>
        </div>
      </section>
    </div>
  );
}
