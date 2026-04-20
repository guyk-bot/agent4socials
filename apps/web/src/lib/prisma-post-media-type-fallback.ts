import type { Prisma } from '@prisma/client';

export function isMissingPostMediaTypeColumn(error: unknown): boolean {
  const e = error as { message?: string; code?: string; meta?: { column?: unknown } };
  const msg = String(e?.message ?? '');
  const metaColumn = String(e?.meta?.column ?? '');
  if (e?.code === 'P2022' && metaColumn.toLowerCase().includes('mediatype')) return true;
  return msg.includes('mediaType') && msg.includes('does not exist');
}

/** Post scalars for SELECT — omit mediaType (DB may not have migrated yet). */
export function postScalarsSelectWithoutMediaType(): Pick<
  Prisma.PostSelect,
  | 'id'
  | 'userId'
  | 'title'
  | 'content'
  | 'contentByPlatform'
  | 'mediaByPlatform'
  | 'commentAutomation'
  | 'tiktokPublishByAccountId'
  | 'status'
  | 'scheduledAt'
  | 'scheduleDelivery'
  | 'scheduleEmailSentAt'
  | 'emailOpenToken'
  | 'emailOpenTokenExpiresAt'
  | 'postedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'targetPlatforms'
> {
  return {
    id: true,
    userId: true,
    title: true,
    content: true,
    contentByPlatform: true,
    mediaByPlatform: true,
    commentAutomation: true,
    tiktokPublishByAccountId: true,
    status: true,
    scheduledAt: true,
    scheduleDelivery: true,
    scheduleEmailSentAt: true,
    emailOpenToken: true,
    emailOpenTokenExpiresAt: true,
    postedAt: true,
    createdAt: true,
    updatedAt: true,
    targetPlatforms: true,
  };
}

/** Same as {@link postScalarsSelectWithoutMediaType} plus mediaType when the column exists. */
export function postScalarsSelectWithMediaType(): ReturnType<typeof postScalarsSelectWithoutMediaType> & {
  mediaType: true;
} {
  return { ...postScalarsSelectWithoutMediaType(), mediaType: true };
}

/**
 * Run a Prisma read that prefers selecting `mediaType`, and retries without it when the DB
 * is behind migrations (column missing).
 */
export async function prismaPostReadWithMediaTypeFallback<T>(read: (includeMediaTypeCol: boolean) => Promise<T>): Promise<T> {
  try {
    return await read(true);
  } catch (e) {
    if (!isMissingPostMediaTypeColumn(e)) throw e;
    return await read(false);
  }
}
