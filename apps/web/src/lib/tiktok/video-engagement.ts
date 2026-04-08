/**
 * TikTok Display API video.list / video.query items: documented fields plus optional extras.
 * Saves may appear as favorites_count (Research API naming); we request it on video.list when supported.
 * @see https://developers.tiktok.com/doc/tiktok-api-v2-video-object
 */

export function parseTikTokVideoEngagement(video: Record<string, unknown>): {
  shareCount: number;
  /** Saves/favorites when TikTok returns a supported field (often favorites_count). */
  saveCount: number | null;
} {
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) return Math.max(0, n);
    }
    return undefined;
  };
  const shareCount = num(video.share_count) ?? 0;
  const saveKeys = [
    'favorites_count',
    'favourites_count',
    'collect_count',
    'save_count',
    'saves_count',
  ] as const;
  let saveCount: number | null = null;
  for (const k of saveKeys) {
    const s = num(video[k]);
    if (s !== undefined) {
      saveCount = s;
      break;
    }
  }
  return { shareCount, saveCount };
}

/** TikTok video object `duration` is clip length in seconds (not aggregate watch time). */
export function parseTikTokVideoDurationSec(video: Record<string, unknown>): number | null {
  const d = video.duration;
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) return Math.floor(d);
  if (typeof d === 'string' && d.trim() !== '') {
    const n = parseInt(d, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}
