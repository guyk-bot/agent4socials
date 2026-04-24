'use client';

import React, { useState, useMemo } from 'react';
import { ExternalLink, ArrowUpDown, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { AnalyticsKpiCard } from '../AnalyticsKpiCard';
import { AnalyticsSectionHeader } from '../AnalyticsSectionHeader';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import { FacebookIcon } from '@/components/SocialPlatformIcons';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { FacebookPost } from './types';

interface FacebookPostsTabProps {
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  loading: boolean;
  onSync?: () => void;
  onUpgrade?: () => void;
}

type SortKey = 'date' | 'views' | 'reactions' | 'comments' | 'shares' | 'clicks';

export function FacebookPostsTab({
  posts,
  dateRange,
  loading,
  onSync,
  onUpgrade,
}: FacebookPostsTabProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const totalInteractions = posts.reduce((s, p) => s + (p.interactions ?? 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalReactions = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.commentsCount ?? 0), 0);
  const totalShares = posts.reduce((s, p) => s + (p.sharesCount ?? 0), 0);
  const reach = totalViews;

  const filteredPosts = useMemo(() => {
    if (!search.trim()) return posts;
    const q = search.toLowerCase();
    return posts.filter((p) => (p.content ?? '').toLowerCase().includes(q));
  }, [posts, search]);

  const sortedPosts = useMemo(() => {
    const key = sortBy;
    return [...filteredPosts].sort((a, b) => {
      let diff = 0;
      if (key === 'date') diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      else if (key === 'views') diff = (a.impressions ?? 0) - (b.impressions ?? 0);
      else if (key === 'reactions') diff = (a.likeCount ?? 0) - (b.likeCount ?? 0);
      else if (key === 'comments') diff = (a.commentsCount ?? 0) - (b.commentsCount ?? 0);
      else if (key === 'shares') diff = (a.sharesCount ?? 0) - (b.sharesCount ?? 0);
      else if (key === 'clicks') diff = (a.impressions ?? 0) - (b.impressions ?? 0);
      return sortDesc ? -diff : diff;
    });
  }, [filteredPosts, sortBy, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / perPage));
  const pagePosts = sortedPosts.slice((page - 1) * perPage, page * perPage);

  const postsByDate = useMemo(() => {
    const map = new Map<string, number>();
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  const interactionsByDate = useMemo(() => {
    const map = new Map<string, number>();
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + (p.interactions ?? 0));
    });
    return Array.from(map.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  if (loading) {
    return (
      <div className="space-y-10 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-neutral-100" />
        <div className="h-64 rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-10 max-w-full" style={{ maxWidth: 1400 }}>
      {/* Section A — Post performance summary */}
      <section>
        <AnalyticsSectionHeader title="Post performance" subtitle="Summary of your published content." />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <AnalyticsKpiCard label="Number of posts" value={posts.length} accent="content" />
          <AnalyticsKpiCard label="Total interactions" value={totalInteractions} accent="engagement" />
          <AnalyticsKpiCard label="Avg interactions per post" value={posts.length ? (totalInteractions / posts.length).toFixed(0) : '—'} accent="engagement" />
          <AnalyticsKpiCard label="Total views" value={totalViews} accent="visibility" />
          <AnalyticsKpiCard label="Total reactions" value={totalReactions} accent="engagement" />
          <AnalyticsKpiCard label="Total comments" value={totalComments} accent="engagement" />
          <AnalyticsKpiCard label="Total shares" value={totalShares} accent="engagement" />
        </div>
      </section>

      {/* Section B — Posts over time chart */}
      <section>
        <AnalyticsSectionHeader title="Posts & interactions over time" />
        <AnalyticsWatermarkedChart height={280}>
          <div style={{ height: 260 }}>
            {postsByDate.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postsByDate} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => {
                      try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return v; }
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length || !label) return null;
                      return (
                        <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ padding: '8px 10px', borderRadius: 8 }}>
                          <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                          <p className="font-semibold mt-0.5">Posts: {(payload[0]?.value ?? 0) as number}</p>
                        </div>
                      );
                    }}
                    cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  />
                  <Bar dataKey="value" name="Posts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No posts in this period</div>
            )}
          </div>
        </AnalyticsWatermarkedChart>
      </section>

      {/* Section C — Interaction breakdown */}
      <section>
        <AnalyticsSectionHeader title="Interaction breakdown" subtitle="Reactions, comments, and shares." />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <AnalyticsKpiCard label="Reactions" value={totalReactions} accent="engagement" />
          <AnalyticsKpiCard label="Comments" value={totalComments} accent="engagement" />
          <AnalyticsKpiCard label="Shares" value={totalShares} accent="engagement" />
          <AnalyticsKpiCard label="Avg reactions per post" value={posts.length ? (totalReactions / posts.length).toFixed(0) : '—'} accent="engagement" />
          <AnalyticsKpiCard label="Avg comments per post" value={posts.length ? (totalComments / posts.length).toFixed(0) : '—'} accent="engagement" />
          <AnalyticsKpiCard label="Avg shares per post" value={posts.length ? (totalShares / posts.length).toFixed(0) : '—'} accent="engagement" />
        </div>
      </section>

      {/* Section D — Content type (simplified: we don't have type breakdown from API easily) */}
      {posts.length > 0 && (
        <section>
          <AnalyticsSectionHeader title="Content format" subtitle="Distribution by media type when available." />
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(posts.map((p) => p.mediaType || 'OTHER'))).map((t) => {
              const count = posts.filter((p) => (p.mediaType || 'OTHER') === t).length;
              const pct = ((count / posts.length) * 100).toFixed(0);
              return (
                <div key={t} className="px-4 py-2 rounded-xl bg-neutral-50 border border-neutral-100">
                  <span className="text-sm font-medium text-[#111827]">{t === 'OTHER' ? 'Other' : t}</span>
                  <span className="text-[#6b7280] text-sm ml-2">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section E — List of posts table */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <AnalyticsSectionHeader title="List of posts" />
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-44"
            />
            {onSync && (
              <button
                type="button"
                onClick={onSync}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <RefreshCw size={16} />
                Sync
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden overflow-x-auto">
          {sortedPosts.length === 0 ? (
            <div className="p-12 text-center">
              <ImageIcon size={48} className="mx-auto text-neutral-300 mb-4" />
              <p className="text-sm text-neutral-500">No Facebook data available for this period.</p>
              <p className="text-xs text-neutral-400 mt-1">Try expanding the date range or syncing your account.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#6b7280] uppercase tracking-wider">Content</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                        <button type="button" onClick={() => { setSortBy('date'); setSortDesc(!sortDesc); setPage(1); }} className="inline-flex items-center gap-1 hover:text-[#111827]">
                          Date <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                        <button type="button" onClick={() => { setSortBy('views'); setSortDesc(!sortDesc); setPage(1); }} className="inline-flex items-center gap-1 hover:text-[#111827]">
                          Views <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                        <button type="button" onClick={() => { setSortBy('reactions'); setSortDesc(!sortDesc); setPage(1); }} className="inline-flex items-center gap-1 hover:text-[#111827]">
                          Reactions <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                        <button type="button" onClick={() => { setSortBy('comments'); setSortDesc(!sortDesc); setPage(1); }} className="inline-flex items-center gap-1 hover:text-[#111827]">
                          Comments <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                        <button type="button" onClick={() => { setSortBy('shares'); setSortDesc(!sortDesc); setPage(1); }} className="inline-flex items-center gap-1 hover:text-[#111827]">
                          Shares <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#6b7280] uppercase tracking-wider">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {pagePosts.map((post) => (
                      <tr key={post.id} className="hover:bg-[#fafafa] transition-colors" style={{ minHeight: 64 }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {post.thumbnailUrl ? (
                              <img src={post.thumbnailUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                                <FacebookIcon size={24} />
                              </div>
                            )}
                            <p className="text-sm text-[#111827] line-clamp-2 max-w-[220px]">{post.content || 'No caption'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#6b7280] text-right whitespace-nowrap">
                          {new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#111827] text-right tabular-nums">{(post.impressions ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-[#111827] text-right tabular-nums">{(post.likeCount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-[#111827] text-right tabular-nums">{(post.commentsCount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-[#111827] text-right tabular-nums">{(post.sharesCount ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          {post.permalinkUrl && (
                            <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#ff7a00] hover:underline">
                              Open <ExternalLink size={14} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50/50 text-sm text-[#6b7280] flex-wrap gap-2">
                <span>
                  {(page - 1) * perPage + 1}–{Math.min(page * perPage, sortedPosts.length)} of {sortedPosts.length}
                </span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setPage(1)} disabled={page <= 1} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">«</button>
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">←</button>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">→</button>
                  <button type="button" onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">»</button>
                </div>
              </div>
            </>
          )}
        </div>

        {onUpgrade && (
          <p className="text-xs text-[#6b7280] mt-3">
            Upgrade to export reports without watermark.
            <button type="button" onClick={onUpgrade} className="ml-1 text-[#111827] font-medium hover:underline">Upgrade plan</button>
          </p>
        )}
      </section>
    </div>
  );
}
