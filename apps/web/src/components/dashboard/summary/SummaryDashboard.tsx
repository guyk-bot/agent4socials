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

function SectionFade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      style={{
        animation: `slide-up 0.5s ease-out ${delay}ms both`,
      }}
    >
      {children}
    </div>
  );
}

export function SummaryDashboard() {
  const appData = useAppData();
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const [dateRange, setDateRange] = useState({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END });
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // On first mount, trigger a background sync for all accounts
  useEffect(() => {
    if (!cachedAccounts || cachedAccounts.length === 0) return;
    let cancelled = false;
    setSyncing(true);
    setSyncProgress(0);
    const accounts = cachedAccounts as { id: string; platform: string }[];
    const total = accounts.length * 2;
    let done = 0;

    const tick = () => {
      done++;
      if (!cancelled) setSyncProgress(Math.round((done / total) * 100));
    };

    const postPromises = accounts.map((acc) =>
      api.get<{ posts?: unknown[] }>(`/social/accounts/${acc.id}/posts`, { params: { sync: 1 } })
        .then((r) => {
          tick();
          if (!cancelled && r.data?.posts) appData?.setPostsForAccount(acc.id, r.data.posts as Parameters<typeof appData.setPostsForAccount>[1]);
        })
        .catch(() => tick())
    );
    const insightsPromises = accounts.map((acc) =>
      api.get(`/social/accounts/${acc.id}/insights`, { params: { since: dateRange.start, until: dateRange.end } })
        .then((r) => {
          tick();
          if (!cancelled && r.data) appData?.setInsightsForAccount(acc.id, r.data);
        })
        .catch(() => tick())
    );
    Promise.all([...postPromises, ...insightsPromises]).finally(() => {
      if (!cancelled) { setSyncing(false); setSyncProgress(100); }
    });
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
    }
    // PDF: silently ignore
  }, [summary, dateRange]);

  const handleRefresh = useCallback(() => {
    appData?.invalidate();
    window.location.reload();
  }, [appData]);

  if (!summary) {
    return (
      <div
        className="min-h-[60vh] flex flex-col items-center justify-center rounded-[20px] bg-white border border-slate-200/60 p-12"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)', animation: 'slide-up 0.4s ease-out both' }}
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-5 shadow-lg">
          <span className="text-2xl">📊</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">No data yet</h2>
        <p className="text-slate-500 text-center max-w-sm text-sm">
          Connect at least one social account from the sidebar to see your Summary Dashboard.
        </p>
        <a
          href="/dashboard"
          className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Sync progress bar */}
      {syncing && (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 flex items-center gap-3 shadow-md">
          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Syncing data from all connected accounts…</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>
          <span className="text-white/70 text-xs tabular-nums shrink-0">{syncProgress}%</span>
        </div>
      )}

      {/* Platform-level hints */}
      {summary.platforms.some((p) => p.insightsHint) && (
        <SectionFade delay={0}>
          <div className="space-y-2">
            {summary.platforms.filter((p) => p.insightsHint).map((p) => (
              <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>{p.platform}:</strong> {p.insightsHint}
              </div>
            ))}
          </div>
        </SectionFade>
      )}

      <SectionFade delay={0}>
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
      </SectionFade>

      <SectionFade delay={60}>
        <KPICardsGrid kpis={summary.kpis} />
      </SectionFade>

      <SectionFade delay={120}>
        <PlatformBreakdownCards platforms={summary.platforms} />
      </SectionFade>

      <SectionFade delay={180}>
        <GrowthChartTabs timeSeries={summary.timeSeries} compareEnabled={compareEnabled} />
      </SectionFade>

      <SectionFade delay={240}>
        <ContentActivityPanels
          dailyPublishing={summary.dailyPublishing}
          dailyEngagement={summary.dailyEngagement}
        />
      </SectionFade>

      <SectionFade delay={300}>
        <PostPerformanceTable posts={summary.posts} />
      </SectionFade>

      {summary.contentTypeDistribution.length > 0 && (
        <SectionFade delay={360}>
          <ContentTypeDistribution data={summary.contentTypeDistribution} />
        </SectionFade>
      )}
    </div>
  );
}
