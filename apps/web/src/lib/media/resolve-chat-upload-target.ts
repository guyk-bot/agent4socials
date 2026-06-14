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
  const inferred = inferPlatformFromText(blob);
  const platforms = inferred
    ? [inferred]
    : [...new Set(args.connectedPlatforms.map((p) => p.toUpperCase()).filter(Boolean))];

  if (!platforms.length) return {};

  const mediaKind = inferPostMediaKindFromText(blob);
  const platform = getMostRestrictivePlatform(platforms, mediaKind);
  if (!platform) return {};

  const postType = mediaKind === 'story' ? 'story' : mediaKind === 'reel' ? 'shorts' : 'feed';
  return { platform, postType };
}
