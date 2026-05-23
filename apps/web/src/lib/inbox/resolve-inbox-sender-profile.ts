import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import {
  readInboxProfileCache,
  readInboxProfileCacheByUsername,
  writeInboxProfileCache,
  type InboxProfileCacheEntry,
} from '@/lib/inbox/inbox-profile-cache';
import type { InboxCommentRow, InboxConversationListItem } from '@/lib/inbox/inbox-db-cache';
import {
  noteMetaUsageFromHeaders,
  shouldAllowMetaInboxProfileEnrichment,
} from '@/lib/meta-usage-guard';

const igBaseUrl = 'https://graph.instagram.com/v25.0';
const fbBaseUrl = facebookGraphBaseUrl;

/** Caps IGBusinessScopedID User Profile API calls per inbox conversations request. */
const DEFAULT_MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST = 3;
let maxIgScopedProfileCallsThisRequest = DEFAULT_MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST;

/** Meta user / IGSID node ids are numeric strings (10–20 digits). Avoid InvalidID on bad ids. */
export function isLikelyMetaScopedUserId(id: string | undefined | null): boolean {
  if (!id) return false;
  const t = id.trim();
  return /^\d{10,20}$/.test(t);
}
let igScopedProfileCallsThisRequest = 0;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchInstagramConversationParticipants(args: {
  conversationId: string;
  isInstagramBusinessLogin: boolean;
  accessToken: string;
  pageToken: string | null;
}): Promise<ParticipantRow[]> {
  const { conversationId, isInstagramBusinessLogin, accessToken, pageToken } = args;
  const fields = 'participants{id,name,username,profile_pic,profile_picture_url,picture}';
  const attempts: Array<{ url: string; params: Record<string, string> }> = [];
  if (isInstagramBusinessLogin) {
    attempts.push({
      url: `${igBaseUrl}/${conversationId}`,
      params: { fields, access_token: accessToken },
    });
    if (pageToken) {
      attempts.push({
        url: `${fbBaseUrl}/${conversationId}`,
        params: { fields, access_token: pageToken, platform: 'instagram' },
      });
    }
  } else {
    attempts.push({
      url: `${fbBaseUrl}/${conversationId}`,
      params: { fields, access_token: accessToken, platform: 'instagram' },
    });
    if (pageToken && pageToken !== accessToken) {
      attempts.push({
        url: `${fbBaseUrl}/${conversationId}`,
        params: { fields, access_token: pageToken, platform: 'instagram' },
      });
    }
  }
  for (const attempt of attempts) {
    try {
      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(attempt.url, {
        params: attempt.params,
        timeout: 10_000,
      });
      const participants = convRes.data?.participants?.data ?? [];
      if (participants.length > 0) return participants;
    } catch {
      /* try next Meta path */
    }
  }
  return [];
}

export function resetIgScopedProfileCallBudget(): void {
  igScopedProfileCallsThisRequest = 0;
  maxIgScopedProfileCallsThisRequest = DEFAULT_MAX_IG_SCOPED_PROFILE_CALLS_PER_REQUEST;
}

/** Raise the per-request IGBusinessScopedID budget (e.g. one-shot inbox full enrich). */
export function setIgScopedProfileCallBudgetForRequest(maxCalls: number): void {
  igScopedProfileCallsThisRequest = 0;
  maxIgScopedProfileCallsThisRequest = Math.max(1, Math.min(maxCalls, 12));
}

