/** Platforms users can connect from iZop AI chat (matches Account page). */
export const AYSOP_CONNECT_PLATFORMS = [
  { platform: 'FACEBOOK', name: 'Facebook', slug: 'facebook' },
  { platform: 'INSTAGRAM', name: 'Instagram', slug: 'instagram' },
  { platform: 'TIKTOK', name: 'TikTok', slug: 'tiktok' },
  { platform: 'YOUTUBE', name: 'YouTube', slug: 'youtube' },
  { platform: 'TWITTER', name: 'Twitter/X', slug: 'twitter' },
  { platform: 'LINKEDIN', name: 'LinkedIn', slug: 'linkedin' },
  { platform: 'PINTEREST', name: 'Pinterest', slug: 'pinterest' },
  { platform: 'THREADS', name: 'Threads', slug: 'threads' },
] as const;

export type AysopConnectPlatformRow = (typeof AYSOP_CONNECT_PLATFORMS)[number];
