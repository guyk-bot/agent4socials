/**
 * URL to use in <img src> for a connected account avatar.
 * TikTok CDN URLs often fail in the browser (hotlink / referrer rules); proxy via our API.
 */
export function avatarDisplayUrl(
  platform: string | null | undefined,
  url: string | null | undefined
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const plat = (platform ?? '').toUpperCase();
  if (plat === 'TIKTOK' || /tiktokcdn\.com/i.test(trimmed)) {
    return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
