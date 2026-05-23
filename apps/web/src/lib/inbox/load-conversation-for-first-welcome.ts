import type { Platform } from '@prisma/client';
import type { FirstWelcomeMessageRow } from '@/lib/dm-first-welcome';
import {
  loadFacebookGraphConversationMessages,
  loadInstagramConversationMessages,
  type ConversationUiMessage,
} from '@/lib/inbox/load-meta-conversation-messages';
import { resolveFacebookInboxSenderProfile, resolveInstagramInboxSenderProfile } from '@/lib/inbox/resolve-inbox-sender-profile';
import { loadTwitterConversationForFirstWelcome } from '@/lib/inbox/twitter-conversation-for-first-welcome';

export type { ConversationUiMessage };

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
  userId: string,
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
    if (account.platform === 'INSTAGRAM') {
      const { messages, error } = await loadInstagramConversationMessages({
        userId,
        account,
        conversationId,
        isInstagramBusinessLogin,
      });
      if (error && messages.length === 0) {
        if (error.includes('permission') || error.includes('OAuth') || error.includes('access')) {
          return {
            ok: false,
            error: isInstagramBusinessLogin
              ? 'Your Instagram session has expired. Reconnect your Instagram account to refresh it.'
              : 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
          };
        }
        return { ok: false, error };
      }

      let recipientId: string | null = null;
      for (const m of messages) {
        if (m.fromId && !ourIds.has(m.fromId)) {
          recipientId = m.fromId;
          break;
        }
      }

      let recipientName: string | null = null;
      let recipientPictureUrl: string | null = null;
      if (recipientId) {
        let recipientUsername: string | null = null;
        for (const m of messages) {
          if (m.fromId === recipientId && m.fromName) {
            recipientUsername = m.fromName.replace(/^@/, '');
            break;
          }
        }
        const profile = await resolveInstagramInboxSenderProfile({
          userId,
          senderId: recipientId,
          accessToken: activeToken,
          isInstagramBusinessLogin,
          conversationId,
          username: recipientUsername ?? undefined,
          forceEnrich: true,
        });
        recipientName = profile?.name ?? profile?.username ?? recipientUsername;
        recipientPictureUrl = profile?.pictureUrl ?? null;
      }

      const firstWelcomeRows: FirstWelcomeMessageRow[] = messages.map((m) => ({
        createdTime: m.createdTime,
        isFromPage: m.isFromPage,
        fromId: m.fromId,
      }));

      return {
        ok: true,
        messages,
        recipientId,
        ...(recipientName && { recipientName }),
        ...(recipientPictureUrl && { recipientPictureUrl }),
        isInstagramBusinessLogin,
        firstWelcomeRows,
      };
    }

    const { messages, error } = await loadFacebookGraphConversationMessages(
      conversationId,
      activeToken,
      ourIds,
      account.platform
    );

    if (error && messages.length === 0) {
      if (error.includes('permission') || error.includes('OAuth') || error.includes('access')) {
        return {
          ok: false,
          error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.',
        };
      }
      return { ok: false, error };
    }

    let recipientId: string | null = null;
    for (const m of messages) {
      if (m.fromId && !ourIds.has(m.fromId)) {
        recipientId = m.fromId;
        break;
      }
    }

    let recipientName: string | null = null;
    let recipientPictureUrl: string | null = null;
    if (recipientId && account.platform === 'FACEBOOK') {
      for (const m of messages) {
        if (m.fromId === recipientId && m.fromName?.trim()) {
          recipientName = m.fromName.trim();
          break;
        }
      }
      const profile = await resolveFacebookInboxSenderProfile({
        senderId: recipientId,
        accessToken: activeToken,
        conversationId,
        forceEnrich: true,
      });
      recipientName = profile?.name ?? recipientName;
      recipientPictureUrl = profile?.pictureUrl ?? null;
    }

    const firstWelcomeRows: FirstWelcomeMessageRow[] = messages.map((m) => ({
      createdTime: m.createdTime,
      isFromPage: m.isFromPage,
      fromId: m.fromId,
    }));

    return {
      ok: true,
      messages,
      recipientId,
      ...(recipientName && { recipientName }),
      ...(recipientPictureUrl && { recipientPictureUrl }),
      isInstagramBusinessLogin: false,
      firstWelcomeRows,
    };
  } catch (e) {
    const err = e as { message?: string };
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
  conversationId: string,
  userId?: string
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
    if (!userId) {
      return { ok: false, error: 'Could not load conversation messages.' };
    }
    return loadMetaConversationForFirstWelcome(userId, account, conversationId);
  }
  return { ok: false, error: 'Unsupported platform for DMs.' };
}
