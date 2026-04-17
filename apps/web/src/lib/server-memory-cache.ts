/**
 * Simple process-local TTL cache used to protect external APIs (Meta Graph, etc.)
 * from being hammered when the app prefetches the same data on every navigation.
 *
 * This is per-serverless-instance (not cluster-wide). That's fine for rate-limit
 * relief: each warm lambda will serve cached hits instead of re-hitting the
 * upstream API for the TTL window, which is all we need to stop the "open the
 * dashboard 3 times and burn 30% of the app's Meta quota" pattern.
 */

type Entry<T> = { expiresAt: number; value: T };

const store = new Map<string, Entry<unknown>>();

/** Return a cached value if present and fresh; otherwise null. */
export function getCached<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

/** Store a value under `key` for `ttlMs` milliseconds. */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { expiresAt: Date.now() + ttlMs, value });
}

/** Drop any cache entries whose key matches the given prefix (used to invalidate after writes). */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Fetch-and-cache helper: returns a cached value if fresh, otherwise calls `compute`,
 * stores the result, and returns it. If `compute` throws, we do NOT cache the error
 * and the caller sees the original exception.
 */
export async function withTtlCache<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  setCached(key, value, ttlMs);
  return value;
}
