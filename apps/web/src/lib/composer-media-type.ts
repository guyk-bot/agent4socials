/** Stored on MediaAsset.metadata when Post.mediaType column is missing or unreadable. */
export const COMPOSER_MEDIA_TYPE_META_KEY = 'composerMediaType';

export function mediaMetadataWithComposerType(
  base: Record<string, unknown>,
  mediaType?: string | null
): Record<string, unknown> | undefined {
  const obj = { ...base };
  if (mediaType) obj[COMPOSER_MEDIA_TYPE_META_KEY] = String(mediaType).slice(0, 50);
  return Object.keys(obj).length > 0 ? obj : undefined;
}

/** Resolve composer format (photo, story, reel, …) for publish. */
export function resolveComposerMediaType(input: {
  requestBodyType?: string | null;
  postMediaType?: string | null;
  media?: { metadata?: unknown }[];
}): string | null {
  const fromBody = input.requestBodyType?.trim();
  if (fromBody) return fromBody;
  const fromPost = input.postMediaType?.trim();
  if (fromPost) return fromPost;
  for (const m of input.media ?? []) {
    const meta = m.metadata as Record<string, unknown> | null | undefined;
    const v = meta?.[COMPOSER_MEDIA_TYPE_META_KEY];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
