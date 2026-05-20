'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Download,
  FileText,
  Loader2,
  Calendar,
  BarChart2,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '@/lib/api';
import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';
import { generateSimpleReport, generateAdvancedReport } from '@/lib/reports/generate-report';

// ─── Types ────────────────────────────────────────────────────────────────────

type SocialAccountLite = { id: string; platform: string; username?: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}
function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const PRESETS = [
  { label: 'Last 7 days', start: () => daysAgo(7), end: today },
  { label: 'Last 30 days', start: () => daysAgo(30), end: today },
  { label: 'Last 90 days', start: () => daysAgo(90), end: today },
  { label: 'Last 6 months', start: () => daysAgo(182), end: today },
  { label: 'Last year', start: () => daysAgo(365), end: today },
  { label: 'Custom', start: () => daysAgo(30), end: today },
];

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
  summary: UnifiedSummaryResponse | null;
  dateRange: { start: string; end: string };
}) {
  if (!summary) return null;
  const { kpi } = summary;
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-5 space-y-4">
      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Preview · {dateRange.start} to {dateRange.end}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricPill value={String(kpi.totalPosts)} label="Posts" growth={kpi.postsGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalImpressions)} label="Impressions" growth={kpi.impressionsGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalEngagement)} label="Engagement" growth={kpi.engagementGrowthPercentage} />
        <MetricPill value={fmt(kpi.totalAudience)} label="Audience" growth={kpi.audienceGrowthPercentage} />
      </div>
      {summary.topPosts[0] && (
        <div className="pt-3 border-t border-orange-200 dark:border-orange-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Top post</p>
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
  const [presetIdx, setPresetIdx] = useState(1); // default: last 30 days
  const [customStart, setCustomStart] = useState(daysAgo(30));
  const [customEnd, setCustomEnd] = useState(today());
  const [loadingKind, setLoadingKind] = useState<'simple' | 'advanced' | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UnifiedSummaryResponse | null>(null);
  const [previewAccounts, setPreviewAccounts] = useState<SocialAccountLite[]>([]);
  const [showFeatures, setShowFeatures] = useState<'simple' | 'advanced' | null>(null);

  const isCustom = presetIdx === PRESETS.length - 1;

  const dateRange = useMemo(() => {
    if (isCustom) return { start: customStart, end: customEnd };
    const p = PRESETS[presetIdx];
    return { start: p.start(), end: p.end() };
  }, [presetIdx, isCustom, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    const accountsRes = await api.get<SocialAccountLite[]>('/social/accounts');
    const accounts = (Array.isArray(accountsRes.data) ? accountsRes.data : []).filter((a) => a?.id);
    const accountIds = accounts.map((a) => a.id).join(',');
    const summaryRes = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
      params: { since: dateRange.start, until: dateRange.end, accountIds },
      timeout: 60_000,
    });
    return { accounts, summary: summaryRes.data };
  }, [dateRange]);

  const handlePreview = async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const { accounts, summary } = await fetchData();
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
      if (!summary) {
        const data = await fetchData();
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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
          <FileText size={20} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">Reports</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Generate styled PDF analytics reports from your connected account data.</p>
        </div>
      </div>

      {/* ── Date range selector ── */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Select Report Period</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setPresetIdx(i); setPreview(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                presetIdx === i
                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-orange-300 hover:text-orange-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isCustom && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">From</label>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => { setCustomStart(e.target.value); setPreview(null); }}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-1.5 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">To</label>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={today()}
                onChange={(e) => { setCustomEnd(e.target.value); setPreview(null); }}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-1.5 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-200 disabled:opacity-50 transition-all"
          >
            {loadingPreview ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
            {loadingPreview ? 'Loading preview...' : 'Preview data'}
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

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Report cards ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Simple report */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1.5 bg-gradient-to-r from-orange-400 to-amber-400" />
          <div className="p-5 flex-1 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">Simple Report</span>
                <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">Analytics Snapshot</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">High-level KPIs, top posts, and platform impressions. One clean page.</p>
              </div>
              <FileText size={20} className="text-neutral-300 dark:text-neutral-600 shrink-0 mt-1" />
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
                  '4 KPI metric cards with growth vs prior period',
                  'Top 3 performing posts with engagement stats',
                  'Impressions & engagement by platform (bar charts)',
                  'Date range of your choice',
                  'Branded PDF with Agent4Socials design',
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

        {/* Advanced report */}
        <div className="rounded-2xl border border-orange-200 dark:border-orange-900 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden flex flex-col ring-1 ring-orange-200 dark:ring-orange-900">
          <div className="h-1.5 bg-gradient-to-r from-orange-500 to-rose-500" />
          <div className="p-5 flex-1 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-white bg-gradient-to-r from-orange-500 to-rose-500 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Sparkles size={10} />
                  Advanced Report
                </span>
                <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">Full Analytics Report</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Multi-page deep-dive with AI insights, growth charts, and content breakdown.</p>
              </div>
              <TrendingUp size={20} className="text-orange-400 shrink-0 mt-1" />
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
                  'Content type breakdown (video vs. image vs. carousel)',
                  'Follower growth pattern visualization',
                  'AI-generated recommendations (3-5 actionable insights)',
                  'Multi-page format (3-5 pages)',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="text-orange-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => handleDownload('advanced')}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 active:from-orange-700 active:to-rose-700 text-white font-semibold text-sm disabled:opacity-50 transition-all shadow-sm"
            >
              {loadingKind === 'advanced' ? (
                <><Loader2 size={16} className="animate-spin" />Generating...</>
              ) : (
                <><Download size={16} />Download Advanced Report</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tips / info banner ── */}
      <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 px-5 py-4 flex gap-3 items-start">
        <Lock size={16} className="text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Your data, your reports</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            All reports are generated locally in your browser from your analytics data. Nothing is sent to a server. The PDF is saved directly to your device.
          </p>
        </div>
      </div>
    </div>
  );
}
