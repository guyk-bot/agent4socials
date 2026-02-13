'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Instagram, Loader2 } from 'lucide-react';

type AccountItem = { id: string; username?: string; profilePicture?: string };

function InstagramSelectContent() {
  const searchParams = useSearchParams();
  const pendingId = searchParams.get('pendingId');
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      .get<{ accounts: AccountItem[] }>(`/social/instagram/pending?pendingId=${encodeURIComponent(pendingId)}`)
      .then((res) => {
        const list = res.data?.accounts ?? [];
        setAccounts(list);
        if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => setError('Session expired or invalid. Please connect Instagram again from the Accounts page.'))
      .finally(() => setLoading(false));
  }, [pendingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingId || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; redirect?: string }>('/social/instagram/connect-account', {
        pendingId,
        accountId: selectedId,
      });
      if (res.data?.redirect) {
        window.location.href = res.data.redirect;
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Failed to connect. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
        <p className="text-neutral-600">Loading your Instagram accounts…</p>
      </div>
    );
  }

  if (error || accounts.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 card">
        <p className="text-neutral-700">{error ?? 'No Instagram accounts found.'}</p>
        <Link href="/dashboard" className="mt-4 inline-block btn-primary">
          Back to Accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect an Instagram account</h1>
        <p className="text-neutral-500 mt-1">Choose which Instagram account you want to connect to Agent4Socials.</p>
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="space-y-3">
          {accounts.map((account) => (
            <label
              key={account.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === account.id ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <input
                type="radio"
                name="account"
                value={account.id}
                checked={selectedId === account.id}
                onChange={() => setSelectedId(account.id)}
                className="sr-only"
              />
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {account.profilePicture ? (
                  <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Instagram className="w-5 h-5 text-pink-600" />
                )}
              </div>
              <span className="font-medium text-neutral-900">@{account.username || account.id}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Link href="/dashboard" className="flex-1 text-center py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50">
            Cancel
          </Link>
          <button type="submit" disabled={!selectedId || submitting} className="flex-1 btn-primary py-2 disabled:opacity-50">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Connect this account'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InstagramSelectPage() {
  return (
    <Suspense fallback={
      <div className="max-w-md mx-auto mt-16 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
        <p className="text-neutral-600">Loading…</p>
      </div>
    }>
      <InstagramSelectContent />
    </Suspense>
  );
}
