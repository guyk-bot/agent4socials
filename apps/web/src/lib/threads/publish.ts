import {
  threadsGet,
  threadsPostForm,
} from '@/lib/threads/threads-api';

export type ThreadsPublishResult =
  | { ok: true; platformPostId: string; igStoryShareSkipped?: boolean }
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
}): Record<string, string> {
  const text = options.text.trim().slice(0, 500);
  if (options.videoUrl?.trim()) {
    return {
      media_type: 'VIDEO',
      video_url: options.videoUrl.trim(),
      text,
    };
  }
  if (options.imageUrl?.trim()) {
    return {
      media_type: 'IMAGE',
      image_url: options.imageUrl.trim(),
      text,
    };
  }
  return {
    media_type: 'TEXT',
    text,
  };
}

type PublishCreationResult =
  | { ok: true; platformPostId: string }
  | { ok: false; error: string; igShareUnavailable?: boolean };

async function publishCreationId(
  creationId: string,
  accessToken: string,
  options?: { shareToInstagramStory?: boolean }
): Promise<PublishCreationResult> {
  const form: Record<string, string> = { creation_id: creationId };
  // IG Story cross-share belongs on publish, not container creation (see cb5bd251 regression).
  if (options?.shareToInstagramStory) {
    form.crossreshare_to_ig = 'true';
  }

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
  return {
    ok: false,
    error: msg.slice(0, 300),
    igShareUnavailable: isThreadsInstagramShareUnavailableError(pub.data),
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
  const form = buildContainerForm({
    text,
    imageUrl: options.imageUrl,
    videoUrl: options.videoUrl,
  });

  // Never set crossreshare_to_ig here. Container creation must succeed first; IG Story is requested on publish.
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

  if (create.status !== 200 || !create.data?.id) {
    const msg = threadsApiErrorMessage(create.data, create.status);
    console.log('[publishToThreads] Container creation FAILED:', msg);
    return { ok: false, error: msg.slice(0, 300) };
  }

  const containerId = create.data.id;
  if (options.videoUrl?.trim()) {
    const ready = await waitForThreadsContainerReady(containerId, token);
    if (!ready) {
      return {
        ok: false,
        error: 'Threads video is still processing. Try again in a minute.',
      };
    }
  }

  const wantIgShare = options.shareToInstagramStory === true;
  console.log('[publishToThreads] Publishing container ID:', containerId, { wantIgShare });

  if (wantIgShare) {
    const withIg = await publishCreationId(containerId, token, { shareToInstagramStory: true });
    if (withIg.ok) {
      return withIg;
    }
    if (!withIg.igShareUnavailable) {
      return withIg;
    }
    console.log('[publishToThreads] IG Story publish failed, retrying Threads-only publish');
    const withoutIg = await publishCreationId(containerId, token, { shareToInstagramStory: false });
    if (withoutIg.ok) {
      return { ...withoutIg, igStoryShareSkipped: true };
    }
    return withoutIg;
  }

  const result = await publishCreationId(containerId, token, { shareToInstagramStory: false });
  return result;
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