async function fetchIgUserProfileViaPageTokenBudgeted(
  senderId: string,
  pageToken: string
): Promise<InboxSenderProfile | null> {
  if (igScopedProfileCallsThisRequest >= maxIgScopedProfileCallsThisRequest) {
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
  if (!isLikelyMetaScopedUserId(senderId)) return null;
  const profileRes = await axios.get<ParticipantRow & { id?: string }>(`${fbBaseUrl}/${senderId}`, {
    params: { fields: 'name,username,profile_pic', access_token: pageToken },
    timeout: 12_000,
  });
  noteMetaUsageFromHeaders(profileRes.headers);
  const p = profileRes.data;
  const pictureUrl = pictureFromRow(p);
  if (!pictureUrl && !p.name && !p.username) return null;
  return { name: p.name, username: p.username, pictureUrl };
}

async function fetchIgUserProfileViaInstagramHost(
  senderId: string,
  accessToken: string
): Promise<InboxSenderProfile | null> {
  if (!isLikelyMetaScopedUserId(senderId)) return null;
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

function cacheProfile(
  platform: 'instagram' | 'facebook',
  senderId: string,
  profile: InboxSenderProfile,
  altId?: string
): void {
  if (profile.pictureUrl || profile.name || profile.username) {
    if (senderId) void writeInboxProfileCache(platform, senderId, profile);
    if (altId && altId !== senderId) void writeInboxProfileCache(platform, altId, profile);
  }
}

function cacheInstagramProfile(senderId: string, profile: InboxSenderProfile, altId?: string): void {
  cacheProfile('instagram', senderId, profile, altId);
}

function cacheFacebookProfile(senderId: string, profile: InboxSenderProfile, altId?: string): void {
  cacheProfile('facebook', senderId, profile, altId);
}

async function fetchFacebookUserProfileNode(
  senderId: string,
  accessToken: string
): Promise<InboxSenderProfile | null> {
  if (!isLikelyMetaScopedUserId(senderId)) return null;
  const profileRes = await axios.get<{
    name?: string;
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
    picture?: { data?: { url?: string } };
  }>(`${fbBaseUrl}/${senderId}`, {
    params: { fields: 'name,first_name,last_name,profile_pic,picture.type(large)', access_token: accessToken },
    timeout: 12_000,
  });
  noteMetaUsageFromHeaders(profileRes.headers);
  const v = profileRes.data;
  const name = v.name || [v.first_name, v.last_name].filter(Boolean).join(' ').trim() || undefined;
  const pictureUrl = v.profile_pic ?? v.picture?.data?.url ?? null;
  if (!pictureUrl && !name) return null;
  return { name, pictureUrl };
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
  /** Inbox open: always resolve names/avatars (ignore Meta usage throttle). */
  forceEnrich?: boolean;
}): Promise<InboxSenderProfile | null> {
  const { userId, senderId, accessToken, isInstagramBusinessLogin, conversationId, username } = args;
  const forceEnrich = args.forceEnrich === true;
  if (!senderId || !accessToken) return null;

  const cached = await readInboxProfileCache('instagram', senderId);
  if (cached?.pictureUrl) return cached;
  if (!forceEnrich && !shouldAllowMetaInboxProfileEnrichment()) {
    return cached && (cached.name || cached.username) ? cached : null;
  }
  if (!isLikelyMetaScopedUserId(senderId)) return cached ?? null;

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
        cacheInstagramProfile(senderId, profile, match.id);
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
        cacheInstagramProfile(senderId, profile);
        return profile;
      }
      if (profile && (profile.name || profile.username)) {
        cacheInstagramProfile(senderId, profile);
      }
    } catch {
      /* try other strategies */
    }
  }

  if (isInstagramBusinessLogin) {
    try {
      const profile = await fetchIgUserProfileViaInstagramHost(senderId, accessToken);
      if (profile) {
        cacheInstagramProfile(senderId, profile);
        if (profile.pictureUrl || profile.name || profile.username) return profile;
      }
    } catch {
      /* fall through */
    }
  }

  return cached ?? null;
}

/**
 * Resolve Facebook Messenger participant name and profile photo (conversation list + open thread).
 */
