/** Meta platforms that may live on different brands (e.g. Facebook on brand A, Instagram on brand B). */
export const META_BRAND_SCOPED_PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM']);

/** Do not block the Connect flow when another brand already has this platform. */
export function skipBrandMovePromptBeforeConnect(platform: string): boolean {
  return META_BRAND_SCOPED_PLATFORMS.has(platform.toUpperCase());
}
