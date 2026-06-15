/** Most restrictive platforms first (tighter image/video limits). */
export const PLATFORM_RESTRICTIVENESS: Record<string, number> = {
  TWITTER: 1,
  LINKEDIN: 2,
  INSTAGRAM: 3,
  THREADS: 4,
  FACEBOOK: 5,
  PINTEREST: 6,
  TIKTOK: 7,
  YOUTUBE: 8,
};

export type PostMediaKind = 'feed' | 'story' | 'reel';

/** Infer a single platform code from user text (Instagram, Threads, etc.). */
export function inferPlatformFromText(text: string): string | null {
  if (/\bthreads?\b/i.test(text)) return 'THREADS';
  if (/\binstagram|\binsta\b|\big\b/i.test(text)) return 'INSTAGRAM';
  if (/\btiktok\b/i.test(text)) return 'TIKTOK';
  if (/\bfacebook|\bfb\b/i.test(text)) return 'FACEBOOK';
  if (/\byoutube\b/i.test(text)) return 'YOUTUBE';
  if (/\btwitter|\bx\.com\b/i.test(text)) return 'TWITTER';
  if (/\blinkedin\b/i.test(text)) return 'LINKEDIN';
  if (/\bpinterest\b/i.test(text)) return 'PINTEREST';
  return null;
}

export function inferPostMediaKindFromText(text: string): PostMediaKind {
  // Don't treat "text-only" + "thread" combinations as story posts
  if (/\b(text-?only|text)\b/i.test(text) && /\bthread/i.test(text)) return 'feed';
  
  // Never return 'story' for text that explicitly mentions text-only posting
  if (/\b(text-?only|just\s+text|only\s+text)\b/i.test(text)) return 'feed';
  
  if (/\bstor(y|ies)\b/i.test(text)) return 'story';
  if (/\b(reels?|shorts?)\b/i.test(text) || /\btiktok\b/i.test(text)) return 'reel';
  return 'feed';
}

/**
 * Pick the tightest platform constraint key for validation/conversion
 * (matches Composer upload behavior).
 */
export function getMostRestrictivePlatform(
  platforms: string[],
  mediaType: PostMediaKind = 'feed'
): string | undefined {
  if (!platforms.length) return undefined;

  const sortedPlatforms = platforms
    .map((p) => p.toUpperCase())
    .filter((p) => PLATFORM_RESTRICTIVENESS[p] !== undefined)
    .sort((a, b) => PLATFORM_RESTRICTIVENESS[a]! - PLATFORM_RESTRICTIVENESS[b]!);

  const primary = sortedPlatforms[0];
  if (!primary) return undefined;

  if (primary === 'INSTAGRAM' && (mediaType === 'story' || mediaType === 'reel')) {
    return 'instagram_story';
  }

  if (primary === 'YOUTUBE' && mediaType === 'reel') {
    return 'youtube_shorts';
  }

  return primary.toLowerCase();
}
