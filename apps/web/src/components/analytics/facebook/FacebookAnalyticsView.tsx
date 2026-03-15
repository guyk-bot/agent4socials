'use client';

import React from 'react';
import { FacebookOverviewTab } from './FacebookOverviewTab';
import type { FacebookInsights, FacebookPost } from './types';

export interface FacebookAnalyticsViewProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  insightsLoading: boolean;
  postsLoading: boolean;
  onUpgrade?: () => void;
}

export function FacebookAnalyticsView({
  insights,
  posts,
  dateRange,
  insightsLoading,
  postsLoading,
  onUpgrade,
}: FacebookAnalyticsViewProps) {
  const loading = insightsLoading || postsLoading;

  return (
    <div className="space-y-6 max-w-full" style={{ maxWidth: 1400 }}>
      <FacebookOverviewTab
        insights={insights}
        posts={posts}
        dateRange={dateRange}
        loading={loading}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
