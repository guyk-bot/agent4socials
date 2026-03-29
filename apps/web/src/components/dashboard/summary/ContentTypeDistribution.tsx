'use client';

import React from 'react';
import type { SummaryContentTypeBreakdown } from './types';

type ContentTypeDistributionProps = {
  data: SummaryContentTypeBreakdown[];
};

export function ContentTypeDistribution({ data }: ContentTypeDistributionProps) {
  if (data.length === 0) return null;

  return (
    <section className="rounded-[20px] bg-white p-5 border border-slate-200/60" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Content Type Distribution</h2>
      <div className="space-y-5">
        {data.map((platform) => {
          const total = platform.segments.reduce((s, seg) => s + seg.value, 0);
          if (total === 0) return null;
          return (
            <div key={platform.platform}>
              <p className="text-sm font-medium text-slate-700 mb-2">{platform.platform}</p>
              <div className="flex rounded-xl overflow-hidden h-8 bg-slate-100">
                {platform.segments.map((seg) => (
                  <div
                    key={seg.label}
                    className="flex items-center justify-center min-w-[40px] transition-all"
                    style={{
                      width: `${(seg.value / total) * 100}%`,
                      backgroundColor: seg.color,
                      color: seg.value / total > 0.15 ? '#fff' : '#64748b',
                    }}
                    title={`${seg.label}: ${seg.value}`}
                  >
                    {seg.value / total > 0.12 && <span className="text-xs font-medium truncate px-1">{seg.label}</span>}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                {platform.segments.map((seg) => (
                  <span key={seg.label}>
                    {seg.label}: {seg.value} ({((seg.value / total) * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
