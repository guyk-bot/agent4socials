/**
 * Threads API media_type values: TEXT_POST, IMAGE, VIDEO, CAROUSEL_ALBUM, AUDIO, REPOST_FACADE.
 * We normalize to buckets used by analytics charts and history labels.
 */

export type ThreadsFormatBucket = 'text' | 'image' | 'reels' | 'carousel';

export function normalizeThreadsMediaType(raw: string | null | undefined): string {
  const m = (raw ?? '').trim().toUpperCase();
  if (!m) return '';
  if (m === 'TEXT' || m === 'TEXT_POST') return 'TEXT';
  if (m === 'CAROUSEL' || m === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (m === 'REPOST' || m === 'REPOST_FACADE') return 'REPOST';
  return m;
}

export function classifyThreadsFormatBucket(
  mediaType: string | null | undefined,
  thumbnailUrl?: string | null
): ThreadsFormatBucket {
  const mt = normalizeThreadsMediaType(mediaType);
  if (mt === 'TEXT' || mt === 'REPOST') return 'text';
  if (mt === 'VIDEO' || mt === 'AUDIO') return 'reels';
  if (mt === 'CAROUSEL') return 'carousel';
  if (mt === 'IMAGE') return 'image';
  if (!(thumbnailUrl ?? '').trim()) return 'text';
  return 'image';
}

export function threadsFormatDisplayLabel(
  mediaType: string | null | undefined,
  thumbnailUrl?: string | null
): string {
  const bucket = classifyThreadsFormatBucket(mediaType, thumbnailUrl);
  if (bucket === 'text') return 'Text';
  if (bucket === 'reels') return 'Video';
  if (bucket === 'carousel') return 'Carousel';
  return 'Image';
}
