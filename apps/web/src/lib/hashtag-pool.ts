export const HASHTAG_POOL_KEY = 'agent4socials_hashtag_pool';

export function normalizeHashtag(t: string): string {
  const s = t.trim().replace(/^#+/, '');
  return s ? `#${s}` : '';
}

export function readHashtagPool(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HASHTAG_POOL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeHashtagPool(pool: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (pool.length === 0) {
      localStorage.removeItem(HASHTAG_POOL_KEY);
      return;
    }
    localStorage.setItem(HASHTAG_POOL_KEY, JSON.stringify(pool));
  } catch {
    /* quota */
  }
}
