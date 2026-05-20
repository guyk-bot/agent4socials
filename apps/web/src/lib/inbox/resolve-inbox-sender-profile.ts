import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  readInboxProfileCache,
  readInboxProfileCacheByUsername,
  writeInboxProfileCache,
  type InboxProfileCacheEntry,
} from '@/lib/inbox/inbox-profile-cache';
import type { InboxConversationListItem } from '@/lib/inbox/inbox-db-cache';

const igBaseUrl = 'https://graph.instagram.com/v25.0';
const fbBaseUrl = facebookGraphBaseUrl;

/** Caps IGBusinessScopedID User Profile API calls per inbox conversations request. */
const MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST = 6;
let igScopedProfileCallsThisRequest = 0;

export function resetIgScopedProfileCallBudget(): void {
  igScopedProfileCallsThisRequest = 0;
}

async function fetchIgUserProfileViaPageTokenBudgeted(
  senderId: string,
  pageToken: string
): Promise<InboxSenderProfile | null> {
  if (igScopedProfileCallsThisRequest >= MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST) {
    return null;
  }
  igScopedProfileCallsThisRequest += 1;
  return fetchIgUserProfileViaPageToken(senderId, pageToken);
}

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
    if (senderId) void writeInboxProfileCache('instagram', senderId, profile);
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
  if (cached && (cached.pictureUrl || cached.name || cached.username)) return cached;

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

/**
 * Fetch each thread's participants edge (most reliable source for IG DM avatars).
 * Also fixes ID mismatch by attaching the sole "other" participant's photo to the sender row.
 */
export async function enrichInstagramAvatarsFromParticipants(args: {
  userId: string;
  list: InboxConversationListItem[];
  isInstagramBusinessLogin: boolean;
  accessToken: string;
  ourIds?: Set<string>;
  ourUsernames?: Set<string>;
  maxConversations?: number;
}): Promise<InboxConversationListItem[]> {
  const {
    userId,
    list,
    isInstagramBusinessLogin,
    accessToken,
    ourIds = new Set<string>(),
    ourUsernames = new Set<string>(),
    maxConversations = 12,
  } = args;

  const pageToken = await resolveFacebookPageTokenForUser(userId);
  const token = pageToken ?? accessToken;
  if (!token) return list;

  const out = list.map((c) => ({ ...c, senders: [...c.senders] }));
  const senderNeedsProfile = (s: InboxConversationListItem['senders'][number]) =>
    !s.pictureUrl || (!(s.name?.trim()) && !(s.username?.trim()));

  const toFetch = out
    .filter((c) => c.senders.some(senderNeedsProfile))
    .slice(0, maxConversations);

  for (const conv of toFetch) {
    const idx = out.findIndex((c) => c.id === conv.id);
    if (idx < 0) continue;

    // Check profile cache first — avoids a Meta API call when we already have the picture.
    const cacheResolved = await Promise.all(
      out[idx].senders.map(async (s) => {
        if (s.pictureUrl) return s;
        const cached = s.id ? await readInboxProfileCache('instagram', s.id) : null;
        const cachedByUsername = !cached?.pictureUrl && s.username
          ? await readInboxProfileCacheByUsername('instagram', s.username)
          : null;
        const best = cached?.pictureUrl ? cached : (cachedByUsername ?? cached);
        if (!best) return s;
        return { ...s, pictureUrl: s.pictureUrl ?? best.pictureUrl ?? null, name: s.name || best.name, username: s.username || best.username };
      })
    );
    const allResolved = cacheResolved.every(
      (s) => !!s.pictureUrl || !!(s.name?.trim() || s.username?.trim())
    );
    if (allResolved) {
      out[idx] = { ...out[idx], senders: cacheResolved };
      continue;
    }
    // At least one sender still missing picture — call Meta participants endpoint.
    out[idx] = { ...out[idx], senders: cacheResolved };

    try {
      const convUrl = isInstagramBusinessLogin
        ? `${igBaseUrl}/${conv.id}`
        : `${fbBaseUrl}/${conv.id}`;
      const params: Record<string, string> = {
        fields: 'participants{id,name,username,profile_pic,profile_picture_url,picture}',
        access_token: token,
      };
      if (!isInstagramBusinessLogin) params.platform = 'instagram';

      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(convUrl, {
        params,
        timeout: 10_000,
      });
      const participants = convRes.data?.participants?.data ?? [];
      const others = participants.filter((p) => {
        if (p.id && ourIds.has(p.id)) return false;
        if (p.username && ourUsernames.has(p.username.toLowerCase())) return false;
        return true;
      });

      out[idx] = {
        ...out[idx],
        senders: out[idx].senders.map((s) => {
          let p = s.id ? findParticipant(participants, s.id, s.username) : undefined;
          if (!p && others.length === 1) p = others[0];
          if (!p) return s;
          const pictureUrl = s.pictureUrl ?? pictureFromRow(p);
          const profile: InboxSenderProfile = {
            name: s.name || p.name,
            username: s.username || p.username,
            pictureUrl,
          };
          if (s.id) cacheProfile(s.id, profile, p.id);
          return { ...s, ...profile };
        }),
      };
    } catch {
      /* next conversation */
    }

    // User Profile API (page token): only for a few senders still missing a display name (IGBusinessScopedID).
    if (pageToken) {
      for (const s of out[idx].senders) {
        if (!s.id) continue;
        if (s.name?.trim() || s.username?.trim()) continue;
        if (igScopedProfileCallsThisRequest >= MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST) break;
        try {
          const profile = await fetchIgUserProfileViaPageTokenBudgeted(s.id, pageToken);
          if (!profile) continue;
          const si = out[idx].senders.findIndex((x) => x.id === s.id);
          if (si < 0) continue;
          out[idx].senders[si] = {
            ...out[idx].senders[si],
            name: out[idx].senders[si].name || profile.name,
            username: out[idx].senders[si].username || profile.username,
            pictureUrl: out[idx].senders[si].pictureUrl ?? profile.pictureUrl ?? null,
          };
          cacheProfile(s.id, profile);
        } catch {
          /* try next sender */
        }
      }
    }
  }

  return out;
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
        if (s.pictureUrl) return s;
        let cached = s.id ? await readInboxProfileCache(platform, s.id) : null;
        if (!cached?.pictureUrl && s.username) {
          cached = await readInboxProfileCacheByUsername(platform, s.username);
        }
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
