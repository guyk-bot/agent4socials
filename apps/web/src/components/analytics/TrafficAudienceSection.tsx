'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DonutBreakdownCard } from '@/components/analytics/DonutBreakdownCard';
import { fetchBreakdownResponse } from '@/lib/analytics/client-fetch';
import { formatBreakdownTotal } from '@/lib/analytics/breakdown-helpers';
import { INSTAGRAM_DEMOGRAPHICS_EMPTY_MESSAGE } from '@/lib/analytics/breakdown-types';

/**
 * TODO: Replace with real Instagram Business / Creator professional account id (Graph API ig-user-id).
 * Optional: set NEXT_PUBLIC_DEMO_INSTAGRAM_ACCOUNT_ID in .env.local for local testing.
 */
const DEMO_INSTAGRAM_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_DEMO_INSTAGRAM_ACCOUNT_ID ?? 'YOUR_INSTAGRAM_PRO_ACCOUNT_ID';

/**
 * TODO: Replace with your YouTube channel id (e.g. UC…). Public id only — never put tokens here.
 * Optional: NEXT_PUBLIC_DEMO_YOUTUBE_CHANNEL_ID
 */
const DEMO_YOUTUBE_CHANNEL_ID =
  process.env.NEXT_PUBLIC_DEMO_YOUTUBE_CHANNEL_ID ?? 'YOUR_YOUTUBE_CHANNEL_ID';

function rangeToYoutubeDates(range: string): { startDate: string; endDate: string } {
  const end = new Date();
  const endDate = end.toISOString().slice(0, 10);
  const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '90d' ? 90 : 30;
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

export function TrafficAudienceSection() {
  const [igRange, setIgRange] = useState('30d');
  const [ytRange, setYtRange] = useState('30d');
  const [ytTrafficRange, setYtTrafficRange] = useState('30d');

  const ytDates = useMemo(() => rangeToYoutubeDates(ytRange), [ytRange]);
  const ytTrafficDates = useMemo(() => rangeToYoutubeDates(ytTrafficRange), [ytTrafficRange]);

  const igQuery = useQuery({
    queryKey: ['analytics', 'instagram', 'audience-by-country', DEMO_INSTAGRAM_ACCOUNT_ID, igRange],
    queryFn: () => {
      const q = new URLSearchParams({
        accountId: DEMO_INSTAGRAM_ACCOUNT_ID,
        range: igRange,
      });
      return fetchBreakdownResponse(`/api/analytics/instagram/audience-by-country?${q}`);
    },
  });

  const ytCountryQuery = useQuery({
    queryKey: [
      'analytics',
      'youtube',
      'audience-by-country',
      DEMO_YOUTUBE_CHANNEL_ID,
      ytDates.startDate,
      ytDates.endDate,
    ],
    queryFn: () => {
      const q = new URLSearchParams({
        channelId: DEMO_YOUTUBE_CHANNEL_ID,
        startDate: ytDates.startDate,
        endDate: ytDates.endDate,
        primaryMetric: 'views',
      });
      return fetchBreakdownResponse(`/api/analytics/youtube/audience-by-country?${q}`);
    },
  });

  const ytTrafficQuery = useQuery({
    queryKey: [
      'analytics',
      'youtube',
      'traffic-sources',
      DEMO_YOUTUBE_CHANNEL_ID,
      ytTrafficDates.startDate,
      ytTrafficDates.endDate,
    ],
    queryFn: () => {
      const q = new URLSearchParams({
        channelId: DEMO_YOUTUBE_CHANNEL_ID,
        startDate: ytTrafficDates.startDate,
        endDate: ytTrafficDates.endDate,
      });
      return fetchBreakdownResponse(`/api/analytics/youtube/traffic-sources?${q}`);
    },
  });

  const igEmpty =
    igQuery.data?.meta && (igQuery.data.meta as { insufficientAudienceData?: boolean }).insufficientAudienceData ? (
      <p className="mx-auto max-w-md leading-relaxed">{INSTAGRAM_DEMOGRAPHICS_EMPTY_MESSAGE}</p>
    ) : (
      <p>No audience breakdown for this range.</p>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#111827]">Traffic / Audience</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Breakdown cards (Metricool-style). Uses mock data when{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">ANALYTICS_BREAKDOWN_USE_MOCK=1</code> or when
          server credentials are missing.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <DonutBreakdownCard
          title="Instagram audience by country"
          subtitle="Follower demographics · Meta snapshot window"
          totalLabel="Total (est.)"
          totalValue={formatBreakdownTotal(igQuery.data?.total ?? 0, 'count')}
          items={igQuery.data?.items ?? []}
          loading={igQuery.isPending || igQuery.isFetching}
          error={
            igQuery.isError && !igQuery.isFetching ? (igQuery.error as Error).message : null
          }
          emptyState={igEmpty}
          selectedFilter={igRange}
          onFilterChange={setIgRange}
          valueFormat="count"
          legendLabel="Country"
        />

        <DonutBreakdownCard
          title="YouTube audience by country"
          subtitle={`${ytDates.startDate} → ${ytDates.endDate} · Views`}
          totalLabel="Total views"
          totalValue={formatBreakdownTotal(ytCountryQuery.data?.total ?? 0, 'views')}
          items={ytCountryQuery.data?.items ?? []}
          loading={ytCountryQuery.isPending || ytCountryQuery.isFetching}
          error={
            ytCountryQuery.isError && !ytCountryQuery.isFetching
              ? (ytCountryQuery.error as Error).message
              : null
          }
          emptyState={<p>No geographic view data for this range.</p>}
          selectedFilter={ytRange}
          onFilterChange={setYtRange}
          valueFormat="views"
          legendLabel="Country"
        />

        <DonutBreakdownCard
          title="YouTube traffic sources"
          subtitle={`${ytTrafficDates.startDate} → ${ytTrafficDates.endDate} · Views`}
          totalLabel="Total views"
          totalValue={formatBreakdownTotal(ytTrafficQuery.data?.total ?? 0, 'views')}
          items={ytTrafficQuery.data?.items ?? []}
          loading={ytTrafficQuery.isPending || ytTrafficQuery.isFetching}
          error={
            ytTrafficQuery.isError && !ytTrafficQuery.isFetching
              ? (ytTrafficQuery.error as Error).message
              : null
          }
          emptyState={<p>No traffic source data for this range.</p>}
          selectedFilter={ytTrafficRange}
          onFilterChange={setYtTrafficRange}
          valueFormat="views"
          legendLabel="Source"
        />
      </div>
    </div>
  );
}
