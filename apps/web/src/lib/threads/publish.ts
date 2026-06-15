import {
  threadsGet,
  threadsPostForm,
} from '@/lib/threads/threads-api';

export type ThreadsPublishResult =
  | { ok: true; platformPostId: string }
  | { ok: false; error: string };

async function publishCreationId(
  creationId: string,
  accessToken: string,
  options?: { shareToInstagramStory?: boolean }
): Promise<ThreadsPublishResult> {
  const form: Record<string, string> = { creation_id: creationId };
  // Meta also accepts this on publish; keep for compatibility with older docs/scripts.
  if (options?.shareToInstagramStory) {
    form.crossreshare_to_ig = 'true';
  }
  
  console.log('[publishCreationId] Publishing with form:', form);
  const pub = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    'me/threads_publish',
    accessToken,
    form
  );
  console.log('[publishCreationId] Publish response:', {
    status: pub.status,
    hasId: Boolean(pub.data?.id),
    id: pub.data?.id,
    error: pub.data?.error,
    fullData: pub.data,
  });

  if (pub.status !== 200 || !pub.data?.id) {
    const msg =
      pub.data?.error?.message ??
      `Threads publish failed (HTTP ${pub.status})`;
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
    console.log('[publishToThreads] ERROR: Empty text after trim');
    return { ok: false, error: 'Threads requires caption text. Add a caption in the composer.' };
  }
  const token = options.accessToken;

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

  // Official Threads API: crossreshare_to_ig is set on container creation (me/threads).
  if (options.shareToInstagramStory === true) {
    form.crossreshare_to_ig = 'true';
  }

  console.log('[publishToThreads] Creating container with form:', form);
  const create = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    'me/threads',
    token,
    form
  );
  console.log('[publishToThreads] Container creation response:', {
    status: create.status,
    hasId: Boolean(create.data?.id),
    id: create.data?.id,
    error: create.data?.error,
    fullData: create.data,
  });

  if (create.status !== 200 || !create.data?.id) {
    const msg =
      create.data?.error?.message ??
      `Threads could not create post (HTTP ${create.status})`;
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

  console.log('[publishToThreads] Publishing container ID:', containerId);
  const result = await publishCreationId(containerId, token, {
    shareToInstagramStory: options.shareToInstagramStory === true,
  });
  console.log('[publishToThreads] Final result:', { ok: result.ok, error: result.ok ? undefined : result.error });
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
