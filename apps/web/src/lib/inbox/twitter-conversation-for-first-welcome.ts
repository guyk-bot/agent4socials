import type { Platform } from '@prisma/client';
import axios from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';
import type { FirstWelcomeMessageRow } from '@/lib/dm-first-welcome';

export type ConversationUiMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
};

export type TwitterConversationLoadResult =
  | {
      ok: true;
      messages: ConversationUiMessage[];
      recipientId: string | null;
      recipientName: string | null;
      recipientPictureUrl: string | null;
      firstWelcomeRows: FirstWelcomeMessageRow[];
    }
  | { ok: false; status?: number; error: string };

type AccountSlice = {
  id: string;
  platform: Platform;
  platformUserId: string;
  accessToken: string;
  credentialsJson: unknown;
};

/**
 * Load X DM events for a conversation (same behavior as the Inbox messages API GET for TWITTER).
 */
export async function loadTwitterConversationForFirstWelcome(
  account: AccountSlice,
  conversationId: string
): Promise<TwitterConversationLoadResult> {
  const token = account.accessToken ?? '';
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as Record<string, unknown>;
  const oauth1UserToken = credJson.twitterOAuth1AccessToken as string | undefined;
  const oauth1UserSecret = credJson.twitterOAuth1AccessTokenSecret as string | undefined;
  const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
  const ourId = String(account.platformUserId ?? '');

  try {
    if (conversationId.startsWith('mention:')) {
      const tweetId = conversationId.slice('mention:'.length).trim();
      if (!tweetId) return { ok: false, error: 'Invalid mention thread.' };
      await checkAndIncrementXApiUsage(account.id);
      const lookupUrl = 'https://api.x.com/2/tweets';
      const twParams: Record<string, string> = {
        ids: tweetId,
        'tweet.fields': 'author_id,created_at,text',
        expansions: 'author_id',
        'user.fields': 'id,name,username',
      };
      const twRes = await axios.get<{
        data?: Array<{ id: string; author_id?: string; text?: string; created_at?: string }>;
        includes?: { users?: Array<{ id: string; name?: string; username?: string }> };
      }>(lookupUrl, {
        params: twParams,
        headers: useOAuth1ForDm
          ? signTwitterRequest('GET', lookupUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, twParams)
          : { Authorization: `Bearer ${token}` },
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (twRes.status === 429) return { ok: false, status: 429, error: 'X is limiting requests. Wait a few minutes and try again.' };
      const tw = twRes.data?.data?.[0];
      if (!tw) return { ok: false, error: 'Could not load this mention. It may have been deleted or is unavailable.' };
      const author = twRes.data?.includes?.users?.find((u) => u.id === tw.author_id);
      const fromName = author?.username ?? author?.name ?? tw.author_id ?? null;
      const messages: ConversationUiMessage[] = [
        {
          id: tw.id,
          fromId: tw.author_id ?? null,
          fromName,
          message: tw.text ?? '',
          createdTime: tw.created_at ?? null,
          isFromPage: tw.author_id === ourId,
        },
      ];
      const recipientId = tw.author_id && tw.author_id !== ourId ? tw.author_id : null;
      const firstWelcomeRows: FirstWelcomeMessageRow[] = messages.map((m) => ({
        createdTime: m.createdTime,
        isFromPage: m.isFromPage,
        fromId: m.fromId,
      }));
      return {
        ok: true,
        messages,
        recipientId,
        recipientName: fromName,
        recipientPictureUrl: null,
        firstWelcomeRows,
      };
    }

    const allMessages: ConversationUiMessage[] = [];
    const allEventParticipantIds = new Set<string>();
    let nextToken: string | null = null;
    let pageCount = 0;
    const maxPages = 5;
    const userMap = new Map<string, string>();
    const userObjMap = new Map<string, { name?: string; username?: string; profile_image_url?: string }>();
    const dmConversationUrl = `https://api.x.com/2/dm_conversations/${conversationId}/dm_events`;

    do {
      await checkAndIncrementXApiUsage(account.id);
      const params: Record<string, string> = {
        'dm_event.fields': 'id,text,sender_id,created_at,participant_ids',
        event_types: 'MessageCreate',
        expansions: 'sender_id,participant_ids',
        'user.fields': 'id,name,username,profile_image_url',
        max_results: '100',
      };
      if (nextToken) params.pagination_token = nextToken;

      const requestConfig = useOAuth1ForDm
        ? {
            params,
            headers: signTwitterRequest('GET', dmConversationUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, params),
            timeout: 15_000,
            validateStatus: () => true,
          }
        : {
            params,
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15_000,
            validateStatus: () => true,
          };

      const res = await axios.get<{
        data?: Array<{
          id: string;
          event_type?: string;
          created_at?: string;
          sender_id?: string;
          text?: string;
          participant_ids?: string[];
        }>;
        includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
        meta?: { next_token?: string };
        error?: { message?: string };
      }>(dmConversationUrl, requestConfig);
      if (res.status === 429) return { ok: false, status: 429, error: 'X is limiting requests. Wait a few minutes and try again.' };
      if (res.data?.error) return { ok: false, error: res.data.error.message ?? 'Could not load X messages.' };

      for (const u of res.data?.includes?.users ?? []) {
        userMap.set(u.id, u.username ?? u.name ?? u.id);
        userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
      }
      for (const ev of res.data?.data ?? []) {
        if (Array.isArray(ev.participant_ids)) {
          for (const pid of ev.participant_ids) if (pid) allEventParticipantIds.add(pid);
        }
        if (ev.event_type !== 'MessageCreate') continue;
        const fromId = ev.sender_id ?? null;
        const isFromPage = fromId === ourId;
        allMessages.push({
          id: ev.id,
          fromId,
          fromName: fromId ? (userMap.get(fromId) ?? null) : null,
          message: ev.text ?? '',
          createdTime: ev.created_at ?? null,
          isFromPage,
        });
      }
      nextToken = res.data?.meta?.next_token ?? null;
      pageCount++;
    } while (nextToken && pageCount < maxPages);

    let recipientIdFromConvo: string | null = null;
    for (const part of conversationId.split('-')) {
      if (part && part !== ourId) {
        recipientIdFromConvo = part;
        break;
      }
    }
    if (recipientIdFromConvo && allMessages.length < 50) {
      try {
        const withUrl = `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(recipientIdFromConvo)}/dm_events`;
        const existingIds = new Set(allMessages.map((m) => m.id));
        let withNext: string | null = null;
        let withPages = 0;
        do {
          await checkAndIncrementXApiUsage(account.id);
          const withParams: Record<string, string> = {
            'dm_event.fields': 'id,text,sender_id,created_at,event_type',
            event_types: 'MessageCreate',
            expansions: 'sender_id',
            'user.fields': 'id,name,username,profile_image_url',
            max_results: '100',
          };
          if (withNext) withParams.pagination_token = withNext;
          const withRes = await axios.get<{
            data?: Array<{ id: string; event_type?: string; sender_id?: string; text?: string; created_at?: string }>;
            includes?: { users?: Array<{ id: string; name?: string; username?: string; profile_image_url?: string }> };
            meta?: { next_token?: string };
            error?: { message?: string };
          }>(withUrl, {
            params: withParams,
            headers: useOAuth1ForDm
              ? signTwitterRequest('GET', withUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, withParams)
              : { Authorization: `Bearer ${token}` },
            timeout: 15_000,
            validateStatus: () => true,
          });
          if (withRes.status === 429 || withRes.data?.error) break;
          for (const u of withRes.data?.includes?.users ?? []) {
            userMap.set(u.id, u.username ?? u.name ?? u.id);
            userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
          }
          for (const ev of withRes.data?.data ?? []) {
            if ((ev.event_type != null && ev.event_type !== 'MessageCreate') || existingIds.has(ev.id)) continue;
            existingIds.add(ev.id);
            const fromId = ev.sender_id ?? null;
            allMessages.push({
              id: ev.id,
              fromId,
              fromName: fromId ? (userMap.get(fromId) ?? null) : null,
              message: ev.text ?? '',
              createdTime: ev.created_at ?? null,
              isFromPage: fromId === ourId,
            });
          }
          withNext = withRes.data?.meta?.next_token ?? null;
          withPages++;
        } while (withNext && withPages < 5);
      } catch {
        // ignore
      }
    }

    allMessages.sort((a, b) => {
      const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return tA - tB;
    });
    let recipientId: string | null = null;
    for (const m of allMessages) {
      if (m.fromId && m.fromId !== ourId) {
        recipientId = m.fromId;
        break;
      }
    }
    if (!recipientId && ourId) {
      for (const pid of allEventParticipantIds) {
        if (pid !== ourId) {
          recipientId = pid;
          break;
        }
      }
    }
    if (!recipientId && ourId) {
      for (const part of conversationId.split('-')) {
        if (part && part !== ourId) {
          recipientId = part;
          break;
        }
      }
    }

    if (recipientId && !userObjMap.has(recipientId)) {
      try {
        await checkAndIncrementXApiUsage(account.id);
        const recipientRes = await axios.get<{
          data?: { id: string; name?: string; username?: string; profile_image_url?: string };
        }>(`https://api.x.com/2/users/${recipientId}`, {
          params: { 'user.fields': 'id,name,username,profile_image_url' },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8_000,
        });
        if (recipientRes.data?.data) {
          const u = recipientRes.data.data;
          userObjMap.set(u.id, { name: u.name, username: u.username, profile_image_url: u.profile_image_url });
          userMap.set(u.id, u.username ?? u.name ?? u.id);
        }
      } catch {
        // ignore
      }
    }

    const recipientUser = recipientId ? userObjMap.get(recipientId) : null;
    const recipientName = recipientUser?.name ?? recipientUser?.username ?? (recipientId ? 'Private account' : null);
    const recipientPictureUrl = recipientUser?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null;
    const enrichedMessages = allMessages.map((m) => ({
      ...m,
      fromName: m.fromId ? (userMap.get(m.fromId) ?? m.fromName) : m.fromName,
    }));
    const firstWelcomeRows: FirstWelcomeMessageRow[] = enrichedMessages.map((m) => ({
      createdTime: m.createdTime,
      isFromPage: m.isFromPage,
      fromId: m.fromId,
    }));
    return {
      ok: true,
      messages: enrichedMessages,
      recipientId,
      recipientName,
      recipientPictureUrl: recipientPictureUrl ?? null,
      firstWelcomeRows,
    };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: string | { message?: string } } }; message?: string };
    const status = err?.response?.status;
    const bodyError = err?.response?.data?.error;
    const msg =
      typeof bodyError === 'string'
        ? bodyError
        : typeof bodyError === 'object' && bodyError && 'message' in bodyError
          ? String((bodyError as { message?: string }).message)
          : err?.message ?? 'Could not load X messages.';
    if (status === 429) return { ok: false, status: 429, error: 'X is limiting requests. Wait a few minutes and try again.' };
    return { ok: false, error: msg };
  }
}
