'use client';

import React, { useState } from 'react';
import { LayoutDashboard, Eye, FileText } from 'lucide-react';
import { AnalyticsNoticeBanner } from '../AnalyticsNoticeBanner';
import { FacebookOverviewTab } from './FacebookOverviewTab';
import { FacebookPageViewsTab } from './FacebookPageViewsTab';
import { FacebookPostsTab } from './FacebookPostsTab';
import type { FacebookInsights, FacebookPost } from './types';

const FACEBOOK_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'pageviews', label: 'Page Views', icon: Eye },
  { id: 'posts', label: 'Posts', icon: FileText },
] as const;

export type FacebookAnalyticsTabId = (typeof FACEBOOK_TABS)[number]['id'];

export interface FacebookAnalyticsViewProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  insightsLoading: boolean;
  postsLoading: boolean;
  insightsHint?: string;
  showPermissionsNotice?: boolean;
  onReconnect?: () => void;
  onUpgrade?: () => void;
  onSyncPosts?: () => void;
}

export function FacebookAnalyticsView({
  insights,
  posts,
  dateRange,
  insightsLoading,
  postsLoading,
  insightsHint,
  showPermissionsNotice,
  onReconnect,
  onUpgrade,
  onSyncPosts,
}: FacebookAnalyticsViewProps) {
  const [subTab, setSubTab] = useState<FacebookAnalyticsTabId>('overview');
  const loading = insightsLoading || postsLoading;

  return (
    <div className="space-y-6">
      {/* Notices */}
      {insightsHint && (
        <AnalyticsNoticeBanner
          variant="permissions"
          title="More insights are available"
          description={insightsHint}
          ctaLabel="Reconnect account"
          onCta={onReconnect}
        />
      )}
      {showPermissionsNotice && !insightsHint && onReconnect && (
        <AnalyticsNoticeBanner
          variant="info"
          title="Connect Facebook Page insights"
          description="Reconnect and grant read_insights to unlock follower trends, views, reach, and growth charts."
          ctaLabel="Reconnect account"
          onCta={onReconnect}
        />
      )}

      {/* Sub-tabs: Overview | Page Views | Posts */}
      <div className="flex flex-wrap gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {FACEBOOK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              subTab === tab.id ? 'bg-white shadow-sm text-[#111827]' : 'text-[#6b7280] hover:bg-white/70'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {subTab === 'overview' && (
        <FacebookOverviewTab
          insights={insights}
          posts={posts}
          dateRange={dateRange}
          loading={loading}
          onUpgrade={onUpgrade}
          onReconnect={onReconnect}
          showPermissionsNotice={showPermissionsNotice ?? false}
        />
      )}
      {subTab === 'pageviews' && (
        <FacebookPageViewsTab
          insights={insights}
          dateRange={dateRange}
          loading={loading}
          onUpgrade={onUpgrade}
        />
      )}
      {subTab === 'posts' && (
        <FacebookPostsTab
          posts={posts}
          dateRange={dateRange}
          loading={loading}
          onSync={onSyncPosts}
          onUpgrade={onUpgrade}
        />
      )}
    </div>
  );
}
