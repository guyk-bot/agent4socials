import { instagramAdapter } from './instagram';
import { facebookAdapter } from './facebook';
import { tiktokAdapter } from './tiktok';
import { youtubeAdapter } from './youtube';
import { genericAdapter } from './generic';
import { linkedinAdapter } from './linkedin';
import { twitterAdapter } from './twitter';

type AccountRow = {
  id: string;
  userId: string;
  platform: string;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string | null;
  credentialsJson?: unknown;
  status: string;
};

type AdapterResult = { itemsProcessed: number; partial?: boolean };

export interface Adapter {
  syncAccountOverview?:      (account: AccountRow) => Promise<AdapterResult>;
  syncRecentContent?:        (account: AccountRow) => Promise<AdapterResult>;
  syncContentMetrics?:       (account: AccountRow) => Promise<AdapterResult>;
  syncComments?:             (account: AccountRow) => Promise<AdapterResult>;
  syncMessages?:             (account: AccountRow) => Promise<AdapterResult>;
  syncAudienceDemographics?: (account: AccountRow) => Promise<AdapterResult>;
}

const ADAPTERS: Record<string, Adapter> = {
  INSTAGRAM: instagramAdapter,
  FACEBOOK:  facebookAdapter,
  TIKTOK:    tiktokAdapter,
  YOUTUBE:   youtubeAdapter,
  TWITTER:   twitterAdapter,
  LINKEDIN:  linkedinAdapter,
  PINTEREST: genericAdapter,
};

export function getAdapterForPlatform(platform: string): Adapter | null {
  return ADAPTERS[platform] ?? null;
}
