import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';
import { getCached, setCached } from '@/lib/server-memory-cache';

type MetaUsage = {
  callCount: number;
  totalTime: number;
  totalCpuTime: number;
  observedAt: number;
};

const META_USAGE_CACHE_KEY = 'meta:app-usage:latest';
const META_THROTTLE_UNTIL_CACHE_KEY = 'meta:noncritical:throttle-until';
/** How long to skip optional Meta fan-out after high usage or rate-limit signals. */
const META_THROTTLE_MINUTES = 22;

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseAppUsageHeader(raw: string | null | undefined): MetaUsage | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      callCount: toNumber(parsed.call_count),
      totalTime: toNumber(parsed.total_time),
      totalCpuTime: toNumber(parsed.total_cputime),
      observedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Capture x-app-usage from Meta Graph responses; if high, enter temporary throttle mode. */
export function noteMetaUsageFromHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders | undefined
): void {
  if (!headers) return;
  const usage =
    parseAppUsageHeader((headers['x-app-usage'] as string | undefined) ?? null) ??
    parseAppUsageHeader((headers['X-App-Usage'] as string | undefined) ?? null);
  if (!usage) return;

  setCached(META_USAGE_CACHE_KEY, usage, 30 * 60 * 1000);
  /** Start backing off before Meta hits 100% app-level limits (dashboard prefetch + sync add up fast). */
  const high = usage.callCount >= 55 || usage.totalTime >= 55 || usage.totalCpuTime >= 55;
  if (high) {
    setCached(META_THROTTLE_UNTIL_CACHE_KEY, Date.now() + META_THROTTLE_MINUTES * 60 * 1000, META_THROTTLE_MINUTES * 60 * 1000);
  }
}

/** Called on explicit Meta rate-limit style errors to back off non-critical calls quickly. */
export function noteMetaRateLimitError(): void {
  setCached(META_THROTTLE_UNTIL_CACHE_KEY, Date.now() + META_THROTTLE_MINUTES * 60 * 1000, META_THROTTLE_MINUTES * 60 * 1000);
}

/** True when app should skip optional, high-fanout Meta calls. */
export function isMetaNonCriticalThrottled(): boolean {
  const until = getCached<number>(META_THROTTLE_UNTIL_CACHE_KEY) ?? 0;
  return Date.now() < until;
}

export function getLatestMetaUsage(): MetaUsage | null {
  return getCached<MetaUsage>(META_USAGE_CACHE_KEY);
}

