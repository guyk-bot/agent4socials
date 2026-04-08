'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';
import { ExternalLink, RefreshCw } from 'lucide-react';

type OutlierItem = {
  id: string;
  nicheName: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: string;
  subscriberCount: string;
  performanceRatio: number;
  outlierLabel: string;
  isHighOutlier: boolean;
  vph: number;
  videoType: string;
  publishedAt: string;
  watchUrl: string;
};

type VideoTypeFilter = 'all' | 'short' | 'long';

export default function TrendingPage() {
  const [filter, setFilter] = useState<VideoTypeFilter>('all');
  const [niche, setNiche] = useState('');
  const [items, setItems] = useState<OutlierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { refreshNiche?: string }) => {
      setError(null);
      setLoading(true);
      try {
        const params: Record<string, string> = { minRatio: '2' };
        if (filter === 'short' || filter === 'long') params.videoType = filter;
        if (niche.trim()) params.niche = niche.trim();
        if (opts?.refreshNiche?.trim()) {
          params.niche = opts.refreshNiche.trim();
          params.refresh = '1';
        }
        const res = await api.get<{ items: OutlierItem[] }>('/trends/outliers', {
          params,
          timeout: opts?.refreshNiche ? 120_000 : 25_000,
        });
        setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      } catch (e: unknown) {
        let msg = 'Failed to load';
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          const data = e.response?.data;
          if (typeof data === 'object' && data && 'message' in data && typeof (data as { message: unknown }).message === 'string') {
            msg = (data as { message: string }).message;
          } else if (typeof data === 'string' && data.length > 0) {
            msg = data.slice(0, 300);
          } else if (status === 401) {
            msg = 'Unauthorized. Try refreshing the page or signing in again.';
          } else if (status === 503 || status === 500) {
            msg = status === 503
              ? 'Server: database not ready for trends (run migrations), or service unavailable.'
              : 'Server error loading trends.';
          } else if (e.code === 'ECONNABORTED') {
            msg = 'Request timed out. For a full niche refresh, try again or run the nightly cron.';
          } else if (status) {
            msg = `Request failed (${status}).`;
          }
        }
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, niche]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Viral Trend Radar</h1>
          <p className="text-sm text-neutral-600 mt-1 max-w-xl">
            Outliers from nightly YouTube scans (views ÷ subscribers &gt; 2). Scores &ge; 5× are highlighted. Data is served from the database; cron fills it daily.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'short', 'long'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                filter === f
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'short' ? 'Shorts' : 'Long-form'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input
          type="search"
          placeholder="Filter by niche keyword (optional)"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm bg-white"
        />
        <button
          type="button"
          onClick={() => load()}
          className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800"
        >
          Apply
        </button>
        <button
          type="button"
          disabled={refreshing || !niche.trim()}
          onClick={() => {
            setRefreshing(true);
            load({ refreshNiche: niche });
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-violet-300 text-violet-800 text-sm font-medium bg-violet-50 hover:bg-violet-100 disabled:opacity-50"
          title="Refreshes this niche via YouTube only if last update is older than 24 hours"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh niche
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-3 animate-pulse h-72" />
          ))}
        </div>
      ) : !error && items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
          <p className="font-medium text-neutral-800">No outliers in the database yet.</p>
          <p className="text-sm mt-2">
            The API key alone does not fill this page. You need rows in the database: trigger{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">POST /api/cron/niche-trends</code> with header{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">X-Cron-Secret</code> (same as your other crons), with{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">YOUTUBE_API_KEY</code> set on the server. Or type a niche
            from the list and use <strong>Refresh niche</strong> once migrations are applied.
          </p>
          <p className="text-xs mt-3 text-neutral-500">
            Half of the 98 niches run per UTC day unless <code className="bg-neutral-100 px-1 rounded">NICHE_TREND_SLICE=all</code>.
          </p>
        </div>
      ) : !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it) => (
            <article
              key={it.id}
              className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <a href={it.watchUrl} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-neutral-100 relative group">
                {it.thumbnailUrl ? (
                  <img src={it.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : null}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-black/70 text-white">
                  {it.videoType}
                </span>
                {it.isHighOutlier && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                    Outlier
                  </span>
                )}
                <span className="absolute bottom-2 right-2 p-1.5 rounded-full bg-white/90 text-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={14} />
                </span>
              </a>
              <div className="p-3 flex flex-col flex-1 gap-2">
                <p className="text-xs text-violet-600 font-medium line-clamp-1" title={it.nicheName}>
                  {it.nicheName}
                </p>
                <h2 className="text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">{it.title}</h2>
                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 text-xs font-semibold">
                    VPH ~{it.vph.toLocaleString()}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
                      it.isHighOutlier ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {it.outlierLabel} performance
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  {Number(it.viewCount).toLocaleString()} views · {Number(it.subscriberCount).toLocaleString()} subs
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-neutral-500">
        Cron URL:{' '}
        <Link href="/dashboard/automation" className="text-violet-700 underline">
          Automation
        </Link>{' '}
        documents external schedulers. Point a daily job at <code className="bg-neutral-100 px-1 rounded">/api/cron/niche-trends</code>.
      </p>
    </div>
  );
}
