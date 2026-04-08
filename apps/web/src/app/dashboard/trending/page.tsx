'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';
import { ExternalLink } from 'lucide-react';

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
  lastUpdated: string;
  watchUrl: string;
};

type VideoTypeFilter = 'all' | 'short' | 'long';

const FETCH_LIMIT = 5000;

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function TrendingPage() {
  const [filter, setFilter] = useState<VideoTypeFilter>('all');
  const [items, setItems] = useState<OutlierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params: Record<string, string> = { minRatio: '2', limit: String(FETCH_LIMIT) };
      if (filter === 'short' || filter === 'long') params.videoType = filter;
      const res = await api.get<{ items: OutlierItem[]; count?: number }>('/trends/outliers', {
        params,
        timeout: 60_000,
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
          msg = 'Request timed out. Try again or narrow with Shorts/Long-form.';
        } else if (status) {
          msg = `Request failed (${status}).`;
        }
      }
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Viral Trend Radar</h1>
          <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
            All stored outliers across every scanned niche (views ÷ subscribers &gt; 2). Rows are ranked by performance ratio. Cron fills the database; scores &ge; 5× are highlighted.
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

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="animate-pulse h-10 bg-neutral-100 border-b border-neutral-200" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 border-b border-neutral-100 bg-white" />
          ))}
        </div>
      ) : !error && items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
          <p className="font-medium text-neutral-800">No outliers in the database yet.</p>
          <p className="text-sm mt-2">
            Trigger{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">POST /api/cron/niche-trends</code> with header{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">X-Cron-Secret</code> and{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">YOUTUBE_API_KEY</code> on the server. Half of the 98 niches run per UTC day unless{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">NICHE_TREND_SLICE=all</code>.
          </p>
        </div>
      ) : !error ? (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[1100px]">
              <thead className="bg-neutral-50 text-neutral-600 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-3 font-semibold w-14" scope="col">
                    {' '}
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap" scope="col">
                    Niche
                  </th>
                  <th className="px-3 py-3 font-semibold min-w-[200px]" scope="col">
                    Title
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap" scope="col">
                    Type
                  </th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap" scope="col">
                    Views
                  </th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap" scope="col">
                    Subs
                  </th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap" scope="col">
                    Ratio
                  </th>
                  <th className="px-3 py-3 font-semibold text-right whitespace-nowrap" scope="col">
                    VPH
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap" scope="col">
                    Published
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap" scope="col">
                    Updated
                  </th>
                  <th className="px-3 py-3 font-semibold w-10" scope="col">
                    {' '}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-violet-50/40 transition-colors">
                    <td className="px-3 py-2 align-middle">
                      <div className="w-12 h-9 rounded bg-neutral-100 overflow-hidden shrink-0">
                        {it.thumbnailUrl ? (
                          <img src={it.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle text-violet-700 font-medium max-w-[160px]">
                      <span className="line-clamp-2" title={it.nicheName}>
                        {it.nicheName}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-neutral-900 max-w-md">
                      <span className="line-clamp-2" title={it.title}>
                        {it.title}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">
                      <span className="uppercase text-xs font-bold text-neutral-500">{it.videoType}</span>
                    </td>
                    <td className="px-3 py-2 align-middle text-right tabular-nums text-neutral-800">
                      {Number(it.viewCount).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-middle text-right tabular-nums text-neutral-800">
                      {Number(it.subscriberCount).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                          it.isHighOutlier ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {it.outlierLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-right tabular-nums text-sky-800 font-medium">
                      ~{it.vph.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-middle text-neutral-600 whitespace-nowrap text-xs">
                      {formatDate(it.publishedAt)}
                    </td>
                    <td className="px-3 py-2 align-middle text-neutral-500 whitespace-nowrap text-xs">
                      {formatDate(it.lastUpdated)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <a
                        href={it.watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex p-1.5 rounded-lg text-violet-700 hover:bg-violet-100"
                        title="Open on YouTube"
                        aria-label="Open on YouTube"
                      >
                        <ExternalLink size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50/80 text-xs text-neutral-600">
            Showing {items.length} row{items.length !== 1 ? 's' : ''}
            {items.length >= FETCH_LIMIT ? ` (capped at ${FETCH_LIMIT}; increase limit in API if needed)` : ''}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-neutral-500">
        Cron:{' '}
        <Link href="/dashboard/automation" className="text-violet-700 underline">
          Automation
        </Link>{' '}
        · <code className="bg-neutral-100 px-1 rounded">POST /api/cron/niche-trends</code>
      </p>
    </div>
  );
}
