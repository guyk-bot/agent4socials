import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  readInboxProfileCache,
  writeInboxProfileCache,
  type InboxProfileCacheEntry,
} from '@/lib/inbox/inbox-profile-cache';

const igBaseUrl = 'https://graph.instagram.com/v25.0';
const fbBaseUrl = facebookGraphBaseUrl;

export type InboxSenderProfile = InboxProfileCacheEntry;

type ParticipantRow = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  profile_picture_url?: string;
  picture?: { data?: { url?: string } };
};

function pictureFromRow(p: ParticipantRow): string | null {
  return p.profile_pic ?? p.profile_picture_url ?? p.picture?.data?.url ?? null;
}

/**
 * Resolve Instagram DM participant name and profile photo (conversation list + open thread).
 */
export async function resolveInstagramInboxSenderProfile(args: {
  senderId: string;
  accessToken: string;
  isInstagramBusinessLogin: boolean;
  conversationId?: string;
}): Promise<InboxSenderProfile | null> {
  const { senderId, accessToken, isInstagramBusinessLogin, conversationId } = args;
  if (!senderId || !accessToken) return null;

  const cached = await readInboxProfileCache('instagram', senderId);
  if (cached?.pictureUrl) return cached;

  if (conversationId) {
    try {
      const convUrl = isInstagramBusinessLogin
        ? `${igBaseUrl}/${conversationId}`
        : `${fbBaseUrl}/${conversationId}`;
      const params: Record<string, string> = {
        fields: 'participants{id,name,username,profile_pic,profile_picture_url,picture}',
        access_token: accessToken,
      };
      if (!isInstagramBusinessLogin) params.platform = 'instagram';

      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(convUrl, {
        params,
        timeout: 10_000,
      });
      const match = (convRes.data?.participants?.data ?? []).find((p) => p.id === senderId);
      if (match) {
        const profile: InboxSenderProfile = {
          name: match.name,
          username: match.username,
          pictureUrl: pictureFromRow(match),
        };
        if (profile.pictureUrl || profile.name || profile.username) {
          void writeInboxProfileCache('instagram', senderId, profile);
        }
        if (profile.pictureUrl) return profile;
      }
    } catch {
      /* fall through to per-user lookup */
    }
  }

  try {
    if (isInstagramBusinessLogin) {
      const profileRes = await axios.get<ParticipantRow & { id?: string }>(
        `${igBaseUrl}/${senderId}`,
        {
          params: {
            fields: 'name,username,profile_pic,profile_picture_url,picture',
            access_token: accessToken,
          },
          timeout: 12_000,
        }
      );
      const p = profileRes.data;
      const profile: InboxSenderProfile = {
        name: p.name,
        username: p.username,
        pictureUrl: pictureFromRow(p),
      };
      if (profile.pictureUrl || profile.name || profile.username) {
        void writeInboxProfileCache('instagram', senderId, profile);
        if (p.id && p.id !== senderId) void writeInboxProfileCache('instagram', p.id, profile);
      }
      return profile.pictureUrl || profile.name || profile.username ? profile : cached ?? null;
    }

    const profileRes = await axios.get<ParticipantRow & { id?: string }>(`${fbBaseUrl}/${senderId}`, {
      params: {
        fields: 'id,name,username,profile_pic,profile_picture_url,picture.type(large)',
        access_token: accessToken,
        platform: 'instagram',
      },
      timeout: 12_000,
    });
    const p = profileRes.data;
    const profile: InboxSenderProfile = {
      name: p.name,
      username: p.username,
      pictureUrl: pictureFromRow(p),
    };
    if (profile.pictureUrl || profile.name || profile.username) {
      void writeInboxProfileCache('instagram', senderId, profile);
      if (p.id && p.id !== senderId) void writeInboxProfileCache('instagram', p.id, profile);
    }
    return profile.pictureUrl || profile.name || profile.username ? profile : cached ?? null;
  } catch {
    return cached ?? null;
  }
}
