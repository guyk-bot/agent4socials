/** Staged Composer drafts opened from iZop AI chat (sessionStorage + ?aysopDraft=1). */

export const AYSOP_COMPOSER_DRAFT_SESSION_KEY = 'agent4socials_aysop_composer_draft';
export const AYSOP_COMPOSER_HREF = '/composer?aysopDraft=1';

export type AysopComposerMediaType = 'text' | 'photo' | 'video' | 'reel' | 'carousel' | 'story';

export type AysopComposerDraftPayload = {
  platforms: string[];
  content: string;
  contentByPlatform: Record<string, string>;
  differentContentPerPlatform: boolean;
  mediaType: AysopComposerMediaType;
  mediaList: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[];
  mediaByPlatform: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[]>;
  differentMediaPerPlatform: boolean;
  scheduledAt: string;
  scheduleDelivery: 'auto' | 'email_links';
  selectedHashtags: string[];
  differentHashtagsPerPlatform: boolean;
  selectedHashtagsByPlatform: Record<string, string[]>;
};

export function buildAysopComposerDraftPayload(args: {
  platforms: string[];
  caption: string;
  mediaType: AysopComposerMediaType;
  contentByPlatform?: Record<string, string>;
  differentContentPerPlatform?: boolean;
  mediaList?: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[];
  scheduledAt?: string;
  scheduleDelivery?: 'auto' | 'email_links';
}): AysopComposerDraftPayload {
  const platforms = [...new Set(args.platforms.map((p) => p.toUpperCase()))];
  return {
    platforms,
    content: args.caption,
    contentByPlatform: args.contentByPlatform ?? {},
    differentContentPerPlatform: args.differentContentPerPlatform ?? false,
    mediaType: args.mediaType,
    mediaList: args.mediaList ?? [],
    mediaByPlatform: {},
    differentMediaPerPlatform: false,
    scheduledAt: args.scheduledAt ?? '',
    scheduleDelivery: args.scheduleDelivery ?? 'auto',
    selectedHashtags: [],
    differentHashtagsPerPlatform: false,
    selectedHashtagsByPlatform: {},
  };
}

export function mediaListFromUrls(urls: string[]): { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[] {
  return urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean)
    .map((fileUrl) => ({
      fileUrl,
      type: /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(fileUrl) ? ('VIDEO' as const) : ('IMAGE' as const),
    }));
}

export function inferComposerMediaType(
  platforms: string[],
  postType?: string,
  mediaRequiredCheck: (platform: string) => boolean = () => false
): AysopComposerMediaType {
  const normalized = (postType ?? '').toLowerCase();
  if (normalized === 'text' || normalized === 'feed') {
    const allTextCapable = platforms.every((p) => !mediaRequiredCheck(p));
    if (allTextCapable) return 'text';
    return 'photo';
  }
  if (
    normalized === 'photo' ||
    normalized === 'video' ||
    normalized === 'reel' ||
    normalized === 'carousel' ||
    normalized === 'story'
  ) {
    return normalized as AysopComposerMediaType;
  }
  return platforms.some((p) => mediaRequiredCheck(p)) ? 'photo' : 'text';
}

export function stageAysopComposerDraft(payload: AysopComposerDraftPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AYSOP_COMPOSER_DRAFT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function consumeAysopComposerDraft(): AysopComposerDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AYSOP_COMPOSER_DRAFT_SESSION_KEY);
    sessionStorage.removeItem(AYSOP_COMPOSER_DRAFT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AysopComposerDraftPayload;
    if (!parsed || !Array.isArray(parsed.platforms)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseAysopComposerDraftFromSearchParams(
  params: URLSearchParams
): AysopComposerDraftPayload | null {
  const platformsRaw = params.get('platforms') ?? params.get('platform') ?? '';
  const platforms = platformsRaw
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  const caption = params.get('caption') ?? '';
  const typeRaw = (params.get('type') ?? params.get('mediaType') ?? 'photo').toLowerCase();
  if (!platforms.length && !caption) return null;
  const mediaType = (
    ['text', 'photo', 'video', 'reel', 'carousel', 'story'].includes(typeRaw)
      ? typeRaw
      : 'photo'
  ) as AysopComposerMediaType;
  return buildAysopComposerDraftPayload({
    platforms: platforms.length ? platforms : ['INSTAGRAM'],
    caption,
    mediaType,
  });
}
