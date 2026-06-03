/** Meta platforms that may live on different brands (e.g. Facebook on brand A, Instagram on brand B). */
export const META_BRAND_SCOPED_PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM']);

/**
 * Skip platform-wide move prompts for Meta accounts. Each Instagram/Facebook row is handled
 * individually in finishPostConnectBrandAssignment (different IG accounts can sit on different brands).
 */
export function skipBrandMovePromptForPlatform(platform: string): boolean {
  return META_BRAND_SCOPED_PLATFORMS.has(platform.toUpperCase());
}

/** @deprecated use skipBrandMovePromptForPlatform */
export function skipBrandMovePromptBeforeConnect(platform: string): boolean {
  return skipBrandMovePromptForPlatform(platform);
}
