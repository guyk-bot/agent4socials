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

  // On first mount, trigger a background sync for all accounts (posts + insights) so Summary has full data
  useEffect(() => {
    if (!cachedAccounts || cachedAccounts.length === 0) return;
    let cancelled = false;
    setSyncing(true);
    const accounts = cachedAccounts as { id: string; platform: string }[];
    const range = { start: DEFAULT_DATE_START, end: DEFAULT_DATE_END };
    const postPromises = accounts.map((acc) =>
      api.get<{ posts?: unknown[] }>(`/social/accounts/${acc.id}/posts`, { params: { sync: 1 } })
        .then((r) => { if (!cancelled && r.data?.posts) appData?.setPostsForAccount(acc.id, r.data.posts); })
        .catch(() => {})
    );
    const insightsPromises = accounts.map((acc) =>
      api.get(`/social/accounts/${acc.id}/insights`, { params: { since: range.start, until: range.end } })
        .then((r) => { if (!cancelled && r.data) appData?.setInsightsForAccount(acc.id, r.data); })
        .catch(() => {})
    );
    Promise.all([...postPromises, ...insightsPromises]).finally(() => { if (!cancelled) setSyncing(false); });
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
      // PDF export coming soon - silently ignore
    }
  }, [summary, dateRange]);

  const handleRefresh = useCallback(() => {
    appData?.invalidate();
    window.location.reload();
  }, [appData]);

  if (!summary) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center rounded-[20px] bg-white border border-slate-200/60 p-12" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <div className="text-4xl mb-4">📊</div>
        <p className="text-slate-700 font-semibold text-lg">No data yet</p>
        <p className="text-slate-500 text-center max-w-sm mt-2">
          Connect a social account from the left sidebar to start tracking your analytics.
        </p>
        <a href="/dashboard" className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          Connect an account
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12" style={{ animation: 'fade-in 0.4s ease-out both' }}>
      {/* Syncing banner or AI insight */}
      {syncing ? (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/60 p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
          <p className="text-sm text-indigo-800 font-medium">Syncing your latest posts and metrics from all connected accounts…</p>
        </div>
      ) : summary.kpis.totalReach > 0 || summary.kpis.totalAudience > 0 ? (
        <div className="rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/50 border border-slate-200/60 p-4 flex items-start gap-3">
          <span className="text-xl shrink-0" aria-hidden>🧠</span>
          <p className="text-sm text-slate-700">
            <strong>Overview:</strong>{' '}
            {summary.kpis.totalAudience.toLocaleString()} total followers across{' '}
            {summary.platforms.length} platform{summary.platforms.length !== 1 ? 's' : ''},{' '}
            {summary.kpis.totalReach.toLocaleString()} total reach, and{' '}
            {summary.kpis.contentPublished} posts published.
          </p>
        </div>
      ) : null}

      {/* Platform-level hints (e.g. YouTube Analytics API not enabled) */}
      {summary.platforms.some((p) => p.insightsHint) && (
        <div className="space-y-2">
          {summary.platforms.filter((p) => p.insightsHint).map((p) => (
            <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <p><strong>{p.platform}:</strong> {p.insightsHint}</p>
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
