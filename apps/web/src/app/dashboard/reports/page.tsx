'use client';

import React, { useState, useCallback } from 'react';
import {
  Download,
  FileText,
  Loader2,
  BarChart2,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import api from '@/lib/api';
import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import { AnalyticsDateRangePicker } from '@/components/analytics/AnalyticsDateRangePicker';
import { AnalyticsUpgradeCard } from '@/components/analytics/AnalyticsUpgradeCard';
import { generateSimpleReport, generateAdvancedReport } from '@/lib/reports/generate-report';

// ─── Types ────────────────────────────────────────────────────────────────────

type SocialAccountLite = { id: string; platform: string; username?: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}
function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const PLATFORM_ICON: Record<string, string> = {
  INSTAGRAM: '📸',
  FACEBOOK: '📘',
  TWITTER: '🐦',
  TIKTOK: '🎵',
  YOUTUBE: '▶️',
  LINKEDIN: '💼',
  PINTEREST: '📌',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricPill({ value, label, growth }: { value: string; label: string; growth?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{value}</span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      {growth !== undefined && (
        <span className={`text-xs font-semibold ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {pct(growth)}
        </span>
      )}
    </div>
  );
}

function PreviewCard({
  summary,
  dateRange,
}: {
  summary: UnifiedSummaryResponse;
  dateRange: { start: string; end: string };
}) {
  const { kpi } = summary;
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-4 space-y-3">
      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
        Data preview: {dateRange.start} to {dateRange.end}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricPill value={String(kpi.totalPosts)} label="Posts" growth={kpi.postsGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalImpressions)} label="Impressions" growth={kpi.impressionsGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalEngagement)} label="Engagement" growth={kpi.engagementGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalAudience)} label="Audience" growth={kpi.audienceGrowthPercentage} />
      </div>
      {summary.topPosts[0] && (
        <div className="pt-3 border-t border-orange-200 dark:border-orange-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">Top post</p>
          <p className="text-sm text-neutral-800 dark:text-neutral-100 font-medium truncate">
            {summary.topPosts[0].platform} · {summary.topPosts[0].caption?.slice(0, 80) || 'No caption'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {fmt(summary.topPosts[0].totalEngagement)} engagements · {fmt(summary.topPosts[0].impressions)} impressions
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => getDefaultAnalyticsDateRange());
  const [loadingKind, setLoadingKind] = useState<'simple' | 'advanced' | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UnifiedSummaryResponse | null>(null);
  const [previewAccounts, setPreviewAccounts] = useState<SocialAccountLite[]>([]);
  const [showFeatures, setShowFeatures] = useState<'simple' | 'advanced' | null>(null);

  const fetchData = useCallback(async (range: { start: string; end: string }) => {
    const accountsRes = await api.get<SocialAccountLite[]>('/social/accounts');
    const accounts = (Array.isArray(accountsRes.data) ? accountsRes.data : []).filter((a) => a?.id);
    const accountIds = accounts.map((a) => a.id).join(',');
    const summaryRes = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
      params: { since: range.start, until: range.end, accountIds },
      timeout: 60_000,
    });
    return { accounts, summary: summaryRes.data };
  }, []);

  const handleRangeChange = useCallback((range: { start: string; end: string }) => {
    setDateRange(range);
    setPreview(null);
  }, []);

  const handlePreview = async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const { accounts, summary } = await fetchData(dateRange);
      setPreview(summary);
      setPreviewAccounts(accounts);
    } catch {
      setError('Could not load analytics data. Please try again in a moment.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (kind: 'simple' | 'advanced') => {
    setLoadingKind(kind);
    setError(null);
    try {
      let summary = preview;
      let accounts = previewAccounts;
      if (!summary || !accounts.length) {
        const data = await fetchData(dateRange);
        summary = data.summary;
        accounts = data.accounts;
        setPreview(summary);
        setPreviewAccounts(accounts);
      }
      if (kind === 'simple') {
        await generateSimpleReport(summary, accounts, dateRange);
      } else {
        await generateAdvancedReport(summary, accounts, dateRange);
      }
    } catch {
      setError('Could not generate the report. Please try again.');
    } finally {
      setLoadingKind(null);
    }
  };

  const busy = loadingKind !== null || loadingPreview;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Reports</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Download styled PDF analytics reports from your connected accounts.
            </p>
          </div>
        </div>

        {/* Date range picker — same component as analytics pages */}
        <AnalyticsDateRangePicker
          start={dateRange.start}
          end={dateRange.end}
          onChange={handleRangeChange}
        />
      </div>

      {/* ── Upgrade card ── */}
      <AnalyticsUpgradeCard
        title="Advanced Report available on Pro"
        description="Upgrade to Pro ($19.99/year) to unlock the multi-page Advanced Report with platform breakdown tables, audience growth charts, content type analysis, and AI-powered recommendations."
        ctaLabel="Upgrade to Pro"
        onCta={() => window.open('/dashboard/account', '_self')}
      />

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Preview button + preview card ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-200 disabled:opacity-50 transition-all"
          >
            {loadingPreview ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
            {loadingPreview ? 'Loading...' : 'Preview data for selected period'}
          </button>

          {previewAccounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previewAccounts.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full">
                  <span>{PLATFORM_ICON[a.platform] ?? '🔗'}</span>
                  {a.username ? `@${String(a.username).replace(/^@/, '')}` : a.platform}
                </span>
              ))}
            </div>
          )}
        </div>

        {preview && <PreviewCard summary={preview} dateRange={dateRange} />}
      </div>

      {/* ── Report cards ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Simple report */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-gradient-to-r from-orange-400 to-amber-400" />
          <div className="p-5 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">Free</span>
                <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">Simple Report</h2>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  High-level KPI snapshot, top posts, and platform charts. One clean page.
                </p>
              </div>
              <FileText size={18} className="text-neutral-300 dark:text-neutral-600 shrink-0 mt-1" />
            </div>

            <button
              type="button"
              onClick={() => setShowFeatures(showFeatures === 'simple' ? null : 'simple')}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              {showFeatures === 'simple' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              What&apos;s included
            </button>

            {showFeatures === 'simple' && (
              <ul className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                {[
                  '4 KPI cards with period-on-period growth',
                  'Top 3 posts with engagement stats',
                  'Impressions and engagement by platform',
                  'Branded PDF, orange and white design',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => handleDownload('simple')}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm disabled:opacity-50 transition-all shadow-sm"
            >
              {loadingKind === 'simple' ? (
                <><Loader2 size={16} className="animate-spin" />Generating...</>
              ) : (
                <><Download size={16} />Download Simple Report</>
              )}
            </button>
          </div>
        </div>

        {/* Advanced report — Pro */}
        <div className="rounded-2xl border border-orange-200 dark:border-orange-900 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden flex flex-col opacity-80">
          <div className="h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="p-5 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-white gradient-cta-pro px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Sparkles size={10} />
                  Pro
                </span>
                <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">Advanced Report</h2>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  Multi-page deep-dive with platform tables, growth charts, and AI recommendations.
                </p>
              </div>
              <TrendingUp size={18} className="text-orange-400 shrink-0 mt-1" />
            </div>

            <button
              type="button"
              onClick={() => setShowFeatures(showFeatures === 'advanced' ? null : 'advanced')}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              {showFeatures === 'advanced' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              What&apos;s included
            </button>

            {showFeatures === 'advanced' && (
              <ul className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                {[
                  'Everything in Simple Report',
                  'Per-platform metrics table (views, likes, comments, shares)',
                  'Audience growth trend line chart',
                  'Content type breakdown: video vs. image vs. carousel',
                  'AI-generated recommendations (3 to 5 insights)',
                  'Multi-page format (3 to 5 pages)',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="text-orange-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 pb-5 space-y-2">
            <button
              type="button"
              onClick={() => handleDownload('advanced')}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl gradient-cta-pro text-white font-semibold text-sm disabled:opacity-50 transition-all shadow-sm hover:opacity-90"
            >
              {loadingKind === 'advanced' ? (
                <><Loader2 size={16} className="animate-spin" />Generating...</>
              ) : (
                <><Download size={16} />Download Advanced Report</>
              )}
            </button>
            <p className="text-center text-xs text-neutral-400">
              <Lock size={10} className="inline mr-1" />
              Available on Pro plan · $19.99/year
            </p>
          </div>
        </div>
      </div>

      {/* ── Info banner ── */}
      <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
        Reports are generated locally in your browser from your analytics data and saved directly to your device.
      </p>
    </div>
  );
}
