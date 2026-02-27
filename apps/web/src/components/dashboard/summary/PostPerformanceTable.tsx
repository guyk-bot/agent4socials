'use client';

import React, { useState } from 'react';
import { Search, ArrowUpDown, Eye, Sparkles, Copy } from 'lucide-react';
import type { SummaryPost } from './types';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={18} />,
  FACEBOOK: <FacebookIcon size={18} />,
  TIKTOK: <TikTokIcon size={18} />,
  YOUTUBE: <YoutubeIcon size={18} />,
  TWITTER: <XTwitterIcon size={18} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={18} />,
};

type PostPerformanceTableProps = {
  posts: SummaryPost[];
};

export function PostPerformanceTable({ posts }: PostPerformanceTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'reach' | 'engagement'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [topOnly, setTopOnly] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(true);

  const filtered = posts.filter((p) => {
    const matchSearch = !search || (p.caption?.toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === 'date') v = new Date(a.date).getTime() - new Date(b.date).getTime();
    else if (sortKey === 'reach') v = (a.reach ?? 0) - (b.reach ?? 0);
    else v = (a.engagement ?? 0) - (b.engagement ?? 0);
    return sortDesc ? -v : v;
  });

  const displayPosts = topOnly ? sorted.slice(0, 10) : sorted;

  return (
    <section className="rounded-[20px] bg-white border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <h2 className="text-lg font-semibold text-slate-900 p-5 pb-0">Post Performance</h2>
      <div className="p-5 flex flex-wrap items-center gap-3 border-b border-slate-100">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} className="rounded" />
          Top Performing
        </label>
        <button
          type="button"
          onClick={() => setVisibleColumns((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Eye className="w-4 h-4" />
          Columns
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Content</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Platform</th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => setSortKey('date')}
              >
                <span className="inline-flex items-center gap-1">Date {sortKey === 'date' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => setSortKey('reach')}
              >
                <span className="inline-flex items-center gap-1">Reach {sortKey === 'reach' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Impressions</th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => setSortKey('engagement')}
              >
                <span className="inline-flex items-center gap-1">Engagement {sortKey === 'engagement' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
              <th className="text-left py-3 px-4 font-medium text-slate-600 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayPosts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No posts in this period or no data yet. Connect accounts and sync posts from Analytics.
                </td>
              </tr>
            ) : (
              displayPosts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {post.thumbnailUrl ? (
                        <img src={post.thumbnailUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          {PLATFORM_ICON[post.platform]}
                        </div>
                      )}
                      <span className="text-slate-800 line-clamp-2 max-w-[200px]">{post.caption || 'No caption'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5">{PLATFORM_ICON[post.platform]} {post.platform}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{new Date(post.date).toLocaleDateString()}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{post.reach.toLocaleString()}</td>
                  <td className="py-3 px-4 text-slate-600">{post.impressions.toLocaleString()}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{post.engagement.toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500" title="Boost"><Sparkles className="w-4 h-4" /></button>
                      <button type="button" className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500" title="Duplicate"><Copy className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
