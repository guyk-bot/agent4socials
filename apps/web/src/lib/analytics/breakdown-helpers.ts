import type { BreakdownItem } from '@/lib/analytics/breakdown-types';

const DEFAULT_PALETTE = [
  '#8b5cf6',
  '#6366f1',
  '#b030ad',
  '#f59e0b',
  '#10b981',
  '#94a3b8',
  '#ec4899',
  '#3b82f6',
];

export function resolveSliceColor(index: number, colorToken?: string): string {
  if (colorToken?.startsWith('#')) return colorToken;
  if (colorToken) {
    const map: Record<string, string> = {
      cyan: '#8b5cf6',
      indigo: '#6366f1',
      purple: '#b030ad',
      amber: '#f59e0b',
      green: '#10b981',
      slate: '#94a3b8',
    };
    if (map[colorToken]) return map[colorToken];
  }
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}

export function computePercentsFromValues(
  rows: Array<{ key: string; label: string; value: number; colorToken?: string }>
): BreakdownItem[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  if (total <= 0) return [];
  return rows
    .filter((r) => r.value > 0)
    .map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      percent: Number(((r.value / total) * 100).toFixed(1)),
      colorToken: r.colorToken,
    }));
}

/**
 * Sort by value desc, keep top N keys, merge the rest into a single "Other" row; percents are recomputed from values.
 */
export function aggregateTopNWithOther(items: BreakdownItem[], topN = 5): BreakdownItem[] {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return [];
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otherValue = rest.reduce((s, i) => s + i.value, 0);
  const merged =
    otherValue > 0
      ? [
          ...top,
          {
            key: 'other',
            label: 'Other',
            value: otherValue,
            percent: 0,
            colorToken: 'slate',
          } satisfies BreakdownItem,
        ]
      : top;
  return computePercentsFromValues(merged);
}

export function formatBreakdownTotal(value: number, kind: 'count' | 'minutes' | 'views' = 'count'): string {
  if (!Number.isFinite(value)) return '—';
  if (kind === 'minutes') {
    const n = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${n.toLocaleString()} min`;
  }
  if (kind === 'views') {
    return Math.round(value).toLocaleString();
  }
  return Math.round(value).toLocaleString();
}

export function countryCodeToLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c) return 'Unknown';
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    const name = dn.of(c);
    return name && name !== c ? name : c;
  } catch {
    return c;
  }
}

export function mapUiRangeToInstagramTimeframe(
  range: string
): 'last_14_days' | 'last_30_days' | 'last_90_days' {
  if (range === '90d') return 'last_90_days';
  if (range === '14d' || range === '7d') return 'last_14_days';
  return 'last_30_days';
}

export function instagramTimeframeLabel(tf: 'last_14_days' | 'last_30_days' | 'last_90_days'): string {
  if (tf === 'last_14_days') return 'Last 14 days';
  if (tf === 'last_90_days') return 'Last 90 days';
  return 'Last 30 days';
}

export function approximateRangeDatesForInstagram(
  tf: 'last_14_days' | 'last_30_days' | 'last_90_days'
): { start: string; end: string; label: string } {
  const end = new Date();
  const days = tf === 'last_14_days' ? 14 : tf === 'last_90_days' ? 90 : 30;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: instagramTimeframeLabel(tf),
  };
}
