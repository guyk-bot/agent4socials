import { Prisma, type Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isFunnelGuestUserId } from '@/lib/funnel-guest';

export class SocialAccountOAuthConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialAccountOAuthConflictError';
  }
}

type OAuthAccountWrite = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  username: string;
  profilePicture?: string | null;
  status: 'connected';
  connectedAt: Date;
  disconnectedAt: null;
  credentialsJson?: object;
  firstConnectedAt?: Date;
};

type UpsertParams = {
  userId: string;
  platform: Platform;
  platformUserId: string;
  funnelFlow: boolean;
  write: OAuthAccountWrite;
};

/** Save or refresh a connected account after OAuth, reclaiming stale funnel-guest rows when safe. */
export async function upsertSocialAccountAfterOAuth(params: UpsertParams): Promise<void> {
  const { userId, platform, platformUserId, funnelFlow, write } = params;
  const updateData: Prisma.SocialAccountUncheckedUpdateInput = {
    accessToken: write.accessToken,
    refreshToken: write.refreshToken,
    expiresAt: write.expiresAt,
    username: write.username,
    ...(write.profilePicture !== undefined ? { profilePicture: write.profilePicture } : {}),
    status: write.status,
    connectedAt: write.connectedAt,
    disconnectedAt: write.disconnectedAt,
    ...(write.credentialsJson ? { credentialsJson: write.credentialsJson } : {}),
  };
  const createData: Prisma.SocialAccountUncheckedCreateInput = {
    userId,
    platform,
    platformUserId,
    accessToken: write.accessToken,
    refreshToken: write.refreshToken,
    expiresAt: write.expiresAt,
    username: write.username,
    ...(write.profilePicture !== undefined ? { profilePicture: write.profilePicture } : {}),
    status: write.status,
    firstConnectedAt: write.firstConnectedAt ?? write.connectedAt,
    connectedAt: write.connectedAt,
    ...(write.credentialsJson ? { credentialsJson: write.credentialsJson } : {}),
  };

  const existingGlobal = await prisma.socialAccount.findUnique({
    where: { platformUserId },
    select: { id: true, userId: true },
  });

  if (existingGlobal && existingGlobal.userId !== userId) {
    const [existingIsGuest, currentIsGuest] = await Promise.all([
      isFunnelGuestUserId(existingGlobal.userId),
      isFunnelGuestUserId(userId),
    ]);

    if (currentIsGuest && !existingIsGuest) {
      throw new SocialAccountOAuthConflictError(
        funnelFlow
          ? 'This account is already connected on iZop. Log in to continue with it.'
          : 'This account is already connected to another iZop user.'
      );
    }

    if (existingIsGuest) {
      await prisma.socialAccount.update({
        where: { id: existingGlobal.id },
        data: { userId, ...updateData },
      });
      return;
    }

    throw new SocialAccountOAuthConflictError('This account is already linked to another iZop user.');
  }

  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: { userId, platform, platformUserId },
    },
    update: updateData,
    create: createData,
  });
}

export function formatSocialAccountOAuthError(e: unknown): string {
  if (e instanceof SocialAccountOAuthConflictError) return e.message;
  const err = e as { code?: string; message?: string; meta?: { target?: string[] } };
  if (err.code === 'P2002') {
    const target = err.meta?.target?.join(', ') ?? 'unique field';
    return `This account is already connected (${target}). Try logging in or disconnecting it first.`;
  }
  if (err.message?.includes('22P02') || /invalid input value for enum/i.test(err.message ?? '')) {
    return 'Database schema is missing the Threads platform type. Contact support or retry in a few minutes.';
  }
  return err.message?.slice(0, 480) ?? 'Could not save account. Check database connection and schema.';
}
