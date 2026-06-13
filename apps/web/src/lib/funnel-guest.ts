import { randomBytes } from 'crypto';
import { Prisma, type Platform } from '@prisma/client';
import { prisma, withPrismaPoolRetry } from '@/lib/db';
import { ensureFunnelSessionsTable } from '@/lib/ensure-funnel-sessions-table';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import {
  importFunnelChatToAysop,
  importGuestPublishToPost,
  parseGuestPublishMeta,
} from '@/lib/funnel-import-to-app';

export const FUNNEL_SESSION_COOKIE = 'izop_funnel_sid';
export const FUNNEL_MESSAGE_LIMIT = 100;
export const FUNNEL_GUEST_EMAIL_DOMAIN = '@guest.izop.ai';
const FUNNEL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type FunnelChatPayload = {
  blocks?: unknown[];
  step?: string;
  connectedAccountId?: string | null;
  connectedPlatform?: string | null;
};

function newToken(): string {
  return randomBytes(24).toString('hex');
}

function guestEmailForToken(token: string): string {
  return `funnel+${token}${FUNNEL_GUEST_EMAIL_DOMAIN}`;
}

export function isFunnelGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(FUNNEL_GUEST_EMAIL_DOMAIN);
}

export async function createFunnelSession(): Promise<{
  token: string;
  guestUserId: string;
  expiresAt: Date;
}> {
  await ensureFunnelSessionsTable();
  const token = newToken();
  const email = guestEmailForToken(token);
  const expiresAt = new Date(Date.now() + FUNNEL_SESSION_TTL_MS);

  const guestUser = await withPrismaPoolRetry('createFunnelGuestUser', () =>
    prisma.user.create({
      data: {
        email,
        name: 'Funnel guest',
        provider: 'LOCAL',
      },
      select: { id: true },
    })
  );

  await withPrismaPoolRetry('createFunnelSession', () =>
    prisma.funnelSession.create({
      data: {
        token,
        guestUserId: guestUser.id,
        expiresAt,
      },
    })
  );

  return { token, guestUserId: guestUser.id, expiresAt };
}

export async function getFunnelSessionByToken(token: string | null | undefined) {
  if (!token?.trim()) return null;
  const row = await withPrismaPoolRetry('getFunnelSession', () =>
    prisma.funnelSession.findUnique({ where: { token: token.trim() } })
  );
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (row.mergedToUserId) return null;
  return row;
}

export async function resolveFunnelGuestUserId(token: string | null | undefined): Promise<string | null> {
  const row = await getFunnelSessionByToken(token);
  return row?.guestUserId ?? null;
}

export async function isFunnelGuestUserId(userId: string): Promise<boolean> {
  const user = await withPrismaPoolRetry('isFunnelGuestUser', () =>
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  );
  return isFunnelGuestEmail(user?.email);
}

export async function incrementFunnelMessageCount(token: string): Promise<{
  count: number;
  limited: boolean;
}> {
  const row = await getFunnelSessionByToken(token);
  if (!row) return { count: 0, limited: true };
  const next = row.messageCount + 1;
  await withPrismaPoolRetry('incrementFunnelMessages', () =>
    prisma.funnelSession.update({
      where: { id: row.id },
      data: { messageCount: next },
    })
  );
  return { count: next, limited: next > FUNNEL_MESSAGE_LIMIT };
}

export async function markFunnelSessionConnected(
  guestUserId: string,
  platform: Platform,
  accountId: string
): Promise<void> {
  await withPrismaPoolRetry('markFunnelConnected', () =>
    prisma.funnelSession.updateMany({
      where: { guestUserId, mergedToUserId: null },
      data: {
        connectedPlatform: platform,
        connectedAccountId: accountId,
      },
    })
  );
}

export async function markFunnelSessionConnectedByToken(
  token: string,
  platform: Platform,
  accountId: string
): Promise<void> {
  const row = await getFunnelSessionByToken(token);
  if (!row) return;
  await withPrismaPoolRetry('markFunnelConnectedByToken', () =>
    prisma.funnelSession.update({
      where: { id: row.id },
      data: {
        connectedPlatform: platform,
        connectedAccountId: accountId,
      },
    })
  );
}

export async function saveFunnelChatPayload(
  token: string,
  payload: FunnelChatPayload
): Promise<void> {
  const row = await getFunnelSessionByToken(token);
  if (!row) return;
  await withPrismaPoolRetry('saveFunnelChatPayload', () =>
    prisma.funnelSession.update({
      where: { id: row.id },
      data: { chatPayload: payload as object },
    })
  );
}

