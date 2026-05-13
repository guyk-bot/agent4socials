import { Prisma, type Platform } from '@prisma/client';
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { uploadTwitterDmImageFromUrl, type PublishDeps } from '@/lib/publish-target';

const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

/** Max age of the customer's latest message when we load the thread; older than this skips auto-DM. */
const FIRST_WELCOME_MAX_AGE_MS = 5 * 60 * 1000;

export function platformToUiLabel(platform: Platform): string {
  switch (platform) {
    case 'INSTAGRAM':
      return 'Instagram';
    case 'FACEBOOK':
      return 'Facebook';
    case 'TWITTER':
      return 'X (Twitter)';
    case 'TIKTOK':
      return 'TikTok';
    default:
      return platform;
  }
}

function metaAttachmentTypeFromUrl(url: string, explicit?: string): 'image' | 'video' | 'file' {
  const t = typeof explicit === 'string' ? explicit.toLowerCase() : '';
  if (t === 'image' || t === 'video' || t === 'file') return t;
  const base = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(base)) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/.test(base)) return 'video';
  return 'file';
}

type AutomationJson = Record<string, unknown>;

type DmWelcomeAttachment = { fileUrl: string; fileName?: string; contentType?: string; kind: string };

function parseAutomation(raw: unknown): AutomationJson {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as AutomationJson) : {};
}

function firstWelcomeEnabledForLabel(s: AutomationJson, label: string): boolean {
  const by = s.dmWelcomeEnabledByPlatform;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    const v = (by as Record<string, unknown>)[label];
    if (typeof v === 'boolean') return v;
  }
  if (s.dmWelcomeEnabled === true && label === 'Instagram') {
    return true;
  }
  return false;
}

function firstWelcomeMessageForLabel(s: AutomationJson, label: string): string {
  const by = s.dmWelcomeMessagesByPlatform;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    const m = (by as Record<string, unknown>)[label];
    if (typeof m === 'string') return m;
  }
  if (label === 'Instagram' && typeof s.dmWelcomeMessage === 'string') return s.dmWelcomeMessage;
  return '';
}

function firstWelcomeAttachmentsForLabel(s: AutomationJson, label: string): DmWelcomeAttachment[] {
  const root = s.dmWelcomeAttachmentsByPlatform;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return [];
  const list = (root as Record<string, unknown>)[label];
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is DmWelcomeAttachment => {
    if (!x || typeof x !== 'object') return false;
    const o = x as DmWelcomeAttachment;
    return typeof o.fileUrl === 'string' && o.fileUrl.startsWith('https://');
  });
}

async function resolveLinkedFacebookPageId(userId: string, account: { accessToken: string; platform: Platform }): Promise<string | null> {
  if (account.platform !== 'INSTAGRAM') return null;
  const token = account.accessToken || '';
  try {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', accessToken: token },
      select: { platformUserId: true },
    });
    return fb?.platformUserId ?? null;
  } catch {
    return null;
  }
}

