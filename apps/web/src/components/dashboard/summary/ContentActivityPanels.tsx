'use client';

import React from 'react';

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

export function ContentActivityPanels({ dailyPublishing, dailyEngagement }: ContentActivityPanelsProps) {
  const maxPublish = Math.max(...dailyPublishing.map((d) => d.count), 1);
  const maxEngage = Math.max(
    ...dailyEngagement.map((d) => d.likes + d.comments + d.shares + d.clicks),
    1
  );

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Content Activity Overview</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[20px] bg-white p-5 border border-slate-200/60" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <h3 className="text-sm font-medium text-slate-700 mb-4">Publishing Frequency</h3>
          {dailyPublishing.length === 0 ? (
            <p className="text-slate-400 text-sm">No posts in this period</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {dailyPublishing.slice(-14).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t min-h-[4px] flex flex-col-reverse"
                    style={{ height: 96 }}
                  >
                    {Object.entries(d.byPlatform).map(([platform, count]) => (
                      <div
                        key={platform}
                        style={{
                          height: `${(count / maxPublish) * 100}%`,
                          backgroundColor: PLATFORM_COLORS[platform] ?? '#94a3b8',
                        }}
                        className="w-full min-h-[2px]"
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-full">
                    {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[20px] bg-white p-5 border border-slate-200/60" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <h3 className="text-sm font-medium text-slate-700 mb-4">Engagement Activity</h3>
          {dailyEngagement.length === 0 ? (
            <p className="text-slate-400 text-sm">No engagement data</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {dailyEngagement.slice(-14).map((d) => {
                const total = d.likes + d.comments + d.shares + d.clicks;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t flex flex-col-reverse"
                      style={{ height: 96 }}
                    >
                      {d.likes > 0 && (
                        <div
                          style={{ height: `${(d.likes / maxEngage) * 100}%` }}
                          className="w-full bg-pink-300 min-h-[2px]"
                        />
                      )}
                      {d.comments > 0 && (
                        <div
                          style={{ height: `${(d.comments / maxEngage) * 100}%` }}
                          className="w-full bg-indigo-300 min-h-[2px]"
                        />
                      )}
                      {d.shares > 0 && (
                        <div
                          style={{ height: `${(d.shares / maxEngage) * 100}%` }}
                          className="w-full bg-emerald-300 min-h-[2px]"
                        />
                      )}
                      {d.clicks > 0 && (
                        <div
                          style={{ height: `${(d.clicks / maxEngage) * 100}%` }}
                          className="w-full bg-amber-300 min-h-[2px]"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-full">
                      {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
