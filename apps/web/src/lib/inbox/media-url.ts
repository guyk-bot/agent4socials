/** True when a URL points at video bytes, not a raster thumbnail. */
export function isLikelyVideoMediaUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) return true;
  if (/video\//i.test(u)) return true;
  return false;
}

/** Safe still-image URL for inbox img/video poster (skips raw video files). */
export function inboxStillImageUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u || isLikelyVideoMediaUrl(u)) return null;
  return u;
}
