'use client';

import React, { useMemo, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { UnifiedSummaryResponse } from '@/lib/analytics/unified-metrics-types';

type SocialAccountLite = {
  id: string;
  platform: string;
  username?: string | null;
};

function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const end = formatDateISO(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);
  const start = formatDateISO(startDate);
  return { start, end };
}

export default function ReportsPage() {
  const [loadingKind, setLoadingKind] = useState<'simple' | 'detailed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => defaultRange(), []);

  const fetchReportData = async () => {
    const accountsRes = await api.get<SocialAccountLite[]>('/social/accounts');
    const accounts = (Array.isArray(accountsRes.data) ? accountsRes.data : []).filter((a) => a?.id);
    const accountIds = accounts.map((a) => a.id).join(',');
    const summaryRes = await api.get<UnifiedSummaryResponse>('/analytics/summary', {
      params: { since: range.start, until: range.end, accountIds },
      timeout: 45_000,
    });
    return { accounts, summary: summaryRes.data };
  };

  const downloadReport = async (kind: 'simple' | 'detailed') => {
    setLoadingKind(kind);
    setError(null);
    try {
      const { accounts, summary } = await fetchReportData();
      const [{ jsPDF }] = await Promise.all([import('jspdf')]);
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const maxWidth = pageW - margin * 2;
      let y = margin;

      const addLine = (text: string, opts?: { size?: number; bold?: boolean; gap?: number }) => {
        const size = opts?.size ?? 10;
        const gap = opts?.gap ?? 14;
        pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, maxWidth);
        const needed = lines.length * gap + 4;
        if (y + needed > pageH - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(lines, margin, y);
        y += lines.length * gap + 4;
      };

      const reportTitle = kind === 'simple' ? 'Console Snapshot Report' : 'Console Detailed Report';
      const filePrefix = kind === 'simple' ? 'console-snapshot' : 'console-detailed';

      addLine(reportTitle, { size: 18, bold: true, gap: 20 });
      addLine(`Generated: ${new Date().toLocaleString()}`);
      addLine(`Date range: ${range.start} to ${range.end}`);
      addLine(`Connected accounts: ${accounts.length}`);
      addLine(
        `Accounts: ${accounts.map((a) => `${a.platform}${a.username ? ` (@${String(a.username).replace(/^@/, '')})` : ''}`).join(', ') || 'None'}`
      );

      addLine('Overall KPI', { size: 13, bold: true, gap: 16 });
      addLine(`Audience: ${summary.kpi.totalAudience}`);
      addLine(`Impressions: ${summary.kpi.totalImpressions}`);
      addLine(`Engagement: ${summary.kpi.totalEngagement}`);
      addLine(`Posts: ${summary.kpi.totalPosts}`);
      addLine(`Audience growth: ${summary.kpi.audienceGrowthPercentage.toFixed(2)}%`);
      addLine(`Impressions growth: ${summary.kpi.impressionsGrowthPercentage.toFixed(2)}%`);
      addLine(`Engagement growth: ${summary.kpi.engagementGrowthPercentage.toFixed(2)}%`);

      if (kind === 'detailed') {
        addLine('Top Posts', { size: 13, bold: true, gap: 16 });
        if (summary.topPosts.length === 0) {
          addLine('No top posts in this range.');
        } else {
          summary.topPosts.slice(0, 20).forEach((p, i) => {
            addLine(
              `${i + 1}. [${p.platform}] engagement=${p.totalEngagement}, impressions=${p.impressions}, likes=${p.likes}, comments=${p.comments}, shares=${p.shares}`
            );
            if (p.caption) addLine(`Caption: ${p.caption.slice(0, 180)}`);
            if (p.url) addLine(`URL: ${p.url}`);
          });
        }

        addLine('Recent History Entries', { size: 13, bold: true, gap: 16 });
        if (summary.history.length === 0) {
          addLine('No history entries in this range.');
        } else {
          summary.history.slice(0, 40).forEach((h, i) => {
            addLine(
              `${i + 1}. [${h.platform}] ${h.postedAt} | engagement=${h.totalEngagement}, impressions=${h.impressions}, likes=${h.likes}, comments=${h.comments}, shares=${h.shares}`
            );
            if (h.caption) addLine(`Caption: ${h.caption.slice(0, 160)}`);
            if (h.url) addLine(`URL: ${h.url}`);
          });
        }
      }

      pdf.save(`${filePrefix}-${range.start}-to-${range.end}.pdf`);
    } catch {
      setError('Could not generate report right now. Please try again.');
    } finally {
      setLoadingKind(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="card rounded-2xl border border-neutral-200 shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Generate downloadable PDF reports from Console data across all connected accounts.
        </p>
        <p className="mt-1 text-xs text-neutral-500">Current report range: {range.start} to {range.end}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => downloadReport('simple')}
          disabled={loadingKind !== null}
          className="card rounded-2xl border border-neutral-200 bg-white text-left hover:bg-neutral-50 disabled:opacity-60"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 inline-flex items-center gap-2">
                <FileText size={18} />
                Simplified report
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                High-level summary with key KPI metrics for all connected accounts.
              </p>
            </div>
            {loadingKind === 'simple' ? <Loader2 size={18} className="animate-spin text-neutral-500" /> : <Download size={18} className="text-neutral-500" />}
          </div>
        </button>

        <button
          type="button"
          onClick={() => downloadReport('detailed')}
          disabled={loadingKind !== null}
          className="card rounded-2xl border border-neutral-200 bg-white text-left hover:bg-neutral-50 disabled:opacity-60"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 inline-flex items-center gap-2">
                <FileText size={18} />
                Detailed report
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Full KPI summary with top posts and recent history details per platform.
              </p>
            </div>
            {loadingKind === 'detailed' ? <Loader2 size={18} className="animate-spin text-neutral-500" /> : <Download size={18} className="text-neutral-500" />}
          </div>
        </button>
      </div>
    </div>
  );
}