export async function resolveFacebookInboxSenderProfile(args: {
  senderId: string;
  accessToken: string;
  conversationId?: string;
  /** Inbox open: always resolve avatars (ignore Meta usage throttle). */
  forceEnrich?: boolean;
}): Promise<InboxSenderProfile | null> {
  const { senderId, accessToken, conversationId } = args;
  const forceEnrich = args.forceEnrich === true;
  if (!senderId || !accessToken) return null;

  const cached = await readInboxProfileCache('facebook', senderId);
  if (cached?.pictureUrl) return cached;
  if (!forceEnrich && !shouldAllowMetaInboxProfileEnrichment()) {
    return cached && (cached.name || cached.username) ? cached : null;
  }
  if (!isLikelyMetaScopedUserId(senderId)) return cached ?? null;

  if (conversationId) {
    try {
      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(
        `${fbBaseUrl}/${conversationId}`,
        {
          params: {
            fields: 'participants{id,name,username,profile_pic,profile_picture_url,picture}',
            access_token: accessToken,
          },
          timeout: 10_000,
        }
      );
      const match = findParticipant(convRes.data?.participants?.data ?? [], senderId);
      if (match) {
        const profile: InboxSenderProfile = {
          name: match.name,
          username: match.username,
          pictureUrl: pictureFromRow(match),
        };
        cacheFacebookProfile(senderId, profile, match.id);
        if (profile.pictureUrl) return profile;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const profile = await fetchFacebookUserProfileNode(senderId, accessToken);
    if (profile) {
      cacheFacebookProfile(senderId, profile);
      if (profile.pictureUrl || profile.name) return profile;
    }
  } catch {
    /* fall through */
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
  forceEnrich?: boolean;
}): Promise<InboxConversationListItem[]> {
  const {
    userId,
    list,
    isInstagramBusinessLogin,
    accessToken,
    ourIds = new Set<string>(),
    ourUsernames = new Set<string>(),
    maxConversations = 4,
    forceEnrich = false,
  } = args;

  if (!forceEnrich && !shouldAllowMetaInboxProfileEnrichment()) return list;

  const pageToken = await resolveFacebookPageTokenForUser(userId);
  const token = pageToken ?? accessToken;
  if (!token) return list;

  const out = list.map((c) => ({ ...c, senders: [...c.senders] }));
  const senderNeedsPicture = (s: InboxConversationListItem['senders'][number]) => !s.pictureUrl;
  const senderNeedsIdentity = (s: InboxConversationListItem['senders'][number]) =>
    !(s.name?.trim() || s.username?.trim());
  const convNeedsEnrich = (c: InboxConversationListItem) =>
    c.senders.length === 0 ||
    c.senders.some((s) => senderNeedsPicture(s) || senderNeedsIdentity(s));

  const toFetch = out.filter(convNeedsEnrich).slice(0, maxConversations);

  const enriched = await mapWithConcurrency(toFetch, forceEnrich ? 8 : 2, async (conv) => {
    let senders = [...(out.find((c) => c.id === conv.id)?.senders ?? conv.senders)];

    const cacheResolved = await Promise.all(
      senders.map(async (s) => {
        if (s.pictureUrl) return s;
        const cached = s.id ? await readInboxProfileCache('instagram', s.id) : null;
        const cachedByUsername = !cached?.pictureUrl && s.username
          ? await readInboxProfileCacheByUsername('instagram', s.username)
          : null;
        const best = cached?.pictureUrl ? cached : (cachedByUsername ?? cached);
        if (!best) return s;
        return {
          ...s,
          pictureUrl: s.pictureUrl ?? best.pictureUrl ?? null,
          name: s.name || best.name,
          username: s.username || best.username,
        };
      })
    );
    senders = cacheResolved;
    if (cacheResolved.every((s) => !!s.pictureUrl && !!(s.name?.trim() || s.username?.trim()))) {
      return { id: conv.id, senders };
    }

    const participants = await fetchInstagramConversationParticipants({
      conversationId: conv.id,
      isInstagramBusinessLogin,
      accessToken,
      pageToken,
    });
    if (participants.length > 0) {
      const others = participants.filter((p) => {
        if (p.id && ourIds.has(p.id)) return false;
        if (p.username && ourUsernames.has(p.username.toLowerCase())) return false;
        return true;
      });
      senders =
        senders.length > 0
          ? senders.map((s) => {
              let p = s.id ? findParticipant(participants, s.id, s.username) : undefined;
              if (!p && others.length === 1) p = others[0];
              if (!p) return s;
              const pictureUrl = s.pictureUrl ?? pictureFromRow(p);
              const profile: InboxSenderProfile = {
                name: s.name || p.name,
                username: s.username || p.username,
                pictureUrl,
              };
              if (s.id) cacheInstagramProfile(s.id, profile, p.id);
              return { ...s, ...profile };
            })
          : others.slice(0, 1).map((p) => {
              const pictureUrl = pictureFromRow(p);
              const profile: InboxSenderProfile = {
                name: p.name,
                username: p.username,
                pictureUrl,
              };
              if (p.id) cacheInstagramProfile(p.id, profile);
              return {
                id: p.id,
                name: p.name,
                username: p.username,
                pictureUrl,
              };
            });
    }

    if (pageToken) {
      for (const s of senders) {
        if (!s.id || !isLikelyMetaScopedUserId(s.id)) continue;
        if (s.pictureUrl && (s.name?.trim() || s.username?.trim())) continue;
        if (!forceEnrich && igScopedProfileCallsThisRequest >= maxIgScopedProfileCallsThisRequest) break;
        try {
          const profile = forceEnrich
            ? await fetchIgUserProfileViaPageToken(s.id, pageToken)
            : await fetchIgUserProfileViaPageTokenBudgeted(s.id, pageToken);
          if (!profile) continue;
          const si = senders.findIndex((x) => x.id === s.id);
          if (si < 0) continue;
          senders[si] = {
            ...senders[si],
            name: senders[si].name || profile.name,
            username: senders[si].username || profile.username,
            pictureUrl: senders[si].pictureUrl ?? profile.pictureUrl ?? null,
          };
          cacheInstagramProfile(s.id, profile);
        } catch {
          /* try next sender */
        }
      }
    }

  if (isInstagramBusinessLogin) {
      for (const s of senders) {
        if (!s.id || !isLikelyMetaScopedUserId(s.id)) continue;
        if (s.pictureUrl && (s.name?.trim() || s.username?.trim())) continue;
        try {
          const profile = await fetchIgUserProfileViaInstagramHost(s.id, accessToken);
          if (!profile) continue;
          const si = senders.findIndex((x) => x.id === s.id);
          if (si < 0) continue;
          senders[si] = {
            ...senders[si],
            name: senders[si].name || profile.name,
            username: senders[si].username || profile.username,
            pictureUrl: senders[si].pictureUrl ?? profile.pictureUrl ?? null,
          };
          cacheInstagramProfile(s.id, profile);
        } catch {
          /* try next sender */
        }
      }
    }

    return { id: conv.id, senders };
  });

  for (const row of enriched) {
    const idx = out.findIndex((c) => c.id === row.id);
    if (idx >= 0) out[idx] = { ...out[idx], senders: row.senders };
  }

  return out;
}

/**
 * Fetch each Facebook Messenger thread's participants edge for avatars.
 */
export async function enrichFacebookAvatarsFromParticipants(args: {
  list: InboxConversationListItem[];
  accessToken: string;
  ourIds?: Set<string>;
  maxConversations?: number;
  forceEnrich?: boolean;
}): Promise<InboxConversationListItem[]> {
  const { list, accessToken, ourIds = new Set<string>(), maxConversations = 4, forceEnrich = false } = args;
  if (!accessToken) return list;
  if (!forceEnrich && !shouldAllowMetaInboxProfileEnrichment()) return list;

  const out = list.map((c) => ({ ...c, senders: [...c.senders] }));
  const senderNeedsProfile = (s: InboxConversationListItem['senders'][number]) => !s.pictureUrl;

  const toFetch = out
    .filter((c) => c.senders.length === 0 || c.senders.some(senderNeedsProfile))
    .slice(0, maxConversations);

  for (const conv of toFetch) {
    const idx = out.findIndex((c) => c.id === conv.id);
    if (idx < 0) continue;

    const cacheResolved = await Promise.all(
      out[idx].senders.map(async (s) => {
        if (s.pictureUrl) return s;
        const cached = s.id ? await readInboxProfileCache('facebook', s.id) : null;
        if (!cached?.pictureUrl) return s;
        return {
          ...s,
          pictureUrl: cached.pictureUrl ?? null,
          name: s.name || cached.name,
          username: s.username || cached.username,
        };
      })
    );
    if (cacheResolved.every((s) => !!s.pictureUrl)) {
      out[idx] = { ...out[idx], senders: cacheResolved };
      continue;
    }
    out[idx] = { ...out[idx], senders: cacheResolved };

    try {
      const convRes = await axios.get<{ participants?: { data?: ParticipantRow[] } }>(
        `${fbBaseUrl}/${conv.id}`,
        {
          params: {
            fields: 'participants{id,name,username,profile_pic,profile_picture_url,picture}',
            access_token: accessToken,
          },
          timeout: 10_000,
        }
      );
      const participants = convRes.data?.participants?.data ?? [];
      const others = participants.filter((p) => p.id && !ourIds.has(p.id));

      out[idx] = {
        ...out[idx],
        senders:
          out[idx].senders.length > 0
            ? out[idx].senders.map((s) => {
                let p = s.id ? findParticipant(participants, s.id, s.username) : undefined;
                if (!p && others.length === 1) p = others[0];
                if (!p) return s;
                const pictureUrl = s.pictureUrl ?? pictureFromRow(p);
                const profile: InboxSenderProfile = {
                  name: s.name || p.name,
                  username: s.username || p.username,
                  pictureUrl,
                };
                if (s.id) cacheFacebookProfile(s.id, profile, p.id);
                return { ...s, ...profile };
              })
            : others.length > 0
              ? others.slice(0, 1).map((p) => {
                  const pictureUrl = pictureFromRow(p);
                  const profile: InboxSenderProfile = {
                    name: p.name,
                    username: p.username,
                    pictureUrl,
                  };
                  if (p.id) cacheFacebookProfile(p.id, profile);
                  return {
                    id: p.id,
                    name: p.name,
                    username: p.username,
                    pictureUrl,
                  };
                })
              : out[idx].senders,
      };
    } catch {
      /* next conversation */
    }

    for (const s of out[idx].senders) {
      if (s.pictureUrl || !s.id || !isLikelyMetaScopedUserId(s.id)) continue;
      try {
        const profile = await fetchFacebookUserProfileNode(s.id, accessToken);
        if (!profile?.pictureUrl) continue;
        const si = out[idx].senders.findIndex((x) => x.id === s.id);
        if (si < 0) continue;
        out[idx].senders[si] = {
          ...out[idx].senders[si],
          name: out[idx].senders[si].name || profile.name,
          pictureUrl: out[idx].senders[si].pictureUrl ?? profile.pictureUrl ?? null,
        };
        cacheFacebookProfile(s.id, profile);
      } catch {
        /* try next sender */
      }
    }
  }

  return out;
}

function commentAuthorUsername(authorName: string | undefined): string | null {
  const u = authorName?.replace(/^@/, '').trim();
  return u && u.length > 0 ? u : null;
}

/** Apply cached profile photos to inbox comment rows (no live Meta calls). */
export async function mergeInboxProfileCacheIntoComments(
  platform: 'instagram' | 'facebook',
  list: InboxCommentRow[]
): Promise<InboxCommentRow[]> {
  const out: InboxCommentRow[] = [];
  for (const c of list) {
    if (c.isFromMe || c.authorPictureUrl) {
      out.push(c);
      continue;
    }
    let cached = c.authorPlatformUserId
      ? await readInboxProfileCache(platform, c.authorPlatformUserId)
      : null;
    const username = commentAuthorUsername(c.authorName);
    if (!cached?.pictureUrl && username) {
      cached = await readInboxProfileCacheByUsername(platform, username);
    }
    if (!cached?.pictureUrl) {
      out.push(c);
      continue;
    }
    out.push({
      ...c,
      authorPictureUrl: cached.pictureUrl,
      authorName:
        c.authorName === 'Unknown' && cached.username
          ? cached.username.startsWith('@')
            ? cached.username
            : `@${cached.username}`
          : c.authorName,
    });
  }
  return out;
}

/**
 * Resolve missing comment author avatars via Meta profile APIs (budgeted per request).
 */
export async function enrichInboxCommentAuthorProfilesLive(args: {
  comments: InboxCommentRow[];
  userId: string;
  platform: 'INSTAGRAM' | 'FACEBOOK';
  accessToken: string;
  isInstagramBusinessLogin: boolean;
  forceEnrich: boolean;
  maxLiveFetches: number;
}): Promise<InboxCommentRow[]> {
  const platformKey = args.platform === 'INSTAGRAM' ? 'instagram' : 'facebook';
  const merged = await mergeInboxProfileCacheIntoComments(platformKey, args.comments);
  if (args.maxLiveFetches <= 0) return merged;

  const out = merged.map((c) => ({ ...c }));
  const seenIds = new Set<string>();
  let fetches = 0;

  for (let i = 0; i < out.length; i++) {
    const c = out[i]!;
    if (c.isFromMe || c.authorPictureUrl) continue;
    const authorId = c.authorPlatformUserId;
    if (!authorId || seenIds.has(authorId) || !isLikelyMetaScopedUserId(authorId)) continue;
    if (fetches >= args.maxLiveFetches) break;
    seenIds.add(authorId);
    fetches += 1;

    const username = commentAuthorUsername(c.authorName) ?? undefined;
    const profile =
      args.platform === 'INSTAGRAM'
        ? await resolveInstagramInboxSenderProfile({
            userId: args.userId,
            senderId: authorId,
            accessToken: args.accessToken,
            isInstagramBusinessLogin: args.isInstagramBusinessLogin,
            username,
            forceEnrich: args.forceEnrich,
          })
        : await resolveFacebookInboxSenderProfile({
            senderId: authorId,
            accessToken: args.accessToken,
            forceEnrich: args.forceEnrich,
          });
    if (!profile?.pictureUrl) continue;

    const usernameLower = username?.toLowerCase();
    for (let j = 0; j < out.length; j++) {
      const row = out[j]!;
      if (row.isFromMe || row.authorPictureUrl) continue;
      const rowId = row.authorPlatformUserId;
      const rowUser = commentAuthorUsername(row.authorName)?.toLowerCase();
      if (rowId === authorId || (usernameLower && rowUser === usernameLower)) {
        out[j] = { ...row, authorPictureUrl: profile.pictureUrl };
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
        const alreadyFull = !!s.pictureUrl && !!(s.name?.trim() || s.username?.trim());
        if (alreadyFull) return s;
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

type MessageFromRow = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  profile_picture_url?: string;
  picture?: { data?: { url?: string } };
};

function pictureFromMessageFrom(row: MessageFromRow | undefined): string | null {
  if (!row) return null;
  return row.profile_pic ?? row.profile_picture_url ?? row.picture?.data?.url ?? null;
}

/**
 * When Meta's conversation list omits participant ids/names, read the latest message's
 * `from` field to identify the other party (common on Instagram Business Login).
 */
export async function enrichInboxSendersFromLatestMessages(args: {
  platform: 'instagram' | 'facebook';
  list: InboxConversationListItem[];
  ourIds: Set<string>;
  accessToken: string;
  isInstagramBusinessLogin: boolean;
  pageToken?: string | null;
  maxConversations?: number;
  forceEnrich?: boolean;
}): Promise<InboxConversationListItem[]> {
  const {
    platform,
    list,
    ourIds,
    accessToken,
    isInstagramBusinessLogin,
    pageToken,
    maxConversations = 3,
    forceEnrich = false,
  } = args;
  if (!forceEnrich && !shouldAllowMetaInboxProfileEnrichment()) return list;
  const token = pageToken ?? accessToken;
  if (!token) return list;

  const senderNeedsIdentity = (s: InboxConversationListItem['senders'][number]) =>
    !(s.name?.trim() || s.username?.trim());
  const convNeedsIdentity = (c: InboxConversationListItem) =>
    c.senders.length === 0 ||
    c.senders.some((s) => senderNeedsIdentity(s) || !s.pictureUrl);

  const out = list.map((c) => ({ ...c, senders: [...c.senders] }));
  const toFetch = out
    .filter((c) => (forceEnrich ? convNeedsIdentity(c) : c.senders.length === 0 || c.senders.some(senderNeedsIdentity)))
    .slice(0, maxConversations);

  for (const conv of toFetch) {
    const idx = out.findIndex((c) => c.id === conv.id);
    if (idx < 0) continue;
    try {
      let from: MessageFromRow | undefined;
      if (platform === 'instagram') {
        const url = isInstagramBusinessLogin ? `${igBaseUrl}/${conv.id}` : `${fbBaseUrl}/${conv.id}`;
        const params: Record<string, string> = {
          fields: 'messages.limit(1){from,to}',
          access_token: token,
        };
        if (!isInstagramBusinessLogin) params.platform = 'instagram';
        const res = await axios.get<{
          messages?: { data?: Array<{ from?: MessageFromRow; to?: { data?: MessageFromRow[] } }> };
        }>(url, { params, timeout: 10_000 });
        const msg = res.data?.messages?.data?.[0];
        from = msg?.from;
        const toOther = msg?.to?.data?.[0];
        if (from?.id && ourIds.has(from.id) && toOther?.id && !ourIds.has(toOther.id)) {
          from = toOther;
        }
      } else {
        const res = await axios.get<{
          data?: Array<{ from?: MessageFromRow; to?: { data?: MessageFromRow[] } }>;
        }>(`${fbBaseUrl}/${conv.id}/messages`, {
          params: { fields: 'from,to', limit: '1', access_token: token },
          timeout: 10_000,
        });
        const msg = res.data?.data?.[0];
        from = msg?.from;
        const toOther = msg?.to?.data?.[0];
        if (from?.id && ourIds.has(from.id) && toOther?.id && !ourIds.has(toOther.id)) {
          from = toOther;
        }
      }
      if (!from?.id || ourIds.has(from.id)) continue;

      const profile: InboxSenderProfile = {
        name: from.name,
        username: from.username,
        pictureUrl: pictureFromMessageFrom(from),
      };
      const existing = out[idx].senders[0];
      out[idx] = {
        ...out[idx],
        senders: [
          {
            id: from.id,
            name: existing?.name || profile.name,
            username: existing?.username || profile.username,
            pictureUrl: existing?.pictureUrl ?? profile.pictureUrl ?? null,
          },
        ],
      };
      void writeInboxProfileCache(platform, from.id, profile);
    } catch {
      /* next conversation */
    }
  }

  return out;
}

/** Resolve one DM thread's other-party profile (used by sender-profile API + client backfill). */
export async function resolveConversationSenderProfile(args: {
  userId: string;
  platform: 'instagram' | 'facebook';
  conversationId: string;
  senders: InboxConversationListItem['senders'];
  accessToken: string;
  isInstagramBusinessLogin?: boolean;
  forceEnrich?: boolean;
}): Promise<{
  senderId: string | null;
  name?: string | null;
  username?: string | null;
  pictureUrl?: string | null;
}> {
  const sender = args.senders[0];
  const senderId = sender?.id ?? null;
  const forceEnrich = args.forceEnrich !== false;

  if (args.platform === 'facebook') {
    const profile = senderId
      ? await resolveFacebookInboxSenderProfile({
          senderId,
          accessToken: args.accessToken,
          conversationId: args.conversationId,
          forceEnrich,
        })
      : null;
    return {
      senderId,
      name: profile?.name ?? sender?.name ?? null,
      username: profile?.username ?? sender?.username ?? null,
      pictureUrl: profile?.pictureUrl ?? sender?.pictureUrl ?? null,
    };
  }

  if (senderId) {
    const profile = await resolveInstagramInboxSenderProfile({
      userId: args.userId,
      senderId,
      accessToken: args.accessToken,
      isInstagramBusinessLogin: args.isInstagramBusinessLogin ?? false,
      conversationId: args.conversationId,
      username: sender?.username,
      forceEnrich,
    });
    return {
      senderId,
      name: profile?.name ?? sender?.name ?? null,
      username: profile?.username ?? sender?.username ?? null,
      pictureUrl: profile?.pictureUrl ?? sender?.pictureUrl ?? null,
    };
  }

  const enriched = await enrichInstagramAvatarsFromParticipants({
    userId: args.userId,
    list: [{ id: args.conversationId, senders: args.senders, updatedTime: null }],
    isInstagramBusinessLogin: args.isInstagramBusinessLogin ?? false,
    accessToken: args.accessToken,
    maxConversations: 1,
    forceEnrich,
  });
  const resolved = enriched[0]?.senders?.[0];
  return {
    senderId: resolved?.id ?? null,
    name: resolved?.name ?? null,
    username: resolved?.username ?? null,
    pictureUrl: resolved?.pictureUrl ?? null,
  };
}
