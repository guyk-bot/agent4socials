'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, ExternalLink, Loader2, Search, Users } from 'lucide-react';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { cacheLeadsScanPayload, fetchAndCacheLastLeadsScan } from '@/lib/leads/leads-sync-client';

type Artifact = Extract<AysopArtifact, { type: 'leads' }>;

function csvCell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

function buildCsv(leads: Artifact['leads']): string {
  const header = ['Name', 'Profile URL', 'Platform', 'Intent', 'Comment', 'Suggested outreach'];
  const rows = leads.map((l) =>
    [l.authorName, l.profileUrl, l.platform, l.intent, l.comment, l.outreach].map(csvCell).join(',')
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

export function AysopLeadsCard({
  artifact,
  onScanLeads,
  scanning,
}: {
  artifact: Artifact;
  onScanLeads?: () => void;
  scanning?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<number | null>(null);
  const highCount = artifact.leads.filter((l) => l.intent === 'high').length;

  useEffect(() => {
    if (artifact.fullLeads?.length) {
      cacheLeadsScanPayload({
        accountId: artifact.accountId,
        scanned: artifact.scanned,
        leads: artifact.fullLeads,
        scannedAt: artifact.scannedAt ?? undefined,
      });
      return;
    }
    if (artifact.leads.length > 0 || artifact.scanned > 0) {
      void fetchAndCacheLastLeadsScan();
    }
  }, [artifact.accountId, artifact.fullLeads, artifact.leads.length, artifact.scanned, artifact.scannedAt]);

  const openLeadsPage = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (artifact.fullLeads?.length) {
        cacheLeadsScanPayload({
          accountId: artifact.accountId,
          scanned: artifact.scanned,
          leads: artifact.fullLeads,
          scannedAt: artifact.scannedAt ?? undefined,
        });
      } else {
        await fetchAndCacheLastLeadsScan();
      }
      router.push(artifact.href);
    },
    [artifact.accountId, artifact.fullLeads, artifact.href, artifact.scanned, artifact.scannedAt, router]
  );

  const download = useCallback(() => {
    const blob = new Blob([buildCsv(artifact.leads)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [artifact.leads]);

  const copy = useCallback(async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((p) => (p === i ? null : p)), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
          <Users size={15} className="text-[var(--primary)]" />
          {artifact.leads.length} potential lead{artifact.leads.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-1.5">
          {onScanLeads ? (
            <button
              type="button"
              onClick={() => onScanLeads()}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Rescan
            </button>
          ) : null}
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        Scanned {artifact.scanned} comment{artifact.scanned === 1 ? '' : 's'} · {highCount} high intent
      </p>

      <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto">
        {artifact.leads.map((l, i) => (
          <li
            key={i}
            className="rounded-lg border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                  {l.authorName}
                </span>
                {l.profileUrl ? (
                  <a
                    href={l.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    <ExternalLink size={12} />
                  </a>
                ) : null}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  l.intent === 'high'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                    : l.intent === 'low'
                      ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                }`}
              >
                {l.intent}
              </span>
            </div>
            <p className="mt-1 text-xs italic text-neutral-500 dark:text-neutral-400 line-clamp-2">
              &ldquo;{l.comment}&rdquo;
            </p>
            <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{l.outreach}</p>
            <button
              type="button"
              onClick={() => void copy(l.outreach, i)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline"
            >
              {copied === i ? <Check size={11} /> : <Copy size={11} />}
              {copied === i ? 'Copied' : 'Copy outreach'}
            </button>
          </li>
        ))}
      </ul>

      <Link
        href={artifact.href}
        onClick={(e) => void openLeadsPage(e)}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Open Leads page <ExternalLink size={14} />
      </Link>
    </div>
  );
}
