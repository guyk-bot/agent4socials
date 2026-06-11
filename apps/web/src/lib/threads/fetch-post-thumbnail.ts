import { isLikelyVideoMediaUrl } from '@/lib/inbox/media-url';
import { threadsGet } from '@/lib/threads/threads-api';
import { normalizeThreadsMediaType, threadsPostThumbnailUrl } from '@/lib/threads/post-media-type';

type ThreadsMediaRow = {
  media_type?: string | null;
  thumbnail_url?: string | null;
  media_url?: string | null;
  children?: { data?: ThreadsMediaRow[] };
};

/** Best thumbnail from a Threads media row, including first carousel child. */
export function threadsPostThumbnailFromMediaRow(row: ThreadsMediaRow): string | null {
  const direct = threadsPostThumbnailUrl(row);
  if (direct) return direct;
  for (const child of row.children?.data ?? []) {
    const childThumb = threadsPostThumbnailUrl(child);
    if (childThumb) return childThumb;
  }
  return null;
}

/** Live fetch when me/threads list rows omit thumbnail_url (common for video). */
export async function fetchThreadsPostThumbnail(
  postId: string,
  token: string
): Promise<string | null> {
  const id = postId.replace(/^\//, '').trim();
  if (!id) return null;
  const { status, data } = await threadsGet<ThreadsMediaRow>(id, token, {
    fields: 'media_type,thumbnail_url,media_url,children{media_type,thumbnail_url,media_url}',
  });
  if (status !== 200) return null;
  return threadsPostThumbnailFromMediaRow(data ?? {});
}

export function threadsRowNeedsThumbnailFetch(mediaType: string | null | undefined): boolean {
  const mt = normalizeThreadsMediaType(mediaType);
  return mt === 'VIDEO' || mt === 'IMAGE' || mt === 'CAROUSEL' || mt === 'AUDIO';
}

export async function resolveThreadsPostThumbnail(
  row: ThreadsMediaRow & { id?: string },
  token: string
): Promise<string | null> {
  const fromList = threadsPostThumbnailFromMediaRow(row);
  if (fromList && !isLikelyVideoMediaUrl(fromList)) return fromList;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id || !threadsRowNeedsThumbnailFetch(row.media_type)) return null;
  return fetchThreadsPostThumbnail(id, token);
}
