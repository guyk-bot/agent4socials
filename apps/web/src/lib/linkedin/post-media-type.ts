/**
 * Normalize LinkedIn post media types from REST Posts API and legacy UGC shareMediaCategory.
 */

export type LinkedInStoredMediaType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'CAROUSEL'
  | 'ARTICLE'
  | 'POLL'
  | 'DOCUMENT';

function mediaUrnKind(urn: string): 'VIDEO' | 'IMAGE' | null {
  const u = urn.toLowerCase();
  if (u.includes(':video:') || u.includes('digitalmediarecipe:feedshare-video')) return 'VIDEO';
  if (u.includes(':image:') || u.includes('digitalmediarecipe:feedshare-image')) return 'IMAGE';
  return null;
}

/** Classify REST /rest/posts element or legacy UGC payload. */
export function resolveLinkedInImportedMediaType(row: Record<string, unknown>): LinkedInStoredMediaType {
  const content = row.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    if (c.media && typeof c.media === 'object') {
      const media = c.media as Record<string, unknown>;
      const id = typeof media.id === 'string' ? media.id : '';
      const kind = id ? mediaUrnKind(id) : null;
      if (kind) return kind;
      return 'IMAGE';
    }
    if (c.multiImage) return 'CAROUSEL';
    if (c.carousel) return 'CAROUSEL';
    if (c.poll) return 'POLL';
    if (c.article) return 'ARTICLE';
    if (c.document) return 'DOCUMENT';
  }

  const sc = row.specificContent as Record<string, unknown> | undefined;
  const ugc = sc?.['com.linkedin.ugc.ShareContent'] as Record<string, unknown> | undefined;
  const category = typeof ugc?.shareMediaCategory === 'string' ? ugc.shareMediaCategory.trim().toUpperCase() : '';
  if (category === 'NONE' || category === 'NATIVE_DOCUMENT') return 'TEXT';
  if (category === 'IMAGE') return 'IMAGE';
  if (category === 'VIDEO') return 'VIDEO';
  if (category === 'ARTICLE') return 'ARTICLE';
  if (category === 'CAROUSEL') return 'CAROUSEL';

  const legacyMedia = ugc?.media;
  if (Array.isArray(legacyMedia) && legacyMedia.length > 0) {
    const first = legacyMedia[0] as { media?: string };
    const urn = typeof first?.media === 'string' ? first.media : '';
    const kind = urn ? mediaUrnKind(urn) : null;
    if (kind) return kind;
    return 'IMAGE';
  }

  return 'TEXT';
}

/** Fix stored rows (e.g. legacy IMAGE label on commentary-only posts). */
export function normalizeLinkedInStoredMediaType(
  mediaType: string | null | undefined,
  thumbnailUrl?: string | null
): LinkedInStoredMediaType {
  const mt = (mediaType ?? '').trim().toUpperCase();
  if (mt === 'TEXT' || mt === 'NONE') return 'TEXT';
  if (mt === 'VIDEO' || mt === 'REEL') return 'VIDEO';
  if (mt === 'CAROUSEL' || mt === 'MULTIIMAGE' || mt.includes('CAROUSEL')) return 'CAROUSEL';
  if (mt === 'ARTICLE') return 'ARTICLE';
  if (mt === 'POLL') return 'POLL';
  if (mt === 'DOCUMENT') return 'DOCUMENT';
  if (mt === 'IMAGE' || mt === 'PHOTO') {
    if (!(thumbnailUrl ?? '').trim()) return 'TEXT';
    return 'IMAGE';
  }
  if (!(thumbnailUrl ?? '').trim()) return 'TEXT';
  return 'IMAGE';
}
