import {
  threadsGet,
  threadsPostForm,
} from '@/lib/threads/threads-api';

export type ThreadsPublishResult =
  | { ok: true; platformPostId: string; igStoryShareSkipped?: boolean }
  | { ok: false; error: string };

/** Meta returns this when threads_share_to_instagram is not granted or app is not approved for IG cross-share. */
export const THREADS_IG_SHARE_UNAVAILABLE_SUBCODE = 4279044;

type ThreadsApiErrorBody = {
  error?: {
    message?: string;
    error_subcode?: number;
    error_user_title?: string;
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
      'Instagram Story sharing is not available for this Threads account yet. The post was not sent with Story sharing.'
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
  let form: Record<string, string>;
  if (options.videoUrl?.trim()) {
    form = {
      media_type: 'VIDEO',
      video_url: options.videoUrl.trim(),
      text,
    };
  } else if (options.imageUrl?.trim()) {
    form = {
      media_type: 'IMAGE',
      image_url: options.imageUrl.trim(),
      text,
    };
  } else {
    form = {
      media_type: 'TEXT',
      text,
    };
  }
  if (options.shareToInstagramStory === true) {
    form.crossreshare_to_ig = 'true';
  }
  return form;
}

async function createThreadsContainer(
  accessToken: string,
  baseForm: Record<string, string>,
  tryIgShare: boolean
): Promise<
  | { ok: true; containerId: string; igShareUsed: boolean; igShareSkipped?: boolean }
  | { ok: false; error: string }
> {
  const postContainer = async (form: Record<string, string>) =>
    threadsPostForm<{ id?: string } & ThreadsApiErrorBody>('me/threads', accessToken, form);

  if (tryIgShare) {
    const withIg = { ...baseForm, crossreshare_to_ig: 'true' };
    console.log('[publishToThreads] Creating container with IG Story share');
    const first = await postContainer(withIg);
    if (first.status === 200 && first.data?.id) {
      return { ok: true, containerId: first.data.id, igShareUsed: true };
    }
    if (isThreadsInstagramShareUnavailableError(first.data)) {
      console.log(
        '[publishToThreads] IG Story share not available (4279044), retrying Threads-only container'
      );
      const withoutIg = { ...baseForm };
      delete withoutIg.crossreshare_to_ig;
      const second = await postContainer(withoutIg);
      if (second.status === 200 && second.data?.id) {
        return {
          ok: true,
          containerId: second.data.id,
          igShareUsed: false,
          igShareSkipped: true,
        };
      }
      return {
        ok: false,
        error: threadsApiErrorMessage(second.data, second.status).slice(0, 300),
      };
    }
    return {
      ok: false,
      error: threadsApiErrorMessage(first.data, first.status).slice(0, 300),
    };
  }

  console.log('[publishToThreads] Creating container (Threads only)');
  const create = await postContainer(baseForm);
  if (create.status === 200 && create.data?.id) {
    return { ok: true, containerId: create.data.id, igShareUsed: false };
  }
  return {
    ok: false,
    error: threadsApiErrorMessage(create.data, create.status).slice(0, 300),
  };
}

async function publishCreationId(
  creationId: string,
  accessToken: string,
  options?: { shareToInstagramStory?: boolean }
): Promise<ThreadsPublishResult> {
  const form: Record<string, string> = { creation_id: creationId };
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

  if (pub.status !== 200 || !pub.data?.id) {
    const msg = threadsApiErrorMessage(pub.data, pub.status);
    console.log('[publishCreationId] Publish FAILED:', msg);
    return { ok: false, error: msg.slice(0, 300) };
  }
  return { ok: true, platformPostId: pub.data.id };
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
  const baseForm = buildContainerForm({
    text,
    imageUrl: options.imageUrl,
    videoUrl: options.videoUrl,
    shareToInstagramStory: false,
  });

  const created = await createThreadsContainer(
    token,
    baseForm,
    options.shareToInstagramStory === true
  );
  if (!created.ok) {
    console.log('[publishToThreads] Container creation FAILED:', created.error);
    return { ok: false, error: created.error };
  }

  const containerId = created.containerId;
  if (options.videoUrl?.trim()) {
    const ready = await waitForThreadsContainerReady(containerId, token);
    if (!ready) {
      return {
        ok: false,
        error: 'Threads video is still processing. Try again in a minute.',
      };
    }
  }

  console.log('[publishToThreads] Publishing container ID:', containerId);
  const result = await publishCreationId(containerId, token, {
    shareToInstagramStory: created.igShareUsed,
  });
  if (!result.ok) {
    console.log('[publishToThreads] Final result:', { ok: false, error: result.error });
    return result;
  }

  console.log('[publishToThreads] Final result:', {
    ok: true,
    igStoryShareSkipped: created.igShareSkipped,
  });
  return {
    ok: true,
    platformPostId: result.platformPostId,
    ...(created.igShareSkipped ? { igStoryShareSkipped: true } : {}),
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
