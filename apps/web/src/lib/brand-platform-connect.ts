/** Platforms where one user can connect multiple accounts (e.g. several Facebook Pages). */
export const MULTI_CONNECT_PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM']);

export function platformAllowsMultipleConnects(platform: string): boolean {
  return MULTI_CONNECT_PLATFORMS.has(platform.toUpperCase());
}
