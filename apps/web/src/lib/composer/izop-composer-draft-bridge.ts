/** Staged Composer drafts opened from iZop AI chat (sessionStorage + ?izopDraft=1). */

export const IZOP_COMPOSER_DRAFT_SESSION_KEY = 'agent4socials_izop_composer_draft';
export const IZOP_COMPOSER_HREF = '/composer?izopDraft=1';

export type IzopComposerMediaType = 'text' | 'photo' | 'video' | 'reel' | 'carousel' | 'story';

export type IzopComposerDraftPayload = {
  platforms: string[];
  content: string;
  contentByPlatform: Record<string, string>;
  differentContentPerPlatform: boolean;
  mediaType: IzopComposerMediaType;
  mediaList: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[];
  mediaByPlatform: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[]>;
  differentMediaPerPlatform: boolean;
  scheduledAt: string;
  scheduleDelivery: 'auto' | 'email_links';
  selectedHashtags: string[];
  differentHashtagsPerPlatform: boolean;
  selectedHashtagsByPlatform: Record<string, string[]>;
};

export function buildIzopComposerDraftPayload(args: {
  platforms: string[];
  caption: string;
  mediaType: IzopComposerMediaType;
  contentByPlatform?: Record<string, string>;
  differentContentPerPlatform?: boolean;
  mediaList?: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[];
  scheduledAt?: string;
  scheduleDelivery?: 'auto' | 'email_links';
}): IzopComposerDraftPayload {
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
): IzopComposerMediaType {
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
    return normalized as IzopComposerMediaType;
  }
  return platforms.some((p) => mediaRequiredCheck(p)) ? 'photo' : 'text';
}

export function stageIzopComposerDraft(payload: IzopComposerDraftPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(IZOP_COMPOSER_DRAFT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function consumeIzopComposerDraft(): IzopComposerDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem(IZOP_COMPOSER_DRAFT_SESSION_KEY) ??
      sessionStorage.getItem('agent4socials_aysop_composer_draft');
    sessionStorage.removeItem(IZOP_COMPOSER_DRAFT_SESSION_KEY);
    sessionStorage.removeItem('agent4socials_aysop_composer_draft');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IzopComposerDraftPayload;
    if (!parsed || !Array.isArray(parsed.platforms)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseIzopComposerDraftFromSearchParams(
  params: URLSearchParams
): IzopComposerDraftPayload | null {
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
  ) as IzopComposerMediaType;
  return buildIzopComposerDraftPayload({
    platforms: platforms.length ? platforms : ['INSTAGRAM'],
    caption,
    mediaType,
  });
}
