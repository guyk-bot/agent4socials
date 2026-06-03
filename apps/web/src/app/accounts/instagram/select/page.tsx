'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { Instagram, Facebook, Loader2 } from 'lucide-react';
import { useAccountsCache, upsertOptimisticConnectedAccount } from '@/context/AccountsCacheContext';
import {
  PENDING_CONNECT_REDIRECT_KEY,
  parseAccountIdFromDashboardRedirect,
} from '@/lib/brand-account-move';

type PageChoice = {
  pageId: string;
  pageName?: string;
  pagePicture?: string;
  instagramId?: string;
  instagramUsername?: string;
  instagramPicture?: string;
};

function InstagramSelectContent() {
  const searchParams = useSearchParams();
  const pendingId = searchParams.get('pendingId');
  const accountsCache = useAccountsCache();
  const setCachedAccounts = accountsCache?.setCachedAccounts;
  const maybePromptBrandMove = accountsCache?.maybePromptBrandMove;
  const [choices, setChoices] = useState<PageChoice[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) {
      setError('Missing session. Start from the Accounts page.');
      setLoading(false);
      return;
    }
    api
      .get<{ choices?: PageChoice[]; accounts?: PageChoice[] }>(
        `/social/instagram/pending?pendingId=${encodeURIComponent(pendingId)}`
      )
      .then((res) => {
        const list = res.data?.choices ?? res.data?.accounts ?? [];
        setChoices(list);
        if (list.length === 1) setSelectedPageId(list[0].pageId);
      })
      .catch(() => setError('Session expired or invalid. Please connect Instagram again from the Accounts page.'))
      .finally(() => setLoading(false));
  }, [pendingId]);

  const selected = choices.find((c) => c.pageId === selectedPageId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingId || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = selected.instagramId
        ? { pendingId, accountId: selected.instagramId }
        : { pendingId, pageId: selected.pageId };
      const res = await api.post<{ ok: boolean; redirect?: string }>('/social/instagram/connect-account', body);
      if (res.data?.redirect) {
        const redirect = res.data.redirect;
        const accountId = parseAccountIdFromDashboardRedirect(redirect);
        const platform = selected.instagramId ? 'INSTAGRAM' : 'FACEBOOK';
        const username = selected.instagramId
          ? selected.instagramUsername ?? 'Instagram'
          : selected.pageName ?? 'Facebook Page';
        const profilePicture = selected.instagramId
          ? selected.instagramPicture ?? null
          : selected.pagePicture ?? null;
        if (accountId && setCachedAccounts && maybePromptBrandMove) {
          setCachedAccounts((prev) =>
            upsertOptimisticConnectedAccount(prev, {
              id: accountId,
              platform,
              username,
              profilePicture,
            })
          );
          if (maybePromptBrandMove(accountId, { platform, username })) {
            try {
              sessionStorage.setItem(PENDING_CONNECT_REDIRECT_KEY, redirect);
            } catch {
              // ignore
            }
            setSubmitting(false);
            return;
          }
        }
        window.location.href = redirect;
        return;
      }
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to connect. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingVideoOverlay loading={true} />;
  }

  if (error || choices.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 card form-choice-scope">
        <p className="text-neutral-700">{error ?? 'No Facebook Pages found for this login.'}</p>
        <Link href="/dashboard" className="mt-4 inline-block btn-primary">
          Back to Accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 form-choice-scope">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect for this brand</h1>
        <p className="text-neutral-500 mt-1">
          Your Facebook login may manage several Pages. Pick the Page (and Instagram, if linked) you want on this
          brand. Other brands can keep a different Page from the same login.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="space-y-3">
          {choices.map((choice) => (
            <label
              key={choice.pageId}
              className={`form-choice-row flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                selectedPageId === choice.pageId ? 'form-choice-row--selected' : ''
              }`}
            >
              <input
                type="radio"
                name="page"
                value={choice.pageId}
                checked={selectedPageId === choice.pageId}
                onChange={() => setSelectedPageId(choice.pageId)}
                className="sr-only"
              />
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {choice.pagePicture ? (
                  <img src={choice.pagePicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Facebook className="w-5 h-5 text-[#1877F2]" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-medium text-neutral-900 block truncate">
                  {choice.pageName || 'Facebook Page'}
                </span>
                {choice.instagramId ? (
                  <span className="text-sm text-neutral-500 flex items-center gap-1 mt-0.5">
                    <Instagram className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                    @{choice.instagramUsername || choice.instagramId}
                  </span>
                ) : (
                  <span className="text-sm text-neutral-500 block mt-0.5">Facebook Page only (no Instagram linked)</span>
                )}
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Link
            href="/dashboard"
            className="form-choice-cancel flex-1 text-center py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <button type="submit" disabled={!selectedPageId || submitting} className="flex-1 btn-primary py-2 disabled:opacity-50">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Connect this Page'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InstagramSelectPage() {
  return (
    <Suspense fallback={<LoadingVideoOverlay loading={true} />}>
      <InstagramSelectContent />
    </Suspense>
  );
}
