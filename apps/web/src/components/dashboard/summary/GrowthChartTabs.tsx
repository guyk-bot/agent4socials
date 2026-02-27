'use client';

import React, { useState } from 'react';

type TimeSeriesPoint = { date: string; audience?: number; reach?: number; engagement?: number; posts?: number };

type GrowthChartTabsProps = {
  timeSeries: TimeSeriesPoint[];
  compareEnabled: boolean;
};

const TABS = [
  { id: 'audience', label: 'Audience Growth', key: 'audience' as const },
  { id: 'reach', label: 'Reach Over Time', key: 'reach' as const },
  { id: 'engagement', label: 'Engagement', key: 'engagement' as const },
  { id: 'publishing', label: 'Publishing Activity', key: 'posts' as const },
];

function LineChart({
  data,
  dataKey,
  color,
  height = 420,
}: {
  data: TimeSeriesPoint[];
  dataKey: 'audience' | 'reach' | 'engagement' | 'posts';
  color: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height }}>
        No data for this period
      </div>
    );
  }
  const values = data.map((d) => d[dataKey] ?? 0).filter((v) => typeof v === 'number');
  const max = Math.max(...values, 1);
  const w = 800;
  const h = height - 48;
  const points = data.map((d, i) => {
    const v = (d[dataKey] as number) ?? 0;
    const x = (i / (data.length - 1 || 1)) * (w - 40) + 20;
    const y = 20 + (h - 40) - (v / max) * (h - 40);
    return { x, y };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const lastX = points[points.length - 1]?.x ?? w - 20;
  const areaPath = `${linePath} L ${lastX} ${20 + h - 40} L 20 ${20 + h - 40} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h + 48}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${dataKey}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${dataKey})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GrowthChartTabs({ timeSeries, compareEnabled }: GrowthChartTabsProps) {
  const [activeTab, setActiveTab] = useState('reach');
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[1];
  const colors: Record<string, string> = {
    audience: '#22FF88',
    reach: '#6366f1',
    engagement: '#c084fc',
    posts: '#38bdf8',
  };

  return (
    <section className="rounded-[20px] bg-white p-5 border border-slate-200/60" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Growth Visualization</h2>
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-[420px] -mx-2">
        <LineChart data={timeSeries} dataKey={tab.key} color={colors[tab.key]} height={420} />
      </div>
      {compareEnabled && (
        <p className="text-xs text-slate-500 mt-2">Previous period shown as dashed line (coming soon)</p>
      )}
    </section>
  );
}
