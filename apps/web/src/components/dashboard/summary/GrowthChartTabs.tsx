'use client';

import React, { useState } from 'react';
import { GrowthLineChart } from '@/components/charts/GrowthLineChart';

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

export function GrowthChartTabs({ timeSeries, compareEnabled }: GrowthChartTabsProps) {
  const [activeTab, setActiveTab] = useState('reach');
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[1];

  return (
    <section
      className="rounded-[20px] bg-white p-5 border border-slate-200/60"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
    >
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Growth Visualization</h2>
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-[320px] -mx-2">
        <GrowthLineChart data={timeSeries} metric={tab.key} height={320} />
      </div>
      {compareEnabled && (
        <p className="text-xs text-slate-500 mt-2">Previous period shown as dashed line (coming soon)</p>
      )}
    </section>
  );
}
