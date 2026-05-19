/** R2-mirrored TikTok avatars use this path; safe to detect on the client without S3 env. */
function isMirroredTikTokAvatarUrl(url: string): boolean {
  try {
    return new URL(url).pathname.includes('/avatars/tiktok/');
  } catch {
    return false;
  }
}

/**
 * URL to use in <img src> for a connected account avatar.
 * TikTok CDN URLs often fail in the browser (hotlink / referrer rules); proxy via our API.
 * Avatars mirrored to R2 are returned as-is (stable public URL).
 */
export function avatarDisplayUrl(
  platform: string | null | undefined,
  url: string | null | undefined
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (isMirroredTikTokAvatarUrl(trimmed)) return trimmed;
  const plat = (platform ?? '').toUpperCase();
  if (plat === 'TIKTOK' || /tiktokcdn|tiktokv\.com|byteimg\.com|muscdn\.com/i.test(trimmed)) {
    return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
