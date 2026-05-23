import { resolveComposerMediaType } from '@/lib/composer-media-type';
import {
  classifyThreadsFormatBucket,
  normalizeThreadsMediaType,
  threadsFormatDisplayLabel,
} from '@/lib/threads/post-media-type';

export type PostHistoryFormatKey = 'photo' | 'carousel' | 'story' | 'reel' | 'video' | 'text';

export type PostHistoryFormat = {
  key: PostHistoryFormatKey;
  label: string;
};

type PostLike = {
  mediaType?: string | null;
  title?: string | null;
  content?: string | null;
  media?: Array<{ type?: string; metadata?: unknown }>;
  targetPlatforms?: string[];
  targets?: Array<{ platform?: string }>;
};

const LABELS: Record<PostHistoryFormatKey, string> = {
  photo: 'Photo',
  carousel: 'Carousel',
  story: 'Story',
  reel: 'Reel',
  video: 'Video',
  text: 'Text',
};

function normalizeComposerType(raw: string | null | undefined): PostHistoryFormatKey | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'photo' || t === 'image') return 'photo';
  if (t === 'carousel') return 'carousel';
  if (t === 'story' || t === 'stories') return 'story';
  if (t === 'reel' || t === 'reels') return 'reel';
  if (t === 'video') return 'video';
  return null;
}

function platformIds(post: PostLike): string[] {
  const fromTargets = (post.targets ?? [])
    .map((t) => t.platform)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
  const fromList = (post.targetPlatforms ?? []).filter((p) => typeof p === 'string');
  return [...new Set([...fromList, ...fromTargets])];
}

/** Display label for a post row in Post History (composer format + sensible fallbacks). */
export function getPostHistoryFormat(post: PostLike): PostHistoryFormat {
  const resolved = normalizeComposerType(
    resolveComposerMediaType({
      postMediaType: post.mediaType,
      media: post.media,
    })
  );
  if (resolved) return { key: resolved, label: LABELS[resolved] };

  const media = Array.isArray(post.media) ? post.media : [];
  const mt = (post.mediaType ?? '').toUpperCase();

  if (media.length > 1 || mt.includes('CAROUSEL') || mt === 'ALBUM') {
    return { key: 'carousel', label: LABELS.carousel };
  }
  if (mt === 'STORY' || mt.includes('STORY')) {
    return { key: 'story', label: LABELS.story };
  }
  if (mt === 'REEL' || mt.includes('REEL')) {
    return { key: 'reel', label: LABELS.reel };
  }

  const firstType = (media[0]?.type ?? '').toUpperCase();
  const platforms = platformIds(post);

  if (firstType === 'VIDEO') {
    if (platforms.some((p) => p === 'TIKTOK' || p === 'YOUTUBE')) {
      return { key: 'reel', label: LABELS.reel };
    }
    return { key: 'video', label: LABELS.video };
  }

  if (firstType === 'IMAGE' || firstType === 'PHOTO' || media.length === 1) {
    return { key: 'photo', label: LABELS.photo };
  }

  if (media.length === 0 && !(post.title?.trim() || post.content?.trim())) {
    return { key: 'text', label: LABELS.text };
  }

  if (media.length === 0) {
    return { key: 'text', label: LABELS.text };
  }

  return { key: 'photo', label: LABELS.photo };
}

export function isPostHistoryVerticalThumb(format: PostHistoryFormat): boolean {
  return format.key === 'reel' || format.key === 'story';
}

export function normalizeAnalyticsPlatform(platform?: string | null): string {
  const plat = (platform ?? '').trim().toUpperCase();
  if (plat === 'X') return 'TWITTER';
  if (plat === 'META') return 'FACEBOOK';
  return plat;
}

/** Synced/imported posts on platform dashboards (Threads, X, LinkedIn, Facebook text). */
export function isAnalyticsTextOnlyPost(post: {
  platform?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
}): boolean {
  const plat = normalizeAnalyticsPlatform(post.platform);
  const mt = (post.mediaType ?? '').trim().toUpperCase();
  const thumb = (post.thumbnailUrl ?? '').trim();

  const textCapable = plat === 'TWITTER' || plat === 'X' || plat === 'THREADS' || plat === 'LINKEDIN' || plat === 'FACEBOOK';
  if (!textCapable) return false;

  if (mt === 'TEXT' || mt === 'NOTE') return true;

  const hasVisualMedia =
    mt.includes('VIDEO') ||
    mt.includes('REEL') ||
    mt === 'IMAGE' ||
    mt === 'PHOTO' ||
    mt.includes('CAROUSEL') ||
    mt.includes('ALBUM') ||
    mt === 'STORY' ||
    mt === 'GIF' ||
    mt === 'ANIMATED_GIF';

  if (hasVisualMedia) return false;

  if (plat === 'TWITTER' || plat === 'X') return !thumb;

  if (plat === 'THREADS') {
    const normalized = normalizeThreadsMediaType(post.mediaType);
    if (normalized === 'TEXT' || normalized === 'REPOST') return true;
    return !thumb && (normalized === '' || normalized === 'TEXT');
  }

  if (plat === 'LINKEDIN') {
    if (mt === 'TEXT' || mt === 'NONE') return true;
    if (!thumb && (mt === 'IMAGE' || !mt || mt === 'POST' || mt === 'STATUS')) return true;
    return false;
  }

  if (plat === 'FACEBOOK') return !thumb && (!mt || mt === 'POST' || mt === 'STATUS' || mt === 'TEXT');

  return false;
}

/** Content History / analytics table Type column (Text for text-only on X, Threads, LinkedIn, Facebook). */
export function analyticsPostTypeLabel(
  post: { platform?: string | null; mediaType?: string | null; thumbnailUrl?: string | null },
  baseType: 'Story' | 'Reel' | 'Post' = 'Post'
): string {
  const plat = normalizeAnalyticsPlatform(post.platform);
  if (plat === 'YOUTUBE') return 'Video';
  if (baseType === 'Story') return 'Story';
  if (baseType === 'Reel') return 'Reel';
  if (isAnalyticsTextOnlyPost(post)) return 'Text';
  if (plat === 'THREADS') {
    return threadsFormatDisplayLabel(post.mediaType, post.thumbnailUrl);
  }
  const mt = (post.mediaType ?? '').trim().toUpperCase();
  if (mt.includes('CAROUSEL') || mt === 'ALBUM') return 'Carousel';
  if (mt === 'IMAGE' || mt === 'PHOTO') return 'Image';
  if (mt === 'VIDEO') return 'Video';
  return baseType;
}

export type PostHistoryFormatFilterValue = 'ALL' | PostHistoryFormatKey;

export const POST_HISTORY_FORMAT_FILTER_OPTIONS: { value: PostHistoryFormatFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All formats' },
  { value: 'photo', label: 'Photo' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'story', label: 'Story' },
  { value: 'reel', label: 'Reel' },
  { value: 'video', label: 'Video' },
  { value: 'text', label: 'Text' },
];
