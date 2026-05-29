/** True when media has a public https URL safe to send to the API and platforms. */
export function isPersistableComposerMediaUrl(url: string): boolean {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

export type ComposerMediaReadyItem = {
  fileUrl: string;
  type: string;
  thumbnailUrl?: string;
};

export type ComposerMediaReadyInput = {
  mediaType: string;
  mediaUploading: boolean;
  thumbnailPicking: boolean;
  storyCropOpen: boolean;
  platforms: string[];
  mediaList: ComposerMediaReadyItem[];
  mediaByPlatform: Record<string, ComposerMediaReadyItem[]>;
  differentMediaPerPlatform: boolean;
};

/** User-visible reason when Post / Schedule / draft should wait. Null when ready. */
export function getComposerMediaNotReadyReason(input: ComposerMediaReadyInput): string | null {
  const {
    mediaType,
    mediaUploading,
    thumbnailPicking,
    storyCropOpen,
    platforms,
    mediaList,
    mediaByPlatform,
    differentMediaPerPlatform,
  } = input;

  if (mediaType === 'text') return null;
  if (mediaUploading) return 'Wait until your media finishes uploading.';
  if (thumbnailPicking) return 'Wait until the video thumbnail finishes saving.';
  if (storyCropOpen) return 'Finish cropping your image before posting.';

  const hasBlobInList = (list: ComposerMediaReadyItem[]) =>
    list.some(
      (m) =>
        !isPersistableComposerMediaUrl(m.fileUrl) ||
        (m.thumbnailUrl != null && m.thumbnailUrl !== '' && !isPersistableComposerMediaUrl(m.thumbnailUrl))
    );

  if (hasBlobInList(mediaList)) {
    return 'Wait until your media finishes uploading.';
  }
  for (const arr of Object.values(mediaByPlatform)) {
    if (arr?.length && hasBlobInList(arr)) {
      return 'Wait until your media finishes uploading.';
    }
  }

  const effective: ComposerMediaReadyItem[] = [];
  if (differentMediaPerPlatform) {
    for (const p of platforms) {
      const per = mediaByPlatform[p];
      const list = per && per.length > 0 ? per : mediaList;
      effective.push(...list);
    }
  } else {
    effective.push(...mediaList);
  }

  if (effective.length === 0) {
    return 'Add media before posting.';
  }

  for (const item of effective) {
    if (!isPersistableComposerMediaUrl(item.fileUrl)) {
      return 'Wait until your media finishes uploading.';
    }
    if (
      item.thumbnailUrl != null &&
      item.thumbnailUrl !== '' &&
      !isPersistableComposerMediaUrl(item.thumbnailUrl)
    ) {
      return 'Wait until the video cover image finishes uploading.';
    }
  }

  return null;
}

export function filterPersistableComposerMedia<T extends ComposerMediaReadyItem>(items: T[]): T[] {
  return items.filter((m) => isPersistableComposerMediaUrl(m.fileUrl));
}
