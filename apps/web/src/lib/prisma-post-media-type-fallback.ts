import type { Prisma } from '@prisma/client';

export function isMissingPostMediaTypeColumn(error: unknown): boolean {
  const e = error as { message?: string; code?: string; meta?: { column?: unknown } };
  const msg = String(e?.message ?? '');
  const metaColumn = String(e?.meta?.column ?? '');
  if (e?.code === 'P2022' && metaColumn.toLowerCase().includes('mediatype')) return true;
  return msg.includes('mediaType') && msg.includes('does not exist');
}

export function isMissingPostThreadsShareToInstagramColumn(error: unknown): boolean {
  const e = error as { message?: string; code?: string; meta?: { column?: unknown } };
  const msg = String(e?.message ?? '');
  const metaColumn = String(e?.meta?.column ?? '');
  if (e?.code === 'P2022' && metaColumn.toLowerCase().includes('threadssharetoinstagram')) return true;
  return msg.includes('threadsShareToInstagram') && msg.includes('does not exist');
}

export function isMissingPostAlsoPostToStoryColumn(error: unknown): boolean {
  const e = error as { message?: string; code?: string; meta?: { column?: unknown } };
  const msg = String(e?.message ?? '');
  const metaColumn = String(e?.meta?.column ?? '');
  if (e?.code === 'P2022' && metaColumn.toLowerCase().includes('alsoposttostory')) return true;
  return msg.includes('alsoPostToStory') && msg.includes('does not exist');
}

type PostScalarKey =
  | 'id'
  | 'userId'
  | 'title'
  | 'content'
  | 'contentByPlatform'
  | 'mediaByPlatform'
  | 'commentAutomation'
  | 'tiktokPublishByAccountId'
  | 'threadsShareToInstagram'
  | 'alsoPostToStory'
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
  | 'mediaType';

function postScalarsSelectCore(): Pick<Prisma.PostSelect, PostScalarKey> {
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

export function buildPostScalarsSelect(opts: {
  withMediaType?: boolean;
  withThreadsShareToInstagram?: boolean;
  withAlsoPostToStory?: boolean;
}): Pick<Prisma.PostSelect, PostScalarKey> {
  return {
    ...postScalarsSelectCore(),
    ...(opts.withThreadsShareToInstagram ? { threadsShareToInstagram: true } : {}),
    ...(opts.withAlsoPostToStory ? { alsoPostToStory: true } : {}),
    ...(opts.withMediaType ? { mediaType: true } : {}),
  };
}

/** Post scalars when mediaType column may be missing (includes threadsShare when that column exists). */
export function postScalarsSelectWithoutMediaType(): Pick<Prisma.PostSelect, PostScalarKey> {
  return buildPostScalarsSelect({ withThreadsShareToInstagram: true, withAlsoPostToStory: true });
}

/** Full post scalars when DB has mediaType and threadsShareToInstagram columns. */
export function postScalarsSelectWithMediaType(): ReturnType<typeof postScalarsSelectWithoutMediaType> & {
  mediaType: true;
} {
  return buildPostScalarsSelect({
    withMediaType: true,
    withThreadsShareToInstagram: true,
    withAlsoPostToStory: true,
  }) as ReturnType<typeof postScalarsSelectWithoutMediaType> & { mediaType: true };
}

export type PostReadSchemaOpts = {
  withMediaType: boolean;
  withThreadsShareToInstagram: boolean;
  withAlsoPostToStory: boolean;
};

/**
 * Run a Prisma Post read, retrying with fewer columns when the DB is behind migrations.
 */
export async function prismaPostReadWithMediaTypeFallback<T>(
  read: (opts: PostReadSchemaOpts) => Promise<T>
): Promise<T> {
  const attempts: PostReadSchemaOpts[] = [
    { withMediaType: true, withThreadsShareToInstagram: true, withAlsoPostToStory: true },
    { withMediaType: false, withThreadsShareToInstagram: true, withAlsoPostToStory: true },
    { withMediaType: true, withThreadsShareToInstagram: false, withAlsoPostToStory: true },
    { withMediaType: false, withThreadsShareToInstagram: false, withAlsoPostToStory: true },
    { withMediaType: true, withThreadsShareToInstagram: true, withAlsoPostToStory: false },
    { withMediaType: false, withThreadsShareToInstagram: true, withAlsoPostToStory: false },
    { withMediaType: true, withThreadsShareToInstagram: false, withAlsoPostToStory: false },
    { withMediaType: false, withThreadsShareToInstagram: false, withAlsoPostToStory: false },
  ];
  let lastError: unknown;
  for (const opts of attempts) {
    try {
      return await read(opts);
    } catch (e) {
      lastError = e;
      if (
        !isMissingPostMediaTypeColumn(e) &&
        !isMissingPostThreadsShareToInstagramColumn(e) &&
        !isMissingPostAlsoPostToStoryColumn(e)
      ) {
        throw e;
      }
    }
  }
  throw lastError;
}

/** Strip Post write fields that are not migrated yet. */
export function stripMissingPostColumnsFromWriteData(
  data: Record<string, unknown>,
  error: unknown
): Record<string, unknown> {
  let next = { ...data };
  if (isMissingPostMediaTypeColumn(error)) {
    const { mediaType: _m, ...rest } = next;
    next = rest;
  }
  if (isMissingPostThreadsShareToInstagramColumn(error)) {
    const { threadsShareToInstagram: _t, ...rest } = next;
    next = rest;
  }
  if (isMissingPostAlsoPostToStoryColumn(error)) {
    const { alsoPostToStory: _a, ...rest } = next;
    next = rest;
  }
  return next;
}
