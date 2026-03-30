import { instagramAdapter } from './instagram';
import { facebookAdapter } from './facebook';
import { tiktokAdapter } from './tiktok';
import { youtubeAdapter } from './youtube';
import { genericAdapter } from './generic';

type Adapter = typeof instagramAdapter;

const ADAPTERS: Record<string, Adapter> = {
  INSTAGRAM: instagramAdapter,
  FACEBOOK:  facebookAdapter,
  TIKTOK:    tiktokAdapter,
  YOUTUBE:   youtubeAdapter,
  TWITTER:   genericAdapter,
  LINKEDIN:  genericAdapter,
  PINTEREST: genericAdapter,
};

export function getAdapterForPlatform(platform: string): Adapter | null {
  return ADAPTERS[platform] ?? null;
}
