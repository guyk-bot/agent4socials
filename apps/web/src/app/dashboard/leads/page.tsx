'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Loader2, Download, Search, Copy, Check, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAuth } from '@/context/AuthContext';
import { readLeadsLocalCache, type LocalLeadsScan } from '@/lib/leads/leads-local-cache';
import { cacheLeadsScanPayload } from '@/lib/leads/leads-sync-client';

type Lead = LocalLeadsScan['leads'][number];

function applySavedScan(
  data: {
    leads: Lead[];
    scanned: number;
    message?: string;
    accountId?: string | null;
    scannedAt?: string | null;
  },
  setters: {
    setLeads: (v: Lead[]) => void;
    setScanned: (v: number) => void;
    setScannedAt: (v: string | null) => void;
    setAccountId: (v: string) => void;
    setHint: (v: string | null) => void;
  }
) {
  setters.setLeads(data.leads ?? []);
  setters.setScanned(data.scanned ?? 0);
  setters.setScannedAt(data.scannedAt ?? null);
  if (data.accountId) setters.setAccountId(data.accountId);
  if (data.message) setters.setHint(data.message);
}

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
  const { loading: authLoading } = useAuth();
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const [accountId, setAccountId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scanned, setScanned] = useState(0);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const setters = useMemo(
    () => ({
      setLeads,
      setScanned,
      setScannedAt,
      setAccountId,
      setHint,
    }),
    []
  );

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    setLoadError(null);

    const local = readLeadsLocalCache();
    if (local && (local.leads.length > 0 || local.scanned > 0)) {
      applySavedScan(local, setters);
      setLoadedOnce(true);
    }

    try {
      const res = await api.get<{
        leads: Lead[];
        scanned: number;
        message?: string;
        accountId?: string | null;
        scannedAt?: string | null;
      }>('/leads/last', { timeout: 30_000 });

      const saved = res.data.leads ?? [];
      const payload = {
        leads: saved,
        scanned: res.data.scanned ?? 0,
        message: res.data.message,
        accountId: res.data.accountId ?? null,
        scannedAt: res.data.scannedAt ?? null,
      };

      if (saved.length > 0 || payload.scanned > 0) {
        applySavedScan(payload, setters);
        cacheLeadsScanPayload({
          accountId: payload.accountId,
          scanned: payload.scanned,
          leads: saved,
          message: payload.message,
          scannedAt: payload.scannedAt ?? undefined,
        });
      } else if (!local) {
        setLeads([]);
        setScanned(0);
      }
      setLoadedOnce(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load your last scan. Try Scan for leads below.';
      if (!local) setLoadError(msg);
    } finally {
      setLoadingSaved(false);
    }
  }, [setters]);

  useEffect(() => {
    if (authLoading) return;
    void loadSaved();
  }, [authLoading, loadSaved]);

  useEffect(() => {
    const onFocus = () => {
      if (!authLoading) void loadSaved();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [authLoading, loadSaved]);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await api.post<{ leads: Lead[]; scanned: number; message?: string; scannedAt?: string }>(
        '/leads/scan',
        accountId === 'all' ? {} : { accountId },
        { timeout: 90_000 }
      );
      const nextLeads = res.data.leads ?? [];
      const nextScanned = res.data.scanned ?? 0;
      const nextScannedAt = res.data.scannedAt ?? new Date().toISOString();
      setLeads(nextLeads);
      setScanned(nextScanned);
      setScannedAt(nextScannedAt);
      setLoadedOnce(true);
      if (res.data.message) setHint(res.data.message);
      cacheLeadsScanPayload({
        accountId: accountId === 'all' ? null : accountId,
        scanned: nextScanned,
        leads: nextLeads,
        message: res.data.message,
        scannedAt: nextScannedAt,
      });
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
    if (!leads.length) return;
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

  const highCount = useMemo(() => leads.filter((l) => l.intent === 'high').length, [leads]);
  const showEmptyCta = loadedOnce && !loadingSaved && !loading && leads.length === 0 && scanned === 0;

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
          disabled={loading || loadingSaved}
          className="flex items-center gap-2 rounded-lg gradient-cta-pro px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? 'Scanning…' : 'Scan for leads'}
        </button>
        {leads.length > 0 ? (
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

      {loadError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {loadError}
        </div>
      ) : null}

      {loadingSaved && !loadedOnce ? (
        <p className="mb-3 text-sm text-[var(--muted)]">Loading your last scan…</p>
      ) : null}

      {loadedOnce && (leads.length > 0 || scanned > 0) ? (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {leads.length > 0
            ? `Found ${leads.length} potential lead${leads.length === 1 ? '' : 's'} (${highCount} high intent) from ${scanned} comments.${
                scannedAt ? ` Last scan: ${new Date(scannedAt).toLocaleString()}.` : ''
              }`
            : hint ?? `No potential leads found in ${scanned} comments.`}
        </p>
      ) : null}

      {leads.length > 0 ? (
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
                          : lead.intent === 'low'
                            ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
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

      {showEmptyCta ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--muted)]">
          Pick an account (or all) and scan. We read comments already loaded from your Inbox and flag
          the ones that look like buying intent. Tip: open Inbox first so the latest comments are cached.
        </div>
      ) : null}
    </div>
  );
}
