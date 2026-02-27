'use client';

import React, { useState, useCallback } from 'react';
import { useAppData } from '@/context/AppDataContext';
import { SummaryFiltersBar } from './SummaryFiltersBar';
import { KPICardsGrid } from './KPICardsGrid';
import { PlatformBreakdownCards } from './PlatformBreakdownCards';
import { GrowthChartTabs } from './GrowthChartTabs';
import { ContentActivityPanels } from './ContentActivityPanels';
import { PostPerformanceTable } from './PostPerformanceTable';
import { ContentTypeDistribution } from './ContentTypeDistribution';
import { useSummaryData } from './useSummaryData';

const DEFAULT_DATE_END = new Date().toISOString().slice(0, 10);
const DEFAULT_DATE_START = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function SummaryDashboard() {
  const appData = useAppData();
  const [dateRange, setDateRange] = useState({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END });
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [competitorOpen, setCompetitorOpen] = useState(false);

  const summary = useSummaryData(dateRange, selectedPlatforms);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    if (format === 'csv' && summary) {
      const headers = ['Metric', 'Value'];
      const rows = [
        ['Total Audience', summary.kpis.totalAudience],
        ['Total Reach', summary.kpis.totalReach],
        ['Engagement Rate %', summary.kpis.engagementRate.toFixed(2)],
        ['Content Published', summary.kpis.contentPublished],
      ];
      const csv = [headers, ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `summary-${dateRange.start}-${dateRange.end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      window.alert('PDF export coming soon.');
    }
  }, [summary, dateRange]);

  const handleRefresh = useCallback(() => {
    appData?.invalidate();
    window.location.reload();
  }, [appData]);

  if (!summary) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center rounded-[20px] bg-white border border-slate-200/60 p-12" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <p className="text-slate-600 text-center max-w-md">
          Connect at least one social account from the sidebar to see your Summary Dashboard.
        </p>
        <a href="/dashboard" className="mt-6 px-5 py-2.5 rounded-xl bg-[#22FF88] text-slate-900 font-medium hover:opacity-90 transition-opacity">
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Optional AI Insight Summary */}
      <div className="rounded-[20px] bg-white/90 border border-slate-200/60 p-4 flex items-start gap-3" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <span className="text-2xl shrink-0" aria-hidden>🧠</span>
        <p className="text-sm text-slate-700">
          Your reach is {summary.kpis.totalReach > 0 ? 'driven by ' + summary.platforms.length + ' connected account' + (summary.platforms.length !== 1 ? 's' : '') + '.' : 'building up. Connect more accounts and publish content to see growth.'}
        </p>
      </div>

      <SummaryFiltersBar
        dateStart={dateRange.start}
        dateEnd={dateRange.end}
        onDateChange={(start, end) => setDateRange({ start, end })}
        selectedPlatforms={selectedPlatforms}
        onPlatformsChange={setSelectedPlatforms}
        compareEnabled={compareEnabled}
        onCompareToggle={setCompareEnabled}
        onExport={handleExport}
        onRefresh={handleRefresh}
      />

      <KPICardsGrid kpis={summary.kpis} />
      <PlatformBreakdownCards platforms={summary.platforms} />
      <GrowthChartTabs timeSeries={summary.timeSeries} compareEnabled={compareEnabled} />
      <ContentActivityPanels dailyPublishing={summary.dailyPublishing} dailyEngagement={summary.dailyEngagement} />
      <PostPerformanceTable posts={summary.posts} />
      <ContentTypeDistribution data={summary.contentTypeDistribution} />

      {/* Optional: Competitor Comparison (collapsible) */}
      <section className="rounded-[20px] bg-white border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <button
          type="button"
          onClick={() => setCompetitorOpen((o) => !o)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50/50 transition-colors"
        >
          <h2 className="text-lg font-semibold text-slate-900">Competitor Comparison</h2>
          <span className="text-slate-500 text-sm">{competitorOpen ? 'Collapse' : 'Expand'}</span>
        </button>
        {competitorOpen && (
          <div className="px-5 pb-5 pt-0 border-t border-slate-100">
            <p className="text-slate-500 text-sm">Add competitors to compare follower growth, engagement, and content frequency. Coming soon.</p>
          </div>
        )}
      </section>
    </div>
  );
}
