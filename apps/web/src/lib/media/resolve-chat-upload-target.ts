import {
  getMostRestrictivePlatform,
  inferPlatformFromText,
  inferPostMediaKindFromText,
} from '@/lib/media/platform-target';

export function resolveChatUploadTarget(args: {
  messageTexts: string[];
  inputText?: string;
  connectedPlatforms: string[];
}): { platform?: string; postType?: 'feed' | 'story' | 'shorts' } {
  const blob = [...args.messageTexts, args.inputText ?? ''].filter(Boolean).join(' ');
  const threadsInText = /\bthreads?\b/i.test(blob);
  const inferred = inferPlatformFromText(blob);
  const platforms = inferred
    ? [inferred]
    : [...new Set(args.connectedPlatforms.map((p) => p.toUpperCase()).filter(Boolean))];

  if (!platforms.length) return {};

  const mediaKind = inferPostMediaKindFromText(blob);
  const platform = getMostRestrictivePlatform(platforms, mediaKind);
  if (!platform) return {};

  // Threads IG Story cross-share uses feed media specs; "story" in chat text must not
  // tighten validation to instagram_story when the target platform is Threads.
  if (threadsInText || platform === 'threads') {
    return { platform: 'threads', postType: 'feed' };
  }

  const postType =
    mediaKind === 'story' ? 'story' : mediaKind === 'reel' ? 'shorts' : 'feed';
  return { platform, postType };
}
