import axios from 'axios';
import { parseYoutubeIso8601DurationSeconds } from '@/lib/youtube-video-format';

export type YtVideoStatsRow = {
  canonicalId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSec: number;
  title: string;
  description: string;
  /** False when YouTube omitted `viewCount` on the statistics object (do not overwrite DB with 0). */
  hasViewCount: boolean;
  hasLikeCount: boolean;
  hasCommentCount: boolean;
};

/**
 * Batch `videos.list` (snippet, statistics, contentDetails). Map keys are lowercase video ids for
 * case-insensitive lookup against `ImportedPost.platformPostId`.
 */
export async function fetchYoutubeVideoStatsByIdMap(
  accessToken: string,
  videoIds: string[]
): Promise<Map<string, YtVideoStatsRow>> {
  const out = new Map<string, YtVideoStatsRow>();
  const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const statsRes = await axios.get<{
        items?: Array<{
          id: string;
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails?: { duration?: string };
          snippet?: { title?: string; description?: string };
        }>;
        error?: { message?: string };
      }>('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'snippet,statistics,contentDetails', id: batch.join(',') },
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
        timeout: 14_000,
      });
      if (statsRes.status !== 200 || statsRes.data?.error) continue;
      for (const v of statsRes.data?.items ?? []) {
        const id = v.id;
        if (!id) continue;
        const st = v.statistics ?? {};
        const hasViewCount =
          Object.prototype.hasOwnProperty.call(st, 'viewCount') &&
          st.viewCount !== undefined &&
          String(st.viewCount).trim() !== '';
        const hasLikeCount =
          Object.prototype.hasOwnProperty.call(st, 'likeCount') &&
          st.likeCount !== undefined &&
          String(st.likeCount).trim() !== '';
        const hasCommentCount =
          Object.prototype.hasOwnProperty.call(st, 'commentCount') &&
          st.commentCount !== undefined &&
          String(st.commentCount).trim() !== '';
        const viewCount = hasViewCount ? parseInt(String(st.viewCount), 10) || 0 : 0;
        const likeCount = hasLikeCount ? parseInt(String(st.likeCount), 10) || 0 : 0;
        const commentCount = hasCommentCount ? parseInt(String(st.commentCount), 10) || 0 : 0;
        const durationSec = parseYoutubeIso8601DurationSeconds(v.contentDetails?.duration);
        const row: YtVideoStatsRow = {
          canonicalId: id,
          viewCount,
          likeCount,
          commentCount,
          durationSec,
          title: v.snippet?.title ?? '',
          description: v.snippet?.description ?? '',
          hasViewCount,
          hasLikeCount,
          hasCommentCount,
        };
        out.set(id.toLowerCase(), row);
      }
    } catch (e) {
      console.warn('[YouTube] videos.list batch:', (e as Error)?.message ?? e);
    }
  }
  return out;
}
