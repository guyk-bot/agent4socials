/** YouTube Shorts vs long-form split (matches product max for Shorts in analytics). */
export const YOUTUBE_SHORT_MAX_DURATION_SEC = 180;

/**
 * Parse YouTube `contentDetails.duration` ISO 8601 (e.g. `PT1M30S`, `PT45.5S`, `PT2H`).
 */
export function parseYoutubeIso8601DurationSeconds(iso: string | undefined | null): number {
  if (!iso || typeof iso !== 'string') return 0;
  const t = iso.trim();
  if (!t.startsWith('PT')) return 0;
  const m = t.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$/i);
  if (!m) {
    const loose = t.match(/PT(?:(\d+)H)?(?:(\d+)M)?(\d+(?:\.\d+)?)S$/i);
    if (!loose) return 0;
    const h = Number(loose[1] ?? 0);
    const min = Number(loose[2] ?? 0);
    const sec = Number(loose[3] ?? 0);
    if (![h, min, sec].every((n) => Number.isFinite(n))) return 0;
    return h * 3600 + min * 60 + sec;
  }
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = m[3] !== undefined ? Number(m[3]) : 0;
  if (![h, min, sec].every((n) => Number.isFinite(n))) return 0;
  return h * 3600 + min * 60 + sec;
}

export type YoutubeVideoFormat = 'short' | 'long';

/**
 * Classify using API duration when possible; otherwise `#shorts` in title/description (creator signal).
 */
export function classifyYoutubeVideoFormat(params: {
  durationSec: number;
  title?: string | null;
  description?: string | null;
}): YoutubeVideoFormat {
  const { durationSec, title, description } = params;
  const blob = `${title ?? ''}\n${description ?? ''}`.toLowerCase();
  const taggedShort =
    blob.includes('#shorts') || blob.includes('#short ') || blob.includes('#short\n');

  if (durationSec > YOUTUBE_SHORT_MAX_DURATION_SEC) return 'long';
  if (durationSec > 0) return 'short';
  return taggedShort ? 'short' : 'long';
}
