'use client';

import React from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';

type Artifact = Extract<IzopArtifact, { type: 'leads_scan_prompt' }>;

export function IzopLeadsScanPromptCard({
  artifact,
  onScanLeads,
  scanning,
}: {
  artifact: Artifact;
  onScanLeads?: () => void;
  scanning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
        <Users size={15} className="text-[var(--primary)]" />
        Lead scan
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Scan cached post comments for people who look interested in your product, with suggested outreach messages.
        {artifact.lastScannedAt
          ? ` Last scan: ${new Date(artifact.lastScannedAt).toLocaleString()}.`
          : ' No saved scan yet.'}
      </p>
      <button
        type="button"
        onClick={() => onScanLeads?.()}
        disabled={!onScanLeads || scanning}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {scanning ? 'Scanning…' : 'Scan for leads'}
      </button>
    </div>
  );
}