export async function saveFunnelBrandContextDraft(
  token: string,
  draft: BrandContextRecord
): Promise<void> {
  const row = await getFunnelSessionByToken(token);
  if (!row) return;
  await withPrismaPoolRetry('saveFunnelBrandDraft', () =>
    prisma.funnelSession.update({
      where: { id: row.id },
      data: { brandContextDraft: draft as object },
    })
  );
}

export type FunnelMergeAccount = {
  id: string;
  platform: string;
  username?: string;
  profilePicture?: string | null;
};

export type FunnelMergeResult = {
  mergedAccounts: number;
  accounts: FunnelMergeAccount[];
  brandContextMerged: boolean;
  aysopChatSessionId?: string;
  importedPostId?: string;
};

/** Move guest social account + brand context onto the signed-in user. */
export async function mergeFunnelSessionToUser(
  funnelToken: string,
  targetUserId: string
): Promise<FunnelMergeResult> {
  const empty: FunnelMergeResult = {
    mergedAccounts: 0,
    accounts: [],
    brandContextMerged: false,
  };

  const row = await getFunnelSessionByToken(funnelToken);
  if (!row || row.mergedToUserId) return empty;

  const guestUserId = row.guestUserId;
  if (guestUserId === targetUserId) return empty;

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: guestUserId, status: 'connected' },
  });

  const mergedAccountRows: FunnelMergeAccount[] = [];
  let mergedAccounts = 0;
  for (const acc of accounts) {
    const existing = await prisma.socialAccount.findFirst({
      where: {
        userId: targetUserId,
        platform: acc.platform,
        platformUserId: acc.platformUserId,
      },
    });
    if (existing) {
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: acc.accessToken,
          refreshToken: acc.refreshToken,
          expiresAt: acc.expiresAt,
          username: acc.username,
          profilePicture: acc.profilePicture,
          scopes: acc.scopes,
          status: 'connected',
          credentialsJson: acc.credentialsJson === null ? Prisma.JsonNull : (acc.credentialsJson as Prisma.InputJsonValue),
          connectedAt: new Date(),
          disconnectedAt: null,
        },
      });
      await prisma.socialAccount.delete({ where: { id: acc.id } }).catch(() => {});
      mergedAccountRows.push({
        id: existing.id,
        platform: existing.platform,
        username: acc.username ?? existing.username ?? undefined,
        profilePicture: acc.profilePicture ?? existing.profilePicture,
      });
    } else {
      await prisma.socialAccount.update({
        where: { id: acc.id },
        data: { userId: targetUserId },
      });
      mergedAccountRows.push({
        id: acc.id,
        platform: acc.platform,
        username: acc.username ?? undefined,
        profilePicture: acc.profilePicture,
      });
    }
    mergedAccounts += 1;
  }

  let brandContextMerged = false;
  if (row.brandContextDraft && typeof row.brandContextDraft === 'object') {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { brandContext: true },
    });
    const current =
      target?.brandContext && typeof target.brandContext === 'object'
        ? (target.brandContext as Record<string, unknown>)
        : {};
    const draft = row.brandContextDraft as Record<string, unknown>;
    const merged = { ...current };
    for (const [k, v] of Object.entries(draft)) {
      if (v != null && String(v).trim()) merged[k] = v;
    }
    await prisma.user.update({
      where: { id: targetUserId },
      data: { brandContext: merged as object },
    });
    brandContextMerged = true;
  }

  const chatPayload =
    row.chatPayload && typeof row.chatPayload === 'object'
      ? (row.chatPayload as FunnelChatPayload)
      : null;
  const aysopChatSessionId = await importFunnelChatToAysop(targetUserId, chatPayload).catch(() => undefined);

  const publishMeta = parseGuestPublishMeta(row.guestPublishMeta);
  const publishAccountId =
    mergedAccountRows.find((a) => a.id === row.connectedAccountId)?.id ??
    mergedAccountRows[0]?.id;
  const importedPostId =
    row.guestPublishUsedAt && publishMeta && publishAccountId
      ? await importGuestPublishToPost(targetUserId, publishAccountId, publishMeta).catch(() => undefined)
      : undefined;

  await prisma.funnelSession.update({
    where: { id: row.id },
    data: { mergedToUserId: targetUserId },
  });

  return {
    mergedAccounts,
    accounts: mergedAccountRows,
    brandContextMerged,
    aysopChatSessionId,
    importedPostId,
  };
}

export function funnelSessionLimitMessage(): string {
  return 'You have reached the 100-message limit for the landing chat. Sign in to continue the conversation in the iZop app with everything you have set up so far.';
}
