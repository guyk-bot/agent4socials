'use client';

import React, { useCallback, useState } from 'react';
import api from '@/lib/api';
import { ChevronDown, Loader2 } from 'lucide-react';

type Props = {
  accountId: string;
};

/**
 * Expandable raw JSON from GET /api/social/accounts/[id]/linkedin-community-api-debug (LinkedIn CM–related probes).
 */
export function LinkedInCommunityApiJsonPanel({ accountId }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPayload = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/social/accounts/${accountId}/linkedin-community-api-debug`);
      setPayload(res.data);
      setLoaded(true);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as Error)?.message ??
        'Could not load LinkedIn API debug data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accountId, loaded, loading]);

  return (
    <div
      className="rounded-[20px] border p-4 sm:p-5 space-y-3"
      style={{
        borderColor: 'rgba(139, 92, 246, 0.25)',
        background: 'linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.98))',
        boxShadow: '0 4px 22px rgba(15,23,42,0.06)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void fetchPayload();
        }}
        className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-1 py-0.5 -mx-1 hover:bg-orange-50/60 transition-colors"
      >
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">LinkedIn Community Management API</h3>
          <p className="text-xs text-neutral-600 mt-0.5 max-w-[720px]">
            Raw JSON from Community Management–related LinkedIn endpoints (UGC posts, network sizes, org ACLs, share
            statistics, member post analytics, follower demographics, profile follower count, social metadata, comments).
            Open to load; data stays in your browser.
          </p>
        </div>
        {loading ? (
          <Loader2 className="w-5 h-5 shrink-0 text-orange-600 animate-spin" aria-hidden />
        ) : (
          <ChevronDown
            className={`w-5 h-5 shrink-0 text-orange-700 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        )}
      </button>

      {error ? (
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      ) : null}

      {open && loaded && payload != null ? (
        <pre
          className="text-[11px] leading-relaxed overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-950 text-emerald-100/95 p-3 sm:p-4 font-mono"
          tabIndex={0}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}

      {open && !loaded && !loading && !error ? (
        <p className="text-xs text-neutral-500">Click the header again if loading did not start.</p>
      ) : null}
    </div>
  );
}
