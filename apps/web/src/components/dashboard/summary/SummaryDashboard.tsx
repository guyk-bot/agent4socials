'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAppData } from '@/context/AppDataContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';
import { SummaryFiltersBar } from './SummaryFiltersBar';
import { KPICardsGrid } from './KPICardsGrid';
import { PlatformBreakdownCards } from './PlatformBreakdownCards';
import { GrowthChartTabs } from './GrowthChartTabs';
import { ContentActivityPanels } from './ContentActivityPanels';
import { PostPerformanceTable } from './PostPerformanceTable';
import { ContentTypeDistribution } from './ContentTypeDistribution';
import { useSummaryData } from './useSummaryData';

const CONNECT_PLATFORMS = [
  { id: 'FACEBOOK', name: 'Facebook', slug: 'facebook', Icon: FacebookIcon, gradient: 'from-blue-500 to-blue-600', hover: 'hover:from-blue-600 hover:to-blue-700', border: 'border-blue-200', bg: 'bg-blue-50/50' },
  { id: 'INSTAGRAM', name: 'Instagram', slug: 'instagram', Icon: InstagramIcon, gradient: 'from-pink-500 to-purple-600', hover: 'hover:from-pink-600 hover:to-purple-700', border: 'border-pink-200', bg: 'bg-pink-50/50' },
  { id: 'TIKTOK', name: 'TikTok', slug: 'tiktok', Icon: TikTokIcon, gradient: 'from-neutral-800 to-neutral-900', hover: 'hover:from-neutral-900 hover:to-black', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
  { id: 'YOUTUBE', name: 'YouTube', slug: 'youtube', Icon: YoutubeIcon, gradient: 'from-red-500 to-red-600', hover: 'hover:from-red-600 hover:to-red-700', border: 'border-red-200', bg: 'bg-red-50/50' },
  { id: 'TWITTER', name: 'X (Twitter)', slug: 'twitter', Icon: XTwitterIcon, gradient: 'from-sky-400 to-sky-600', hover: 'hover:from-sky-500 hover:to-sky-700', border: 'border-sky-200', bg: 'bg-sky-50/50' },
  { id: 'LINKEDIN', name: 'LinkedIn', slug: 'linkedin', Icon: LinkedinIcon, gradient: 'from-blue-600 to-blue-800', hover: 'hover:from-blue-700 hover:to-blue-900', border: 'border-blue-200', bg: 'bg-blue-50/50' },
];

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
        className="min-h-[60vh] flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-8 sm:p-10 md:p-12 max-w-3xl mx-auto"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)', animation: 'slide-up 0.4s ease-out both' }}
      >
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Connect your accounts</h2>
        <p className="text-slate-500 text-center text-sm mb-8">
          Choose a platform below to connect and see your Summary Dashboard.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
          {CONNECT_PLATFORMS.map(({ id, name, slug, Icon, gradient, hover, border, bg }) => (
            <Link
              key={id}
              href={`/dashboard?connect=${slug}`}
              className={`flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 ${border} ${bg} bg-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradient} ${hover} shadow-md group-hover:shadow-lg transition-shadow`}>
                <Icon size={26} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-800">{name}</span>
              <span className="text-xs text-slate-500 group-hover:text-slate-700">Connect</span>
            </Link>
          ))}
        </div>
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
