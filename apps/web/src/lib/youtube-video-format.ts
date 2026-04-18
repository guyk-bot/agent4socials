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
 * Public URL YouTube uses for Shorts (`/shorts/VIDEO_ID`) vs standard watch (`/watch?v=VIDEO_ID`).
 * @see https://www.youtube.com/shorts/ (path contains `shorts` plus the 11-char video id)
 *
 * Note: We also persist `youtubeShortsPageUrl` with this shape for **every** upload as a convenience
 * link — do **not** infer Shorts vs long-form from that field alone (use playlist index, creator
 * signals, or a user-facing permalink whose path is `/shorts/…`).
 */
export function buildYoutubePrimaryPermalink(canonicalVideoId: string, format: YoutubeVideoFormat): string {
  const id = String(canonicalVideoId ?? '').trim();
  if (!id) return 'https://www.youtube.com/watch?v=';
  if (format === 'short') return `https://www.youtube.com/shorts/${id}`;
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Deliberate Shorts markers in title/description. Token-based so we do not match "not #shorts" substrings
 * or "#short" inside "#shorts". Used only when the Shorts playlist index is missing or unavailable.
 */
export function hasYoutubeShortsCreatorSignals(title?: string | null, description?: string | null): boolean {
  const blob = `${title ?? ''}\n${description ?? ''}`;
  if (!blob.trim()) return false;
  if (/\byoutube\.com\/shorts\/[a-z0-9_-]{11}\b/i.test(blob)) return true;

  const stripEdges = (s: string) =>
    s.replace(/^[\s"'`([{<]+/g, '').replace(/[.,!?;:)}\]'">]+$/g, '');

  for (const line of blob.split(/\r?\n/)) {
    const words = line.split(/[\s,]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = stripEdges(words[i]!);
      if (!/^#shorts$/i.test(w) && !/^#short$/i.test(w)) continue;
      const prev = stripEdges(words[i - 1] ?? '').toLowerCase();
      if (prev === 'not' || prev === 'no') continue;
      return true;
    }
  }
  return false;
}

/**
 * Shorts vs long-form. YouTube allows regular uploads under 3 minutes — duration alone is not enough.
 *
 * - `inChannelShortsPlaylist === true` → Short (channel Shorts shelf).
 * - `inChannelShortsPlaylist === false` → **long-form** (index succeeded and video is not on the shelf; do not
 *   override with #shorts in description — creators often tag long uploads for reach).
 * - `inChannelShortsPlaylist === undefined` → use strict creator signals only; else long-form.
 * - Over max Shorts length → always long-form.
 */
export function classifyYoutubeVideoFormat(params: {
  durationSec: number;
  title?: string | null;
  description?: string | null;
  /** True/false only when Shorts playlist was fetched successfully; undefined when index unavailable. */
  inChannelShortsPlaylist?: boolean;
}): YoutubeVideoFormat {
  const { durationSec, title, description, inChannelShortsPlaylist } = params;
  if (durationSec > YOUTUBE_SHORT_MAX_DURATION_SEC) return 'long';
  if (inChannelShortsPlaylist === true) return 'short';
  if (inChannelShortsPlaylist === false) return 'long';

  if (hasYoutubeShortsCreatorSignals(title, description)) return 'short';
  return 'long';
}