async function sendMetaWelcomeSequence(args: {
  account: {
    platform: Platform;
    platformUserId: string;
    accessToken: string;
    credentialsJson: unknown;
  };
  userId: string;
  recipientId: string;
  text: string;
  attachments: DmWelcomeAttachment[];
  isInstagramBusinessLogin: boolean;
}): Promise<void> {
  const { account, userId, recipientId, text, attachments, isInstagramBusinessLogin } = args;
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { linkedPageId?: string };
  const activeToken = account.accessToken || '';
  let resolvedPageId: string | null = credJson.linkedPageId ?? null;
  if (account.platform === 'INSTAGRAM' && !isInstagramBusinessLogin && !resolvedPageId) {
    resolvedPageId = await resolveLinkedFacebookPageId(userId, account);
  }

  const safeAttachments = attachments
    .map((a) => ({ url: a.fileUrl.trim(), type: a.kind }))
    .filter((a) => a.url.startsWith('https://'));

  if (account.platform === 'TWITTER') {
    const credJsonX = (account.credentialsJson && typeof account.credentialsJson === 'object'
      ? account.credentialsJson
      : {}) as Record<string, unknown>;
    const oauth1UserToken = credJsonX.twitterOAuth1AccessToken as string | undefined;
    const oauth1UserSecret = credJsonX.twitterOAuth1AccessTokenSecret as string | undefined;
    const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);
    const postUrl = `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(recipientId)}/messages`;
    const postHeaders = useOAuth1ForDm
      ? { ...signTwitterRequest('POST', postUrl, { key: oauth1UserToken!, secret: oauth1UserSecret! }, {}), 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' };

    const oauth1Pair =
      useOAuth1ForDm && oauth1UserToken && oauth1UserSecret
        ? { accessToken: oauth1UserToken, accessTokenSecret: oauth1UserSecret }
        : null;

    const dmImageAttachments = safeAttachments.filter((a) => metaAttachmentTypeFromUrl(a.url, a.type) === 'image');
    const deps: PublishDeps = { axios, fetch: globalThis.fetch };

    const postDm = async (body: Record<string, unknown>) => {
      await axios.post(postUrl, body, { headers: postHeaders, timeout: 30_000 });
    };

    if (dmImageAttachments.length === 0) {
      if (text.trim()) await postDm({ text: text.slice(0, 10000) });
      return;
    }

    let remainingText = text.trim().slice(0, 10000);
    for (const att of dmImageAttachments) {
      const up = await uploadTwitterDmImageFromUrl(deps, {
        imageUrl: att.url,
        userAccessToken: account.accessToken,
        oauth1: oauth1Pair,
      });
      if (!up.ok) {
        console.error('[dm-first-welcome] X DM media upload failed', up.error);
        continue;
      }
      const body: Record<string, unknown> = { attachments: [{ media_id: up.mediaId }] };
      if (remainingText) {
        body.text = remainingText;
        remainingText = '';
      }
      await postDm(body);
    }
    if (remainingText) await postDm({ text: remainingText });
    return;
  }

  if (isInstagramBusinessLogin) {
    const url = `${igBaseUrl}/${account.platformUserId}/messages`;
    const commonParams = { access_token: activeToken };
    const commonHeaders = { 'Content-Type': 'application/json' };
    for (const a of safeAttachments) {
      const attType = metaAttachmentTypeFromUrl(a.url, a.type);
      await axios.post(
        url,
        {
          recipient: { id: recipientId },
          message: { attachment: { type: attType, payload: { url: a.url, is_reusable: true } } },
        },
        { headers: commonHeaders, params: commonParams, timeout: 15_000 }
      );
    }
    if (text.trim()) {
      await axios.post(
        url,
        { recipient: { id: recipientId }, message: { text: text.slice(0, 1000) } },
        { headers: commonHeaders, params: commonParams, timeout: 15_000 }
      );
    }
    return;
  }

  const senderId = resolvedPageId || account.platformUserId;
  const url = `${fbBaseUrl}/${senderId}/messages`;
  const commonParams = { access_token: activeToken };
  const commonHeaders = { 'Content-Type': 'application/json' };
  for (const a of safeAttachments) {
    const attType = metaAttachmentTypeFromUrl(a.url, a.type);
    await axios.post(
      url,
      {
        recipient: { id: recipientId },
        message: { attachment: { type: attType, payload: { url: a.url, is_reusable: true } } },
        messaging_type: 'RESPONSE',
      },
      { headers: commonHeaders, params: commonParams, timeout: 15_000 }
    );
  }
  if (text.trim()) {
    await axios.post(
      url,
      {
        recipient: { id: recipientId },
        message: { text: text.slice(0, 2000) },
        messaging_type: 'RESPONSE',
      },
      { headers: commonHeaders, params: commonParams, timeout: 15_000 }
    );
  }
}

export type FirstWelcomeMessageRow = {
  createdTime: string | null;
  isFromPage: boolean;
  fromId?: string | null;
};

/**
 * After inbox loads messages, send the configured first-incoming welcome once per conversation
 * when the latest message is from the customer within the last few minutes (see FIRST_WELCOME_MAX_AGE_MS).
 */
export async function runFirstWelcomeMaybe(args: {
  userId: string;
  account: {
    id: string;
    platform: Platform;
    platformUserId: string;
    accessToken: string;
    credentialsJson: unknown;
  };
  conversationId: string;
  messages: FirstWelcomeMessageRow[];
  recipientId: string | null;
  isInstagramBusinessLogin: boolean;
}): Promise<void> {
  const { userId, account, conversationId, messages, recipientId, isInstagramBusinessLogin } = args;
  if (!conversationId || conversationId.startsWith('mention:')) return;
  if (account.platform === 'TIKTOK' || account.platform === 'PINTEREST' || account.platform === 'LINKEDIN' || account.platform === 'YOUTUBE') {
    return;
  }
  if (!['INSTAGRAM', 'FACEBOOK', 'TWITTER'].includes(account.platform)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { automationSettings: true },
  });
  const s = parseAutomation(user?.automationSettings);
  const label = platformToUiLabel(account.platform);
  if (!firstWelcomeEnabledForLabel(s, label)) return;

  const text = firstWelcomeMessageForLabel(s, label).trim();
  const attachments = firstWelcomeAttachmentsForLabel(s, label);
  if (!text && attachments.length === 0) return;

  const sorted = messages.slice().sort((a, b) => {
    const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    return tA - tB;
  });
  if (sorted.length === 0) return;
  const last = sorted[sorted.length - 1];
  if (last.isFromPage) return;

  if (last.createdTime) {
    const age = Date.now() - new Date(last.createdTime).getTime();
    if (age > FIRST_WELCOME_MAX_AGE_MS || age < 0) return;
  } else {
    return;
  }

  let toRecipient = recipientId?.trim() || null;
  if (!toRecipient && last.fromId) toRecipient = last.fromId;
  if (!toRecipient) return;

  try {
    await prisma.dmFirstWelcomeSent.create({
      data: {
        userId,
        socialAccountId: account.id,
        conversationId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
    throw e;
  }

  try {
    await sendMetaWelcomeSequence({
      account,
      userId,
      recipientId: toRecipient,
      text,
      attachments,
      isInstagramBusinessLogin,
    });
  } catch (err) {
    console.error('[dm-first-welcome] send failed', err);
    await prisma.dmFirstWelcomeSent.deleteMany({
      where: { socialAccountId: account.id, conversationId },
    });
  }
}
