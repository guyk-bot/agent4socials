import {
  threadsGet,
  threadsPostForm,
} from '@/lib/threads/threads-api';

export type ThreadsPublishResult =
  | {
      ok: true;
      platformPostId: string;
      /** Container was created with crossreshare_to_ig (Meta's documented path). */
      igStoryCrossShareUsed?: boolean;
      /** crossreshare_to_ig was rejected; caller should use native Instagram Story publish. */
      igStoryCrossShareUnavailable?: boolean;
    }
  | { ok: false; error: string };

/** Meta returns this when threads_share_to_instagram is not granted or IG is not linked. */
export const THREADS_IG_SHARE_UNAVAILABLE_SUBCODE = 4279044;

type ThreadsApiErrorBody = {
  error?: {
    message?: string;
    error_subcode?: number;
    error_user_msg?: string;
  };
};

function threadsApiErrorSubcode(data: unknown): number | undefined {
  const subcode = (data as ThreadsApiErrorBody)?.error?.error_subcode;
  return typeof subcode === 'number' ? subcode : undefined;
}

export function isThreadsInstagramShareUnavailableError(data: unknown): boolean {
  return threadsApiErrorSubcode(data) === THREADS_IG_SHARE_UNAVAILABLE_SUBCODE;
}

function threadsApiErrorMessage(data: unknown, httpStatus: number): string {
  const err = (data as ThreadsApiErrorBody)?.error;
  if (isThreadsInstagramShareUnavailableError(data)) {
    return (
      err?.error_user_msg ??
      'Instagram Story sharing is not available for this Threads account yet.'
    );
  }
  return err?.message ?? `Threads request failed (HTTP ${httpStatus})`;
}

function buildContainerForm(options: {
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  shareToInstagramStory?: boolean;
}): Record<string, string> {
  const text = options.text.trim().slice(0, 500);
  const form: Record<string, string> = options.videoUrl?.trim()
    ? {
        media_type: 'VIDEO',
        video_url: options.videoUrl.trim(),
        text,
      }
    : options.imageUrl?.trim()
      ? {
          media_type: 'IMAGE',
          image_url: options.imageUrl.trim(),
          text,
        }
      : {
          media_type: 'TEXT',
          text,
        };

  // Meta documents crossreshare_to_ig on container creation (POST me/threads), not threads_publish.
  if (options.shareToInstagramStory) {
    form.crossreshare_to_ig = 'true';
  }
  return form;
}

async function publishCreationId(
  creationId: string,
  accessToken: string
): Promise<{ ok: true; platformPostId: string } | { ok: false; error: string }> {
  const form: Record<string, string> = { creation_id: creationId };

  console.log('[publishCreationId] Publishing with form:', form);
  const pub = await threadsPostForm<{ id?: string } & ThreadsApiErrorBody>(
    'me/threads_publish',
    accessToken,
    form
  );
  console.log('[publishCreationId] Publish response:', {
    status: pub.status,
    hasId: Boolean(pub.data?.id),
    id: pub.data?.id,
    error: pub.data?.error,
  });

  if (pub.status === 200 && pub.data?.id) {
    return { ok: true, platformPostId: pub.data.id };
  }

  const msg = threadsApiErrorMessage(pub.data, pub.status);
  console.log('[publishCreationId] Publish FAILED:', msg);
  return { ok: false, error: msg.slice(0, 300) };
}

async function createThreadsContainer(
  token: string,
  form: Record<string, string>
): Promise<
  | { ok: true; containerId: string }
  | { ok: false; error: string; igShareUnavailable?: boolean }
> {
  console.log('[publishToThreads] Creating container with form:', form);
  const create = await threadsPostForm<{ id?: string } & ThreadsApiErrorBody>(
    'me/threads',
    token,
    form
  );
  console.log('[publishToThreads] Container creation response:', {
    status: create.status,
    hasId: Boolean(create.data?.id),
    id: create.data?.id,
    error: create.data?.error,
  });

  if (create.status === 200 && create.data?.id) {
    return { ok: true, containerId: create.data.id };
  }

  const msg = threadsApiErrorMessage(create.data, create.status);
  return {
    ok: false,
    error: msg.slice(0, 300),
    igShareUnavailable: isThreadsInstagramShareUnavailableError(create.data),
  };
}

