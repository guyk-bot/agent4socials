'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { Instagram, Loader2 } from 'lucide-react';
import { useAccountsCache, upsertOptimisticConnectedAccount } from '@/context/AccountsCacheContext';
import {
  PENDING_CONNECT_REDIRECT_KEY,
  parseAccountIdFromDashboardRedirect,
} from '@/lib/brand-account-move';

type InstagramChoice = {
  pageId: string;
  pageName?: string;
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
  const [choices, setChoices] = useState<InstagramChoice[]>([]);
  const [selectedInstagramId, setSelectedInstagramId] = useState<string | null>(null);
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
      .get<{ instagramChoices?: InstagramChoice[]; choices?: InstagramChoice[] }>(
        `/social/instagram/pending?pendingId=${encodeURIComponent(pendingId)}`
      )
      .then((res) => {
        const raw = res.data?.instagramChoices ?? res.data?.choices ?? [];
        const list = raw.filter((c) => Boolean(c.instagramId)) as InstagramChoice[];
        setChoices(list);
        if (list.length === 1 && list[0].instagramId) setSelectedInstagramId(list[0].instagramId);
      })
      .catch(() => setError('Session expired or invalid. Please connect Instagram again from the Accounts page.'))
      .finally(() => setLoading(false));
  }, [pendingId]);

  const selected = choices.find((c) => c.instagramId === selectedInstagramId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingId || !selected?.instagramId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; redirect?: string }>('/social/instagram/connect-account', {
        pendingId,
        accountId: selected.instagramId,
      });
      if (res.data?.redirect) {
        const redirect = res.data.redirect;
        const accountId = parseAccountIdFromDashboardRedirect(redirect);
        const username = selected.instagramUsername ?? 'Instagram';
        if (accountId && setCachedAccounts && maybePromptBrandMove) {
          setCachedAccounts((prev) =>
            upsertOptimisticConnectedAccount(prev, {
              id: accountId,
              platform: 'INSTAGRAM',
              username,
              profilePicture: selected.instagramPicture ?? null,
            })
          );
          if (maybePromptBrandMove(accountId, { platform: 'INSTAGRAM', username })) {
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
        <p className="text-neutral-700">
          {error ??
            'No Instagram Professional accounts were found for this Facebook login. In Meta, link Instagram to the Page you want, then try again. To connect a Facebook Page without Instagram, use Facebook connect from Accounts.'}
        </p>
        <Link href="/dashboard" className="mt-4 inline-block btn-primary">
          Back to Accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 form-choice-scope">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect an Instagram account</h1>
        <p className="text-neutral-500 mt-1">
          Choose which Instagram account to add to this brand. We only list accounts linked to your Facebook login
          (required by Meta for publishing and analytics).
        </p>
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="space-y-3">
          {choices.map((choice) => (
            <label
              key={choice.instagramId}
              className={`form-choice-row flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                selectedInstagramId === choice.instagramId ? 'form-choice-row--selected' : ''
              }`}
            >
              <input
                type="radio"
                name="instagram"
                value={choice.instagramId}
                checked={selectedInstagramId === choice.instagramId}
                onChange={() => setSelectedInstagramId(choice.instagramId!)}
                className="sr-only"
              />
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {choice.instagramPicture ? (
                  <img src={choice.instagramPicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Instagram className="w-5 h-5 text-pink-600" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-medium text-neutral-900 block truncate">
                  @{choice.instagramUsername || choice.instagramId}
                </span>
                {choice.pageName && choice.pageName.toLowerCase() !== (choice.instagramUsername ?? '').toLowerCase() ? (
                  <span className="text-sm text-neutral-500 block mt-0.5 truncate">
                    Linked to Facebook Page: {choice.pageName}
                  </span>
                ) : null}
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
          <button
            type="submit"
            disabled={!selectedInstagramId || submitting}
            className="flex-1 btn-primary py-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Connect this account'}
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
