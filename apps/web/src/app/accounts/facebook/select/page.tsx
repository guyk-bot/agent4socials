'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { BrandedPageLoader } from '@/components/BrandedPageLoader';
import { Facebook, Loader2 } from 'lucide-react';

type PageItem = { id: string; name?: string; picture?: string };

function FacebookSelectContent() {
  const searchParams = useSearchParams();
  const pendingId = searchParams.get('pendingId');
  const [pages, setPages] = useState<PageItem[]>([]);
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
      .get<{ pages: PageItem[] }>(`/social/facebook/pending?pendingId=${encodeURIComponent(pendingId)}`)
      .then((res) => {
        const list = res.data?.pages ?? [];
        setPages(list);
        if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => setError('Session expired or invalid. Please connect Facebook again from the Accounts page.'))
      .finally(() => setLoading(false));
  }, [pendingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingId || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; redirect?: string }>('/social/facebook/connect-page', {
        pendingId,
        pageId: selectedId,
      });
      if (res.data?.redirect) {
        window.location.href = res.data.redirect;
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
    return <BrandedPageLoader message="Loading your Pages…" />;
  }

  if (error || pages.length === 0) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full card">
          <p className="text-neutral-700">{error ?? 'No Pages found.'}</p>
          <Link href="/dashboard" className="mt-4 inline-block btn-primary">
            Back to Accounts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect a Facebook Page</h1>
          <p className="text-neutral-500 mt-1">Choose which Page you want to connect to Agent4Socials.</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="space-y-3">
            {pages.map((page) => (
              <label
                key={page.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedId === page.id ? 'border-[#1877F2] bg-[#E7F3FF]' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="page"
                  value={page.id}
                  checked={selectedId === page.id}
                  onChange={() => setSelectedId(page.id)}
                  className="sr-only"
                />
                <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {page.picture ? (
                    <img src={page.picture} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Facebook className="w-5 h-5 text-[#1877F2]" />
                  )}
                </div>
                <span className="font-medium text-neutral-900">{page.name || 'Facebook Page'}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Link href="/dashboard" className="flex-1 text-center py-2 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!selectedId || submitting}
              className="flex-1 py-2 rounded-lg font-medium text-white bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#145BCC] disabled:opacity-50 transition-colors flex items-center justify-center"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connect this Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FacebookSelectPage() {
  return (
    <Suspense fallback={<BrandedPageLoader message="Loading…" />}>
      <FacebookSelectContent />
    </Suspense>
  );
}
