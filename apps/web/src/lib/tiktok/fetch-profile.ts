import axios from 'axios';
import { mirrorExternalImageToR2, tiktokAvatarR2Key } from '@/lib/mirror-external-image-r2';
import { isTikTokAccessTokenInvalid } from '@/lib/tiktok/refresh-token';
import { parseTikTokCreatorInfoResponse } from '@/lib/tiktok/tiktok-publish-compliance';

const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const TIKTOK_CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

export function tikTokApiPayloadOk(error: { code?: unknown; message?: string } | undefined): boolean {
  if (!error || error.code == null || error.code === '') return true;
  const c = error.code;
  if (c === 'ok' || c === 'OK') return true;
  if (typeof c === 'number' && c === 0) return true;
  return String(c).toLowerCase() === 'ok';
}

function tikTokAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Best-effort TikTok display name + avatar from user.info and creator_info/query.
 * When `socialAccountId` is set, mirrors the avatar to R2 for reliable sidebar display.
 */
export async function fetchTikTokProfile(
  accessToken: string,
  opts?: { socialAccountId?: string }
): Promise<{
  username?: string;
  profilePicture?: string;
  tokenInvalid?: boolean;
}> {
  const headers = tikTokAuthHeaders(accessToken);
  let username: string | undefined;
  let profilePicture: string | undefined;

  try {
    const userRes = await axios.get<{
      data?: {
        user?: {
          display_name?: string;
          avatar_url?: string;
          avatar_url_100?: string;
          avatar_large_url?: string;
        };
      };
      error?: { code?: unknown; message?: string };
    }>(TIKTOK_USER_INFO_URL, {
      params: {
        fields: 'open_id,display_name,avatar_url,avatar_url_100,avatar_large_url',
      },
      headers,
      timeout: 15_000,
      validateStatus: () => true,
    });
    const user = userRes.data?.data?.user;
    const err = userRes.data?.error;
    if (userRes.status < 400 && tikTokApiPayloadOk(err) && user) {
      if (user.display_name?.trim()) username = user.display_name.trim();
      const pic =
        user.avatar_large_url?.trim() ||
        user.avatar_url?.trim() ||
        user.avatar_url_100?.trim();
      if (pic) profilePicture = pic;
    } else if (userRes.status >= 400) {
      if (isTikTokAccessTokenInvalid(userRes.status, err?.message)) {
        return { tokenInvalid: true };
      }
      console.warn('[TikTok] user/info HTTP', userRes.status, err?.message ?? '');
    }
  } catch (e) {
    console.warn('[TikTok] user/info profile fetch:', (e as Error)?.message?.slice(0, 120));
  }

  if (!profilePicture) {
    try {
      const creatorRes = await axios.post(TIKTOK_CREATOR_INFO_URL, {}, {
        headers,
        timeout: 15_000,
        validateStatus: () => true,
      });
      const parsed = parseTikTokCreatorInfoResponse(creatorRes.data);
      if (parsed.ok) {
        if (!username && parsed.data.creator_nickname?.trim()) {
          username = parsed.data.creator_nickname.trim();
        }
        const pic = parsed.data.creator_avatar_url?.trim();
        if (pic) profilePicture = pic;
      }
    } catch (e) {
      console.warn('[TikTok] creator_info profile fetch:', (e as Error)?.message?.slice(0, 120));
    }
  }

  if (profilePicture && opts?.socialAccountId) {
    const mirrored = await mirrorExternalImageToR2(
      profilePicture,
      tiktokAvatarR2Key(opts.socialAccountId)
    );
    if (mirrored) profilePicture = mirrored;
  }

  return { username, profilePicture };
}
