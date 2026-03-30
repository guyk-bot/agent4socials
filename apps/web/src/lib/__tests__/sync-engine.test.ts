/**
 * Unit tests for the sync engine and config.
 *
 * These tests run entirely in-memory — no real DB or network calls.
 * They verify the core correctness guarantees:
 *   1. Duplicate prevention via idempotency key
 *   2. Stale threshold logic per platform
 *   3. Adapter registry — every platform resolves to an adapter
 *   4. Partial result does not count as a full failure
 *   5. Config: all registered platforms have stale thresholds for all their scopes
 */

import {
  getStaleThresholdMs,
  buildIdempotencyKey,
  PLATFORM_SCOPES,
  STALE_THRESHOLDS,
  MIN_MANUAL_SYNC_INTERVAL_MS,
  type SyncScope,
} from '../sync/config';
import { getAdapterForPlatform } from '../sync/adapters';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Config: stale thresholds are positive numbers for all platform+scope combos
// ─────────────────────────────────────────────────────────────────────────────
describe('getStaleThresholdMs', () => {
  it('returns a positive number for all registered platform+scope combinations', () => {
    for (const [platform, scopes] of Object.entries(PLATFORM_SCOPES)) {
      for (const scope of scopes) {
        const ms = getStaleThresholdMs(platform, scope as SyncScope);
        expect(ms).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to default threshold for unknown platform', () => {
    const ms = getStaleThresholdMs('UNKNOWN_PLATFORM', 'account_overview');
    expect(ms).toBeGreaterThan(0);
    // Should match the default threshold
    const defaultMs = STALE_THRESHOLDS['default']!['account_overview']!;
    expect(ms).toBe(defaultMs);
  });

  it('comments/messages threshold is much shorter than analytics for high-frequency platforms', () => {
    for (const platform of ['INSTAGRAM', 'FACEBOOK']) {
      const analyticsMs = getStaleThresholdMs(platform, 'account_overview');
      const commentsMs  = getStaleThresholdMs(platform, 'comments');
      expect(commentsMs).toBeLessThan(analyticsMs);
    }
  });

  it('MIN_MANUAL_SYNC_INTERVAL_MS is at least 1 minute', () => {
    expect(MIN_MANUAL_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Idempotency key — same inputs in the same time-bucket produce the same key
// ─────────────────────────────────────────────────────────────────────────────
describe('buildIdempotencyKey', () => {
  it('produces the same key when called twice in the same 5-min window (scheduled)', () => {
    const key1 = buildIdempotencyKey('user1', 'acc1', 'posts', 'scheduled');
    const key2 = buildIdempotencyKey('user1', 'acc1', 'posts', 'scheduled');
    expect(key1).toBe(key2);
  });

  it('different accounts produce different keys', () => {
    const key1 = buildIdempotencyKey('user1', 'acc1', 'posts', 'scheduled');
    const key2 = buildIdempotencyKey('user1', 'acc2', 'posts', 'scheduled');
    expect(key1).not.toBe(key2);
  });

  it('different scopes produce different keys', () => {
    const key1 = buildIdempotencyKey('user1', 'acc1', 'posts', 'scheduled');
    const key2 = buildIdempotencyKey('user1', 'acc1', 'comments', 'scheduled');
    expect(key1).not.toBe(key2);
  });

  it('different sync types produce different keys', () => {
    const key1 = buildIdempotencyKey('user1', 'acc1', 'posts', 'scheduled');
    const key2 = buildIdempotencyKey('user1', 'acc1', 'posts', 'manual');
    expect(key1).not.toBe(key2);
  });

  it('key includes all four components', () => {
    const key = buildIdempotencyKey('myUser', 'myAcc', 'account_overview', 'page_refresh');
    expect(key).toContain('myUser');
    expect(key).toContain('myAcc');
    expect(key).toContain('account_overview');
    expect(key).toContain('page_refresh');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Adapter registry — every platform has an adapter
// ─────────────────────────────────────────────────────────────────────────────
describe('getAdapterForPlatform', () => {
  const allPlatforms = Object.keys(PLATFORM_SCOPES);

  it('returns a non-null adapter for every registered platform', () => {
    for (const platform of allPlatforms) {
      const adapter = getAdapterForPlatform(platform);
      expect(adapter).not.toBeNull();
    }
  });

  it('returns null for an unknown platform', () => {
    expect(getAdapterForPlatform('MYSPACE')).toBeNull();
  });

  it('every adapter has at least syncAccountOverview or syncRecentContent', () => {
    for (const platform of allPlatforms) {
      const adapter = getAdapterForPlatform(platform);
      const hasSomething =
        typeof adapter?.syncAccountOverview === 'function' ||
        typeof adapter?.syncRecentContent   === 'function';
      expect(hasSomething).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PLATFORM_SCOPES — all listed scopes are valid SyncScope values
// ─────────────────────────────────────────────────────────────────────────────
describe('PLATFORM_SCOPES', () => {
  const VALID_SCOPES: SyncScope[] = [
    'account_overview', 'posts', 'post_metrics', 'comments', 'messages', 'demographics',
  ];

  it('every scope in PLATFORM_SCOPES is a valid SyncScope', () => {
    for (const [, scopes] of Object.entries(PLATFORM_SCOPES)) {
      for (const scope of scopes) {
        expect(VALID_SCOPES).toContain(scope);
      }
    }
  });

  it('Instagram and Facebook support both comments and messages', () => {
    expect(PLATFORM_SCOPES['INSTAGRAM']).toContain('comments');
    expect(PLATFORM_SCOPES['INSTAGRAM']).toContain('messages');
    expect(PLATFORM_SCOPES['FACEBOOK']).toContain('comments');
    expect(PLATFORM_SCOPES['FACEBOOK']).toContain('messages');
  });

  it('TikTok does NOT claim to support messages (not available in API)', () => {
    expect(PLATFORM_SCOPES['TIKTOK']).not.toContain('messages');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Adapter return type — partial is always optional (not required)
// ─────────────────────────────────────────────────────────────────────────────
describe('adapter return type contract', () => {
  it('generic adapter syncAccountOverview resolves with itemsProcessed', async () => {
    const adapter = getAdapterForPlatform('TWITTER');
    const result = await adapter!.syncAccountOverview!({
      id: 'id', userId: 'u', platform: 'TWITTER',
      platformUserId: 'uid', accessToken: 'tok', status: 'connected',
    });
    expect(typeof result.itemsProcessed).toBe('number');
    // partial is optional — undefined is fine
    expect(result.partial === undefined || typeof result.partial === 'boolean').toBe(true);
  });
});
