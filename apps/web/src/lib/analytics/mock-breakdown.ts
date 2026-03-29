import type { BreakdownItem, BreakdownResponse } from '@/lib/analytics/breakdown-types';

function itemsWithPercents(rows: Array<{ key: string; label: string; value: number }>): BreakdownItem[] {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({
    ...r,
    percent: total > 0 ? Number(((r.value / total) * 100).toFixed(1)) : 0,
  }));
}

export function mockInstagramAudienceByCountry(): BreakdownResponse {
  const items = itemsWithPercents([
    { key: 'US', label: 'United States', value: 4200 },
    { key: 'GB', label: 'United Kingdom', value: 2100 },
    { key: 'DE', label: 'Germany', value: 1800 },
    { key: 'FR', label: FranceLabel(), value: 950 },
    { key: 'CA', label: 'Canada', value: 720 },
    { key: 'BR', label: 'Brazil', value: 410 },
    { key: 'IN', label: 'India', value: 380 },
    { key: 'AU', label: 'Australia', value: 290 },
  ]);
  const total = items.reduce((s, i) => s + i.value, 0);
  return {
    provider: 'instagram',
    metric: 'audience_by_country',
    total,
    items,
    dateRange: {
      start: '2026-02-27',
      end: '2026-03-29',
      label: 'Last 30 days (mock)',
    },
    meta: { mock: true },
  };
}

function FranceLabel(): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of('FR') ?? 'FR';
  } catch {
    return 'FR';
  }
}

export function mockYoutubeAudienceByCountry(): BreakdownResponse {
  const items = itemsWithPercents([
    { key: 'US', label: 'United States', value: 125_400 },
    { key: 'GB', label: 'United Kingdom', value: 48_200 },
    { key: 'DE', label: 'Germany', value: 32_100 },
    { key: 'IN', label: 'India', value: 28_900 },
    { key: 'FR', label: FranceLabel(), value: 19_400 },
    { key: 'CA', label: 'Canada', value: 12_300 },
    { key: 'JP', label: 'Japan', value: 8_700 },
  ]);
  const total = items.reduce((s, i) => s + i.value, 0);
  return {
    provider: 'youtube',
    metric: 'audience_by_country',
    total,
    items,
    dateRange: {
      start: '2026-02-01',
      end: '2026-03-29',
      label: 'Custom range (mock)',
    },
    meta: { mock: true },
  };
}

export function mockYoutubeTrafficSources(): BreakdownResponse {
  const items = itemsWithPercents([
    { key: 'YT_SEARCH', label: 'YouTube Search', value: 54_200 },
    { key: 'SUGGESTED_VIDEO', label: 'Suggested Videos', value: 41_800 },
    { key: 'EXT_URL', label: 'External', value: 18_400 },
    { key: 'SHORTS', label: 'Shorts Feed', value: 12_100 },
    { key: 'SUBSCRIBER', label: 'Subscriptions', value: 9_600 },
    { key: 'PLAYLIST', label: 'Playlists', value: 6_200 },
    { key: 'NO_LINK_OTHER', label: 'Other', value: 4_900 },
    { key: 'BROWSE', label: 'Browse features', value: 2_100 },
  ]);
  const total = items.reduce((s, i) => s + i.value, 0);
  return {
    provider: 'youtube',
    metric: 'traffic_sources',
    total,
    items,
    dateRange: {
      start: '2026-02-01',
      end: '2026-03-29',
      label: 'Custom range (mock)',
    },
    meta: { mock: true },
  };
}

export function shouldUseBreakdownMock(): boolean {
  return process.env.ANALYTICS_BREAKDOWN_USE_MOCK === '1' || process.env.ANALYTICS_USE_MOCK === '1';
}
