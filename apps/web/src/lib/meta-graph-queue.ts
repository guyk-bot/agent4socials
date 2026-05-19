import type { AxiosResponse } from 'axios';
import {
  isMetaNonCriticalThrottled,
  noteMetaRateLimitError,
  noteMetaSoftBackoff,
  noteMetaUsageFromHeaders,
} from '@/lib/meta-usage-guard';

/** Max concurrent Meta Graph calls per serverless instance. */
const MAX_IN_FLIGHT = 2;
/** Minimum gap between Graph calls on this instance. */
const MIN_GAP_MS = 300;

/** Rolling cap across all requests sharing this warm lambda (stops multi-tab spikes). */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX_CALLS = 64;

let inFlight = 0;
let lastStartedAt = 0;
let burstWindowStart = Date.now();
let burstCallCount = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MetaGraphThrottledError extends Error {
  constructor(label: string) {
    super(`Meta Graph throttled (${label})`);
    this.name = 'MetaGraphThrottledError';
  }
}

function isRateLimitError(e: unknown): boolean {
  const err = e as { response?: { status?: number; data?: { error?: { code?: number; message?: string } } } };
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const msg = (err?.response?.data?.error?.message ?? '').toLowerCase();
  return status === 429 || code === 4 || code === 17 || code === 32 || msg.includes('rate limit');
}

function noteInstanceBurst(): void {
  const now = Date.now();
  if (now - burstWindowStart > BURST_WINDOW_MS) {
    burstWindowStart = now;
    burstCallCount = 0;
  }
  burstCallCount++;
  if (burstCallCount > BURST_MAX_CALLS) {
    noteMetaSoftBackoff();
    throw new MetaGraphThrottledError('instance_burst_cap');
  }
}

async function acquireSlot(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (inFlight >= MAX_IN_FLIGHT) {
    if (Date.now() > deadline) throw new Error('Meta Graph queue timeout');
    await sleep(80);
  }
  const wait = MIN_GAP_MS - (Date.now() - lastStartedAt);
  if (wait > 0) await sleep(wait);
  inFlight++;
  lastStartedAt = Date.now();
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
}

/**
 * Run one Meta Graph HTTP call with per-instance concurrency, spacing, and burst cap.
 * Skips entirely when app-level throttle is active (optional via allowWhenThrottled).
 */
export async function runMetaGraphRequest<T>(
  label: string,
  fn: () => Promise<AxiosResponse<T>>,
  opts?: { allowWhenThrottled?: boolean }
): Promise<AxiosResponse<T>> {
  if (!opts?.allowWhenThrottled && isMetaNonCriticalThrottled()) {
    throw new MetaGraphThrottledError(label);
  }
  noteInstanceBurst();
  await acquireSlot();
  try {
    const res = await fn();
    noteMetaUsageFromHeaders(res.headers);
    return res;
  } catch (e) {
    if (isRateLimitError(e)) noteMetaRateLimitError();
    throw e;
  } finally {
    releaseSlot();
  }
}
