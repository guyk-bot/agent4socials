import type { Platform } from '@prisma/client';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import type { FirstWelcomeMessageRow } from '@/lib/dm-first-welcome';
import { loadTwitterConversationForFirstWelcome } from '@/lib/inbox/twitter-conversation-for-first-welcome';

const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

export type ConversationUiMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
};

export type LoadConversationForFirstWelcomeResult =
  | {
      ok: true;
      messages: ConversationUiMessage[];
      recipientId: string | null;
      recipientName?: string | null;
      recipientPictureUrl?: string | null;
      isInstagramBusinessLogin: boolean;
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

async function loadMetaConversationForFirstWelcome(
  account: AccountSlice,
  conversationId: string
): Promise<LoadConversationForFirstWelcomeResult> {
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string; linkedPageId?: string };

  const isInstagramBusinessLogin =
    account.platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';
  const activeToken = account.accessToken || '';
  const ourIds = new Set<string>([account.platformUserId, credJson.linkedPageId].filter((x): x is string => !!x));

  try {
    if (isInstagramBusinessLogin) {
      const convoRes = await axios.get<{
        messages?: { data?: Array<{ id: string; created_time?: string }> };
        error?: { message?: string; code?: number };
      }>(`${igBaseUrl}/${conversationId}`, {
        params: { fields: 'messages', access_token: activeToken },
        timeout: 15_000,
      });

      if (convoRes.data?.error) {
        const errMsg = convoRes.data.error.message ?? '';
        return { ok: false, error: errMsg || 'Could not load messages.' };
      }

      const messageIds = (convoRes.data?.messages?.data ?? []).map((m) => m.id);
      const recentIds = messageIds.slice(0, 20);

      type IgMessage = {
        id: string;
        created_time?: string;
        from?: { id?: string; username?: string };
        message?: string;
        error?: { message?: string; code?: number };
      };
      const msgDetails = await Promise.all(
        recentIds.map((msgId) =>
          axios
            .get<IgMessage>(`${igBaseUrl}/${msgId}`, {
              params: { fields: 'id,created_time,from,to,message', access_token: activeToken },
              timeout: 10_000,
            })
            .then((r) => r.data)
            .catch(() => null)
        )
      );

      let list = msgDetails
        .filter((m): m is IgMessage => m !== null && !m.error)
        .map((m) => ({
          id: m.id,
          fromId: m.from?.id ?? null,
          fromName: m.from?.username ?? null,
          message: m.message ?? '',
          createdTime: m.created_time ?? null,
          isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
        }));

      list = list.slice().sort((a, b) => {
        const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return tA - tB;
      });

      let recipientId: string | null = null;
      for (const m of list) {
        if (m.fromId && !ourIds.has(m.fromId)) {
          recipientId = m.fromId;
          break;
        }
      }

      const firstWelcomeRows: FirstWelcomeMessageRow[] = list.map((m) => ({
        createdTime: m.createdTime,
        isFromPage: m.isFromPage,
        fromId: m.fromId,
      }));
      return {
        ok: true,
        messages: list,
        recipientId,
        isInstagramBusinessLogin: true,
        firstWelcomeRows,
      };
    }

    const res = await axios.get<{
      data?: Array<{
        id: string;
        from?: { id?: string; name?: string };
        message?: string;
        created_time?: string;
      }>;
      error?: { message: string; code?: number };
    }>(`${fbBaseUrl}/${conversationId}/messages`, {
      params: {
        fields: 'id,from,to,message,created_time',
        access_token: activeToken,
      },
      timeout: 15_000,
    });

    if (res.data?.error) {
      const msg = res.data.error.message ?? '';
      if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access')) {
        return {
          ok: false,
          error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
        };
      }
      return { ok: false, error: msg };
    }

    let list = (res.data?.data ?? []).map((m) => ({
      id: m.id,
      fromId: m.from?.id ?? null,
      fromName: m.from?.name ?? null,
      message: m.message ?? '',
      createdTime: m.created_time ?? null,
      isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
    }));

    let recipientId: string | null = null;
    for (const m of list) {
      if (m.fromId && !ourIds.has(m.fromId)) {
        recipientId = m.fromId;
        break;
      }
    }

    list = list.slice().sort((a, b) => {
      const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return tA - tB;
    });

    let recipientName: string | null = null;
    let recipientPictureUrl: string | null = null;
    if (recipientId && account.platform === 'FACEBOOK') {
      try {
        const pr = await axios.get<{
          name?: string;
          first_name?: string;
          last_name?: string;
          picture?: { data?: { url?: string } };
        }>(`${fbBaseUrl}/${recipientId}`, {
          params: { fields: 'name,first_name,last_name,picture.type(large)', access_token: activeToken },
          timeout: 12_000,
        });
        const v = pr.data;
        recipientName = v.name || [v.first_name, v.last_name].filter(Boolean).join(' ').trim() || null;
        recipientPictureUrl = v.picture?.data?.url ?? null;
      } catch {
        // ignore
      }
    }

    const firstWelcomeRows: FirstWelcomeMessageRow[] = list.map((m) => ({
      createdTime: m.createdTime,
      isFromPage: m.isFromPage,
      fromId: m.fromId,
    }));

    return {
      ok: true,
      messages: list,
      recipientId,
      ...(recipientName && { recipientName }),
      ...(recipientPictureUrl && { recipientPictureUrl }),
      isInstagramBusinessLogin: false,
      firstWelcomeRows,
    };
  } catch (e) {
    const err = e as { message?: string; response?: { data?: unknown; status?: number } };
    const msg = err?.message ?? '';
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth')) {
      return {
        ok: false,
        error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
      };
    }
    return { ok: false, error: 'Could not load conversation messages.' };
  }
}

export async function loadConversationForFirstWelcome(
  account: AccountSlice,
  conversationId: string
): Promise<LoadConversationForFirstWelcomeResult> {
  if (account.platform === 'TWITTER') {
    const tw = await loadTwitterConversationForFirstWelcome(account, conversationId);
    if (!tw.ok) return tw;
    return {
      ok: true,
      messages: tw.messages,
      recipientId: tw.recipientId,
      recipientName: tw.recipientName,
      recipientPictureUrl: tw.recipientPictureUrl,
      isInstagramBusinessLogin: false,
      firstWelcomeRows: tw.firstWelcomeRows,
    };
  }
  if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
    return loadMetaConversationForFirstWelcome(account, conversationId);
  }
  return { ok: false, error: 'Unsupported platform for DMs.' };
}
