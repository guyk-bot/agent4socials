/**
 * Staleness thresholds and sync frequency config per platform and resource type.
 * All values are in milliseconds.
 */

export type SyncScope =
  | 'account_overview'
  | 'posts'
  | 'post_metrics'
  | 'comments'
  | 'messages'
  | 'demographics'
  | 'full';

export type SyncType =
  | 'scheduled'
  | 'manual'
  | 'initial_backfill'
  | 'page_refresh'
  | 'webhook_followup';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'error'
  | 'needs_reconnect';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'partial_success'
  | 'failed';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * How old a sync result can be before we consider it stale and trigger a background refresh.
 * Keyed by [platform][scope]. If platform not found, falls back to "default".
 */
export const STALE_THRESHOLDS: Record<string, Partial<Record<SyncScope, number>>> = {
  INSTAGRAM: {
    account_overview: 6 * HOUR,
    posts:            30 * MINUTE,
    post_metrics:     2 * HOUR,
    comments:         3 * MINUTE,
    messages:         3 * MINUTE,
    demographics:     12 * HOUR,
    full:             6 * HOUR,
  },
  FACEBOOK: {
    account_overview: 6 * HOUR,
    posts:            30 * MINUTE,
    post_metrics:     2 * HOUR,
    comments:         3 * MINUTE,
    messages:         3 * MINUTE,
    demographics:     12 * HOUR,
    full:             6 * HOUR,
  },
  TIKTOK: {
    account_overview: 12 * HOUR,
    posts:            60 * MINUTE,
    post_metrics:     4 * HOUR,
    comments:         10 * MINUTE,
    messages:         10 * MINUTE,
    demographics:     24 * HOUR,
    full:             12 * HOUR,
  },
  YOUTUBE: {
    account_overview: 12 * HOUR,
    posts:            60 * MINUTE,
    post_metrics:     6 * HOUR,
    comments:         10 * MINUTE,
    demographics:     24 * HOUR,
    full:             12 * HOUR,
  },
  TWITTER: {
    account_overview: 6 * HOUR,
    posts:            30 * MINUTE,
    post_metrics:     2 * HOUR,
    comments:         5 * MINUTE,
    messages:         5 * MINUTE,
    full:             6 * HOUR,
  },
  LINKEDIN: {
    account_overview: 12 * HOUR,
    posts:            60 * MINUTE,
    post_metrics:     6 * HOUR,
    full:             12 * HOUR,
  },
  PINTEREST: {
    account_overview: 12 * HOUR,
    posts:            60 * MINUTE,
    post_metrics:     6 * HOUR,
    full:             12 * HOUR,
  },
  default: {
    account_overview: 12 * HOUR,
    posts:            60 * MINUTE,
    post_metrics:     6 * HOUR,
    comments:         10 * MINUTE,
    messages:         10 * MINUTE,
    demographics:     24 * HOUR,
    full:             12 * HOUR,
  },
};

/** Minimum gap between two manual/page_refresh sync jobs for the same account+scope (debounce). */
export const MIN_MANUAL_SYNC_INTERVAL_MS = 2 * MINUTE;

/** Scopes supported per platform (only attempt these; others are skipped). */
export const PLATFORM_SCOPES: Record<string, SyncScope[]> = {
  INSTAGRAM: ['account_overview', 'posts', 'post_metrics', 'comments', 'messages', 'demographics'],
  FACEBOOK:  ['account_overview', 'posts', 'post_metrics', 'comments', 'messages', 'demographics'],
  TIKTOK:    ['account_overview', 'posts', 'post_metrics', 'comments'],
  YOUTUBE:   ['account_overview', 'posts', 'post_metrics', 'comments', 'demographics'],
  TWITTER:   ['account_overview', 'posts', 'post_metrics', 'comments', 'messages'],
  LINKEDIN:  ['account_overview', 'posts', 'post_metrics'],
  PINTEREST: ['account_overview', 'posts', 'post_metrics'],
};

export function getStaleThresholdMs(platform: string, scope: SyncScope): number {
  const platformConfig = STALE_THRESHOLDS[platform] ?? STALE_THRESHOLDS['default'];
  return platformConfig?.[scope] ?? STALE_THRESHOLDS['default']![scope] ?? 12 * HOUR;
}

/** Build an idempotency key for a sync job. Uses a time bucket so the same job isn't recreated every second. */
export function buildIdempotencyKey(
  userId: string,
  socialAccountId: string,
  scope: SyncScope,
  syncType: SyncType
): string {
  // Round to the nearest 5-minute bucket for scheduled/page_refresh; use exact minute for manual.
  const bucketMs = syncType === 'manual' ? MINUTE : 5 * MINUTE;
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${userId}:${socialAccountId}:${scope}:${syncType}:${bucket}`;
}