export async function publishToThreads(options: {
  accessToken: string;
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  /** Cross-post to linked Instagram account as a Story (requires threads_share_to_instagram). */
  shareToInstagramStory?: boolean;
}): Promise<ThreadsPublishResult> {
  console.log('[publishToThreads] Called with options:', {
    textLength: options.text?.length,
    hasImageUrl: Boolean(options.imageUrl),
    hasVideoUrl: Boolean(options.videoUrl),
    imageUrl: options.imageUrl?.slice(0, 100),
    videoUrl: options.videoUrl?.slice(0, 100),
    shareToInstagramStory: options.shareToInstagramStory,
    tokenLength: options.accessToken?.length,
  });

  const text = options.text.trim().slice(0, 500);
  if (!text) {
    return { ok: false, error: 'Threads requires caption text. Add a caption in the composer.' };
  }
  const token = options.accessToken;
  const wantIgShare = options.shareToInstagramStory === true;

  let containerId: string;
  let igStoryCrossShareUsed = false;
  let igStoryCrossShareUnavailable = false;

  if (wantIgShare) {
    const withIg = await createThreadsContainer(
      token,
      buildContainerForm({
        text,
        imageUrl: options.imageUrl,
        videoUrl: options.videoUrl,
        shareToInstagramStory: true,
      })
    );
    if (withIg.ok) {
      containerId = withIg.containerId;
      igStoryCrossShareUsed = true;
    } else if (withIg.igShareUnavailable) {
      console.log(
        '[publishToThreads] IG Story cross-share rejected on container; retrying without crossreshare'
      );
      igStoryCrossShareUnavailable = true;
      const withoutIg = await createThreadsContainer(
        token,
        buildContainerForm({
          text,
          imageUrl: options.imageUrl,
          videoUrl: options.videoUrl,
          shareToInstagramStory: false,
        })
      );
      if (!withoutIg.ok) {
        return { ok: false, error: withoutIg.error };
      }
      containerId = withoutIg.containerId;
    } else {
      return { ok: false, error: withIg.error };
    }
  } else {
    const created = await createThreadsContainer(
      token,
      buildContainerForm({
        text,
        imageUrl: options.imageUrl,
        videoUrl: options.videoUrl,
        shareToInstagramStory: false,
      })
    );
    if (!created.ok) {
      return { ok: false, error: created.error };
    }
    containerId = created.containerId;
  }

  if (options.videoUrl?.trim()) {
    const ready = await waitForThreadsContainerReady(containerId, token);
    if (!ready) {
      return {
        ok: false,
        error: 'Threads video is still processing. Try again in a minute.',
      };
    }
  }

  console.log('[publishToThreads] Publishing container ID:', containerId, {
    igStoryCrossShareUsed,
    igStoryCrossShareUnavailable,
  });

  const published = await publishCreationId(containerId, token);
  if (!published.ok) {
    return published;
  }

  return {
    ok: true,
    platformPostId: published.platformPostId,
    ...(igStoryCrossShareUsed ? { igStoryCrossShareUsed: true } : {}),
    ...(igStoryCrossShareUnavailable ? { igStoryCrossShareUnavailable: true } : {}),
  };
}

/** Poll video container until ready (best-effort). */
export async function waitForThreadsContainerReady(
  containerId: string,
  accessToken: string,
  maxWaitMs = 120_000
): Promise<boolean> {
  const interval = 3_000;
  for (let elapsed = 0; elapsed < maxWaitMs; elapsed += interval) {
    const { status, data } = await threadsGet<{ status?: string }>(
      containerId,
      accessToken,
      { fields: 'status' }
    );
    if (status === 200 && data?.status === 'FINISHED') return true;
    if (status === 200 && data?.status === 'ERROR') return false;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}
