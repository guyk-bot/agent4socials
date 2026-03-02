'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAppData } from '@/context/AppDataContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
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
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const [dateRange, setDateRange] = useState({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END });
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // On first mount, trigger a background sync for all accounts so post counts are fresh
  useEffect(() => {
    if (!cachedAccounts || cachedAccounts.length === 0) return;
    let cancelled = false;
    setSyncing(true);
    const accounts = cachedAccounts as { id: string; platform: string }[];
    Promise.all(
      accounts.map((acc) =>
        api.get<{ posts?: { id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }[] }>(`/social/accounts/${acc.id}/posts`, { params: { sync: 1 } })
          .then((r) => { if (!cancelled && r.data?.posts) appData?.setPostsForAccount(acc.id, r.data.posts); })
          .catch(() => {})
      )
    ).finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  // Only run once when accounts are first available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedAccounts.length > 0 ? 'loaded' : 'empty']);

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
      {/* AI Insight Summary */}
      <div className="rounded-[20px] bg-white/90 border border-slate-200/60 p-4 flex items-start gap-3" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <span className="text-2xl shrink-0" aria-hidden>🧠</span>
        <p className="text-sm text-slate-700">
          {syncing
            ? 'Syncing your latest posts and metrics from all connected accounts...'
            : summary.kpis.totalReach > 0
              ? 'Your reach is driven by ' + summary.platforms.length + ' connected account' + (summary.platforms.length !== 1 ? 's' : '') + '.'
              : 'Your reach is building up. Connect more accounts and publish content to see growth.'}
        </p>
      </div>
      {/* Platform-level hints (e.g. YouTube Analytics API not enabled) */}
      {summary.platforms.some((p) => p.insightsHint) && (
        <div className="space-y-2">
          {summary.platforms.filter((p) => p.insightsHint).map((p) => (
            <div key={p.id} className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <strong>{p.platform}:</strong> {p.insightsHint}
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
