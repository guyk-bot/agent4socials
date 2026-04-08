'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import api from '@/lib/api';
import { ExternalLink } from 'lucide-react';
import {
  TREND_CATEGORY_ORDER,
  categoryIdForNicheName,
  rankForCategorySection,
} from '@/lib/trends/niche-category-map';

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
const PREVIEW_COUNT = 5;
const EXPANDED_MAX = 50;

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function VideoCard({ it }: { it: OutlierItem }) {
  return (
    <a
      href={it.watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm hover:border-violet-300 hover:shadow-md transition-all"
    >
      <div className="aspect-video bg-neutral-100 relative">
        {it.thumbnailUrl ? (
          <img src={it.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : null}
        <span className="absolute top-2 right-2 uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
          {it.videoType}
        </span>
      </div>
      <div className="p-3 flex flex-col flex-1 gap-2">
        <p className="text-sm font-medium text-neutral-900 line-clamp-2 group-hover:text-violet-800" title={it.title}>
          {it.title}
        </p>
        <p className="text-xs text-violet-700/90 line-clamp-1" title={it.nicheName}>
          {it.nicheName}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex px-2 py-0.5 rounded-md font-bold ${
              it.isHighOutlier ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-800'
            }`}
          >
            {it.outlierLabel}
          </span>
          <span className="text-sky-800 font-medium tabular-nums">~{it.vph.toLocaleString()} VPH</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>{formatDate(it.publishedAt)}</span>
          <ExternalLink size={14} className="text-violet-600 shrink-0 opacity-70 group-hover:opacity-100" aria-hidden />
        </div>
      </div>
    </a>
  );
}

export default function TrendingPage() {
  const [filter, setFilter] = useState<VideoTypeFilter>('all');
  const [items, setItems] = useState<OutlierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});

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
          msg =
            status === 503
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

  const byCategory = useMemo(() => {
    const map = new Map<string, OutlierItem[]>();
    for (const cat of TREND_CATEGORY_ORDER) {
      map.set(cat.id, []);
    }
    for (const it of items) {
      const cid = categoryIdForNicheName(it.nicheName);
      const list = map.get(cid);
      if (list) list.push(it);
    }
    return map;
  }, [items]);

  const toggleExpand = (categoryId: string) => {
    setExpandedCategoryIds((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">Viral Trend Radar</h1>
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
        <div className="space-y-10">
          {Array.from({ length: 3 }).map((_, s) => (
            <div key={s} className="space-y-4">
              <div className="h-8 w-56 rounded-lg bg-neutral-200 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((__, i) => (
                  <div key={i} className="rounded-xl border border-neutral-200 overflow-hidden">
                    <div className="aspect-video bg-neutral-100 animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-neutral-100 rounded animate-pulse" />
                      <div className="h-3 w-2/3 bg-neutral-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !error && items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-600">
          <p className="font-medium text-neutral-800">No outliers in the database yet.</p>
          <p className="text-sm mt-2 max-w-md mx-auto">
            Trends fill when the server runs the niche sweep (cron or ops). Ensure <code className="bg-neutral-100 px-1 rounded text-xs">YOUTUBE_API_KEY</code> is set and{' '}
            <code className="bg-neutral-100 px-1 rounded text-xs">niche_trends</code> exists.
          </p>
        </div>
      ) : !error ? (
        <>
          {TREND_CATEGORY_ORDER.map((cat) => {
            const raw = byCategory.get(cat.id) ?? [];
            const ranked = rankForCategorySection(raw);
            const preview = ranked.slice(0, PREVIEW_COUNT);
            const expanded = expandedCategoryIds[cat.id];
            const extraCap = ranked.slice(PREVIEW_COUNT, PREVIEW_COUNT + EXPANDED_MAX);
            const extra = expanded ? extraCap : [];
            const hasMore = ranked.length > PREVIEW_COUNT;

            return (
              <section key={cat.id} className="scroll-mt-6">
                <h2 className="text-lg font-bold text-neutral-900 border-b border-neutral-200 pb-2 mb-4">{cat.label}</h2>
                {preview.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4">No viral picks in this category for the current filters.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      {preview.map((it) => (
                        <VideoCard key={it.id} it={it} />
                      ))}
                    </div>
                    {extra.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
                        {extra.map((it) => (
                          <VideoCard key={it.id} it={it} />
                        ))}
                      </div>
                    )}
                    {hasMore && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(cat.id)}
                          className="px-4 py-2 rounded-lg text-sm font-semibold border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 transition-colors"
                        >
                          {expanded
                            ? 'Show less'
                            : `Show more (${Math.min(ranked.length - PREVIEW_COUNT, EXPANDED_MAX)} more in this category)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
          <p className="text-xs text-neutral-500 pt-2">
            Up to {FETCH_LIMIT} rows loaded; ratios above 2×. Order within each category favors updates from the last 24 hours, then strongest ratio.
          </p>
        </>
      ) : null}
    </div>
  );
}
