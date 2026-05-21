import {
  threadsGet,
  threadsPostForm,
} from '@/lib/threads/threads-api';

export type ThreadsPublishResult =
  | { ok: true; platformPostId: string }
  | { ok: false; error: string };

async function publishCreationId(creationId: string, accessToken: string): Promise<ThreadsPublishResult> {
  const pub = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    'me/threads_publish',
    accessToken,
    { creation_id: creationId }
  );
  if (pub.status !== 200 || !pub.data?.id) {
    const msg =
      pub.data?.error?.message ??
      `Threads publish failed (HTTP ${pub.status})`;
    return { ok: false, error: msg.slice(0, 300) };
  }
  return { ok: true, platformPostId: pub.data.id };
}

export async function publishToThreads(options: {
  accessToken: string;
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}): Promise<ThreadsPublishResult> {
  const text = options.text.trim().slice(0, 500) || ' ';
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

  const create = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    'me/threads',
    token,
    form
  );
  if (create.status !== 200 || !create.data?.id) {
    const msg =
      create.data?.error?.message ??
      `Threads could not create post (HTTP ${create.status})`;
    return { ok: false, error: msg.slice(0, 300) };
  }

  return publishCreationId(create.data.id, token);
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
