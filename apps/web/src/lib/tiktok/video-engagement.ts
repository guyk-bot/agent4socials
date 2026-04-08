/**
 * TikTok Display API video.list / video.query items: documented fields plus optional extras.
 * @see https://developers.tiktok.com/doc/tiktok-api-v2-video-object
 */

export function parseTikTokVideoEngagement(video: Record<string, unknown>): {
  shareCount: number;
  /** Present when TikTok returns a repost-style field (not in public Video Object spec; may be absent). */
  repostCount: number | null;
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
  const repostKeys = ['repost_count', 'repostCount', 'forward_count', 'forwardCount', 'reshare_count'] as const;
  let repostCount: number | null = null;
  for (const k of repostKeys) {
    const r = num(video[k]);
    if (r !== undefined) {
      repostCount = r;
      break;
    }
  }
  return { shareCount, repostCount };
}
