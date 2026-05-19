import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  readInboxProfileCache,
  writeInboxProfileCache,
  type InboxProfileCacheEntry,
} from '@/lib/inbox/inbox-profile-cache';
import type { InboxConversationListItem } from '@/lib/inbox/inbox-db-cache';

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
  if (typeof p.profile_pic === 'string' && p.profile_pic.startsWith('http')) return p.profile_pic;
  return p.profile_picture_url ?? p.picture?.data?.url ?? null;
}

/** Page access token is required for Instagram User Profile API (IGSID → profile_pic). */
export async function resolveFacebookPageTokenForUser(userId: string): Promise<string | null> {
  try {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', status: 'connected' },
      select: { accessToken: true },
      orderBy: { updatedAt: 'desc' },
    });
    return fb?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Meta Messenger User Profile API: GET /{IGSID}?fields=name,username,profile_pic
 * @see https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile
 */
async function fetchIgUserProfileViaPageToken(
  senderId: string,
  pageToken: string
): Promise<InboxSenderProfile | null> {
  const profileRes = await axios.get<ParticipantRow & { id?: string }>(`${fbBaseUrl}/${senderId}`, {
    params: { fields: 'name,username,profile_pic', access_token: pageToken },
    timeout: 12_000,
  });
  const p = profileRes.data;
  const pictureUrl = pictureFromRow(p);
  if (!pictureUrl && !p.name && !p.username) return null;
  return { name: p.name, username: p.username, pictureUrl };
}

async function fetchIgUserProfileViaInstagramHost(
  senderId: string,
  accessToken: string
): Promise<InboxSenderProfile | null> {
  const profileRes = await axios.get<ParticipantRow & { id?: string }>(`${igBaseUrl}/${senderId}`, {
    params: {
      fields: 'name,username,profile_pic,profile_picture_url',
      access_token: accessToken,
    },
    timeout: 12_000,
  });
  const p = profileRes.data;
  const pictureUrl = pictureFromRow(p);
  if (!pictureUrl && !p.name && !p.username) return null;
  return { name: p.name, username: p.username, pictureUrl };
}

function findParticipant(
  participants: ParticipantRow[],
  senderId: string,
  username?: string
): ParticipantRow | undefined {
  const byId = participants.find((p) => p.id === senderId);
  if (byId) return byId;
  if (!username) return undefined;
  const u = username.replace(/^@/, '').toLowerCase();
  return participants.find((p) => p.username?.toLowerCase() === u);
}

function cacheProfile(senderId: string, profile: InboxSenderProfile, altId?: string): void {
  if (profile.pictureUrl || profile.name || profile.username) {
    void writeInboxProfileCache('instagram', senderId, profile);
    if (altId && altId !== senderId) void writeInboxProfileCache('instagram', altId, profile);
  }
}

/**
 * Resolve Instagram DM participant name and profile photo (conversation list + open thread).
 */
export async function resolveInstagramInboxSenderProfile(args: {
  userId: string;
  senderId: string;
  accessToken: string;
  isInstagramBusinessLogin: boolean;
  conversationId?: string;
  username?: string;
}): Promise<InboxSenderProfile | null> {
  const { userId, senderId, accessToken, isInstagramBusinessLogin, conversationId, username } = args;
  if (!senderId || !accessToken) return null;

  const cached = await readInboxProfileCache('instagram', senderId);
  if (cached?.pictureUrl) return cached;

  const pageToken = await resolveFacebookPageTokenForUser(userId);

  if (conversationId) {
    try {
      const convUrl = isInstagramBusinessLogin
        ? `${igBaseUrl}/${conversationId}`
        : `${fbBaseUrl}/${conversationId}`;
      const tokenForConv = pageToken ?? accessToken;
      const params: Record<string, string> = {
        fields: 'participants{id,name,username,profile_pic,profile_picture_url,picture}',
        access_token: tokenForConv,
      };
      if (!isInstagramBusinessLogin) params.platform = 'instagram';

      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(convUrl, {
        params,
        timeout: 10_000,
      });
      const match = findParticipant(convRes.data?.participants?.data ?? [], senderId, username);
      if (match) {
        const profile: InboxSenderProfile = {
          name: match.name,
          username: match.username,
          pictureUrl: pictureFromRow(match),
        };
        cacheProfile(senderId, profile, match.id);
        if (profile.pictureUrl) return profile;
      }
    } catch {
      /* fall through */
    }
  }

  if (pageToken) {
    try {
      const profile = await fetchIgUserProfileViaPageToken(senderId, pageToken);
      if (profile?.pictureUrl) {
        cacheProfile(senderId, profile);
        return profile;
      }
      if (profile && (profile.name || profile.username)) {
        cacheProfile(senderId, profile);
      }
    } catch {
      /* try other strategies */
    }
  }

  if (isInstagramBusinessLogin) {
    try {
      const profile = await fetchIgUserProfileViaInstagramHost(senderId, accessToken);
      if (profile) {
        cacheProfile(senderId, profile);
        if (profile.pictureUrl) return profile;
      }
    } catch {
      /* fall through */
    }
  }

  try {
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
      cacheProfile(senderId, profile, p.id);
    }
    if (profile.pictureUrl) return profile;
  } catch {
    /* ignore */
  }

  return cached ?? null;
}

/** Apply cached profile photos to conversation rows (e.g. stale DB list or Meta throttle). */
export async function mergeInboxProfileCacheIntoConversations(
  platform: 'instagram' | 'facebook',
  list: InboxConversationListItem[]
): Promise<InboxConversationListItem[]> {
  const out: InboxConversationListItem[] = [];
  for (const conv of list) {
    const senders = await Promise.all(
      conv.senders.map(async (s) => {
        if (s.pictureUrl || !s.id) return s;
        const cached = await readInboxProfileCache(platform, s.id);
        if (!cached?.pictureUrl && !cached?.name && !cached?.username) return s;
        return {
          ...s,
          pictureUrl: s.pictureUrl ?? cached.pictureUrl ?? null,
          name: s.name || cached.name,
          username: s.username || cached.username,
        };
      })
    );
    out.push({ ...conv, senders });
  }
  return out;
}
