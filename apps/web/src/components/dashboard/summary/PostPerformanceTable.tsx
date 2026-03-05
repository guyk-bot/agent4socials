'use client';

import React, { useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
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

const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
};

type PostPerformanceTableProps = {
  posts: SummaryPost[];
};

export function PostPerformanceTable({ posts }: PostPerformanceTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'views' | 'likes'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [topOnly, setTopOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const presentPlatforms = Array.from(new Set(posts.map((p) => p.platform)));

  const filtered = posts.filter((p) => {
    const matchSearch = !search || (p.caption?.toLowerCase().includes(search.toLowerCase()));
    const matchPlatform = platformFilter === 'all' || p.platform === platformFilter;
    return matchSearch && matchPlatform;
  });

  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === 'date') v = new Date(a.date).getTime() - new Date(b.date).getTime();
    else if (sortKey === 'views') v = (a.reach ?? 0) - (b.reach ?? 0);
    else v = (a.engagement ?? 0) - (b.engagement ?? 0);
    return sortDesc ? -v : v;
  });

  const displayPosts = topOnly ? sorted.slice(0, 10) : sorted;

  const platformColorCls = (platform: string, active: boolean) => {
    if (platform === 'INSTAGRAM') return active ? 'bg-pink-100 border-pink-300 text-pink-800' : 'border-slate-200 text-slate-600 hover:bg-pink-50';
    if (platform === 'FACEBOOK') return active ? 'bg-blue-100 border-blue-300 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-blue-50';
    if (platform === 'YOUTUBE') return active ? 'bg-red-100 border-red-300 text-red-800' : 'border-slate-200 text-slate-600 hover:bg-red-50';
    if (platform === 'TIKTOK') return active ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-neutral-100';
    if (platform === 'TWITTER') return active ? 'bg-sky-100 border-sky-300 text-sky-800' : 'border-slate-200 text-slate-600 hover:bg-sky-50';
    if (platform === 'LINKEDIN') return active ? 'bg-blue-100 border-blue-400 text-blue-900' : 'border-slate-200 text-slate-600 hover:bg-blue-50';
    return active ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-indigo-50';
  };

  return (
    <section className="rounded-[20px] bg-white border border-slate-200/60 overflow-hidden" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <h2 className="text-lg font-semibold text-slate-900 p-5 pb-0">Post Performance</h2>
      <div className="p-4 flex flex-wrap items-center gap-2 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-44 focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
          />
        </div>
        {/* Platform filter tabs */}
        {presentPlatforms.map((platform) => {
          const count = posts.filter((p) => p.platform === platform).length;
          const isActive = platformFilter === platform;
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setPlatformFilter(isActive ? 'all' : platform)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${platformColorCls(platform, isActive)}`}
              title={PLATFORM_LABEL[platform] ?? platform}
            >
              {PLATFORM_ICON[platform]}
              {count}
            </button>
          );
        })}
        {presentPlatforms.length > 1 && (
          <button
            type="button"
            onClick={() => setPlatformFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${platformFilter === 'all' ? 'bg-slate-100 border-slate-400 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            All ({posts.length})
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} className="rounded" />
          Top Performing
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Content</th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => { setSortKey('views'); setSortDesc(sortKey === 'views' ? !sortDesc : true); }}
              >
                <span className="inline-flex items-center gap-1">Views {sortKey === 'views' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => { setSortKey('likes'); setSortDesc(sortKey === 'likes' ? !sortDesc : true); }}
              >
                <span className="inline-flex items-center gap-1">Likes {sortKey === 'likes' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Comments</th>
              <th
                className="text-left py-3 px-4 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                onClick={() => { setSortKey('date'); setSortDesc(sortKey === 'date' ? !sortDesc : true); }}
              >
                <span className="inline-flex items-center gap-1">Date {sortKey === 'date' && <ArrowUpDown className="w-3.5 h-3.5" />}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayPosts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500">
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
                        <img
                          src={post.thumbnailUrl}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty('display'); }}
                        />
                      ) : null}
                      <div
                        className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"
                        style={{ display: post.thumbnailUrl ? 'none' : 'flex' }}
                      >
                        {PLATFORM_ICON[post.platform]}
                      </div>
                      <div className="min-w-0 max-w-[200px]">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 text-slate-400">{PLATFORM_ICON[post.platform]}</span>
                          <span className="text-slate-800 truncate text-sm">{post.caption || 'No caption'}</span>
                        </div>
                        {post.permalinkUrl && (
                          <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{post.reach.toLocaleString()}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{(post.likes ?? post.engagement).toLocaleString()}</td>
                  <td className="py-3 px-4 text-slate-600">{(post.comments ?? 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{new Date(post.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
