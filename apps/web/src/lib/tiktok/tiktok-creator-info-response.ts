import type { TikTokCreatorInfoData } from '@/lib/tiktok/tiktok-publish-compliance';
import { TIKTOK_CREATOR_INFO_FALLBACK } from '@/lib/tiktok/tiktok-publish-compliance';

/** Build creator_info payload for the Post to TikTok modal when live API is slow or unavailable. */
export function buildTikTokCreatorInfoForClient(input: {
  creator?: TikTokCreatorInfoData | null;
  username?: string | null;
  profilePicture?: string | null;
}): TikTokCreatorInfoData {
  const base = input.creator ?? TIKTOK_CREATOR_INFO_FALLBACK;
  const username = (input.username ?? base.creator_username ?? '').replace(/^@/, '').trim();
  const avatar = (base.creator_avatar_url ?? input.profilePicture ?? '').trim();
  return {
    ...TIKTOK_CREATOR_INFO_FALLBACK,
    ...base,
    ...(username ? { creator_username: username } : {}),
    ...(avatar ? { creator_avatar_url: avatar } : {}),
  };
}
