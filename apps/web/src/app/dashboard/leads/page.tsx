'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Users, Loader2, Download, Search, Copy, Check, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';

type Lead = {
  commentId: string;
  accountId: string;
  platform: string;
  authorName: string;
  profileUrl: string | null;
  authorPictureUrl: string | null;
  comment: string;
  postPreview: string;
  postUrl: string | null;
  createdAt: string;
  intent: 'high' | 'medium';
  reason: string;
  outreach: string;
};

function csvCell(value: string | null | undefined): string {
  const v = (value ?? '').replace(/"/g, '""');
  return `"${v}"`;
}

function buildCsv(leads: Lead[]): string {
  const header = ['Name', 'Profile URL', 'Platform', 'Intent', 'Comment', 'Post', 'Suggested outreach'];
  const rows = leads.map((l) =>
    [l.authorName, l.profileUrl, l.platform, l.intent, l.comment, l.postPreview, l.outreach]
      .map(csvCell)
      .join(',')
  );
  return [header.map(csvCell).join(','), ...rows].join('\r\n');
}

export default function LeadsPage() {
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const [accountId, setAccountId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await api.post<{ leads: Lead[]; scanned: number; message?: string }>(
        '/leads/scan',
        accountId === 'all' ? {} : { accountId },
        { timeout: 90_000 }
      );
      setLeads(res.data.leads ?? []);
      setScanned(res.data.scanned ?? 0);
      if (res.data.message) setHint(res.data.message);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not scan for leads. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const downloadCsv = useCallback(() => {
    if (!leads || leads.length === 0) return;
    const blob = new Blob([buildCsv(leads)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [leads]);

  const copyOutreach = useCallback(async (lead: Lead) => {
    try {
      await navigator.clipboard.writeText(lead.outreach);
      setCopiedId(lead.commentId);
      setTimeout(() => setCopiedId((prev) => (prev === lead.commentId ? null : prev)), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  const highCount = useMemo(() => (leads ?? []).filter((l) => l.intent === 'high').length, [leads]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Leads</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Scan your post comments for people who look like potential customers, with a suggested
            outreach message and a downloadable spreadsheet.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
        >
          <option value="all">All accounts</option>
          {(cachedAccounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {(a.username || a.platform) ?? a.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg gradient-cta-pro px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? 'Scanning…' : 'Scan for leads'}
        </button>
        {leads && leads.length > 0 ? (
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
          >
            <Download size={16} /> Download CSV
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {leads !== null ? (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {leads.length > 0
            ? `Found ${leads.length} potential lead${leads.length === 1 ? '' : 's'} (${highCount} high intent) from ${scanned} comments.`
            : hint ?? `No potential leads found in ${scanned} comments.`}
        </p>
      ) : null}

      {leads && leads.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--bg-hover)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Intent</th>
                <th className="px-4 py-3 font-semibold">Comment</th>
                <th className="px-4 py-3 font-semibold">Suggested outreach</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.commentId} className="border-t border-[var(--border)] align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {lead.authorPictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lead.authorPictureUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)] text-xs font-bold text-[var(--muted)]">
                          {lead.authorName.replace(/^@/, '').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[var(--foreground)]">{lead.authorName}</div>
                        {lead.profileUrl ? (
                          <a
                            href={lead.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                          >
                            {lead.platform.toLowerCase()} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">{lead.platform.toLowerCase()}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        lead.intent === 'high'
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      {lead.intent}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-[var(--foreground)]">{lead.comment}</p>
                    {lead.reason ? (
                      <p className="mt-1 text-xs italic text-[var(--muted)]">{lead.reason}</p>
                    ) : null}
                  </td>
                  <td className="max-w-sm px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-[var(--foreground)]">{lead.outreach}</p>
                    <button
                      type="button"
                      onClick={() => void copyOutreach(lead)}
                      className="mt-2 flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                    >
                      {copiedId === lead.commentId ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === lead.commentId ? 'Copied' : 'Copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {leads === null && !loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--muted)]">
          Pick an account (or all) and scan. We read comments already loaded from your Inbox and flag
          the ones that look like buying intent. Tip: open Inbox first so the latest comments are cached.
        </div>
      ) : null}
    </div>
  );
}
