import axios from 'axios';

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

type CreatorInfoBody = {
  creator_nickname?: string;
  creator_username?: string;
  creator_avatar_url?: string;
};

function parseCreatorInfoPayload(data: unknown): CreatorInfoBody | null {
  const raw = data as
    | (CreatorInfoBody & { data?: CreatorInfoBody })
    | undefined;
  if (!raw) return null;
  if (raw.creator_nickname != null || raw.creator_username != null || raw.creator_avatar_url != null) {
    return raw;
  }
  const nested = raw.data;
  if (nested?.creator_nickname != null || nested?.creator_username != null || nested?.creator_avatar_url != null) {
    return nested;
  }
  return null;
}

/**
 * Best-effort TikTok display name + avatar from user.info and creator_info/query.
 */
export async function fetchTikTokProfile(accessToken: string): Promise<{
  username?: string;
  profilePicture?: string;
}> {
  const headers = tikTokAuthHeaders(accessToken);
  let username: string | undefined;
  let profilePicture: string | undefined;

  try {
    const userRes = await axios.get<{
      data?: { user?: { display_name?: string; avatar_url?: string; avatar_large_url?: string } };
      error?: { code?: unknown; message?: string };
    }>(TIKTOK_USER_INFO_URL, {
      params: { fields: 'open_id,display_name,avatar_url,avatar_large_url' },
      headers,
      timeout: 15_000,
      validateStatus: () => true,
    });
    const user = userRes.data?.data?.user;
    const err = userRes.data?.error;
    if (userRes.status < 400 && tikTokApiPayloadOk(err) && user) {
      if (user.display_name?.trim()) username = user.display_name.trim();
      const pic = user.avatar_large_url?.trim() || user.avatar_url?.trim();
      if (pic) profilePicture = pic;
    }
  } catch (e) {
    console.warn('[TikTok] user/info profile fetch:', (e as Error)?.message?.slice(0, 120));
  }

  if (!profilePicture) {
    try {
      const creatorRes = await axios.post<{
        data?: CreatorInfoBody & { data?: CreatorInfoBody };
        error?: { code?: unknown; message?: string };
      }>(TIKTOK_CREATOR_INFO_URL, {}, {
        headers,
        timeout: 15_000,
        validateStatus: () => true,
      });
      const err = creatorRes.data?.error;
      const d = parseCreatorInfoPayload(creatorRes.data?.data);
      if (creatorRes.status < 400 && tikTokApiPayloadOk(err) && d) {
        if (!username && d.creator_nickname?.trim()) username = d.creator_nickname.trim();
        const pic = d.creator_avatar_url?.trim();
        if (pic) profilePicture = pic;
      }
    } catch (e) {
      console.warn('[TikTok] creator_info profile fetch:', (e as Error)?.message?.slice(0, 120));
    }
  }

  return { username, profilePicture };
}
