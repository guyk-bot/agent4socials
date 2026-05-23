import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { MetaGraphThrottledError, runMetaGraphRequest } from '@/lib/meta-graph-queue';
import { threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';

export type PostMediaItem = {
  kind: 'image' | 'video';
  /** App-relative proxy URL safe for img/video src. */
  src: string;
  poster?: string;
};

export type PostMediaPayload = {
  kind: 'none' | 'image' | 'video' | 'carousel';
  items: PostMediaItem[];
};

export function proxyMediaUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

type AccountRow = {
  id: string;
  platform: string;
  accessToken: string | null;
  expiresAt?: Date | null;
  credentialsJson?: unknown;
};

type ThreadsMediaRow = {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
};

function threadsMediaItem(row: ThreadsMediaRow): PostMediaItem | null {
  const mt = (row.media_type ?? '').toUpperCase();
  if (mt === 'VIDEO') {
    const src = row.media_url ?? row.thumbnail_url;
    if (!src) return null;
    return {
      kind: 'video',
      src: proxyMediaUrl(src),
      poster: row.thumbnail_url ? proxyMediaUrl(row.thumbnail_url) : undefined,
    };
  }
  const img = row.media_url ?? row.thumbnail_url;
  if (!img) return null;
  return { kind: 'image', src: proxyMediaUrl(img) };
}

async function resolveThreadsMedia(account: AccountRow, postId: string): Promise<PostMediaPayload> {
  const token = await getValidThreadsToken({
    id: account.id,
    accessToken: account.accessToken ?? '',
    expiresAt: account.expiresAt,
  });
  const { status, data } = await threadsGet<{
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    children?: { data?: ThreadsMediaRow[] };
  }>(postId, token, {
    fields: 'media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}',
  });
  if (status !== 200) return { kind: 'none', items: [] };

  const mt = (data?.media_type ?? '').toUpperCase();
  if (mt === 'CAROUSEL_ALBUM') {
    const items = (data?.children?.data ?? [])
      .map((child) => threadsMediaItem(child))
      .filter((x): x is PostMediaItem => x != null);
    if (items.length > 0) return { kind: 'carousel', items };
  }

  const single = threadsMediaItem(data ?? {});
  if (single) return { kind: single.kind, items: [single] };
  return { kind: 'none', items: [] };
}

async function resolveInstagramMedia(
  account: AccountRow,
  postId: string,
  isBusinessLogin: boolean
): Promise<PostMediaPayload> {
  const token = account.accessToken ?? '';
  try {
    const apiBase = isBusinessLogin
      ? `https://graph.instagram.com/v25.0/${postId}`
      : `${facebookGraphBaseUrl}/${postId}`;
    const res = await runMetaGraphRequest('post-media-ig', () =>
      axios.get<{
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        children?: { data?: Array<{ media_type?: string; media_url?: string; thumbnail_url?: string }> };
      }>(apiBase, {
        params: {
          fields: 'media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}',
          access_token: token,
        },
        timeout: 10_000,
      })
    );
    const mt = (res.data?.media_type ?? '').toUpperCase();
    if (mt === 'CAROUSEL_ALBUM') {
      const items = (res.data?.children?.data ?? [])
        .map((child) => {
          const url = child.media_url ?? child.thumbnail_url;
          if (!url) return null;
          const kind = (child.media_type ?? '').toUpperCase() === 'VIDEO' ? 'video' : 'image';
          return { kind, src: proxyMediaUrl(url) } as PostMediaItem;
        })
        .filter((x): x is PostMediaItem => x != null);
      if (items.length > 0) return { kind: 'carousel', items };
    }
    if (mt === 'VIDEO') {
      const src = res.data?.media_url ?? res.data?.thumbnail_url;
      if (src) {
        return {
          kind: 'video',
          items: [
            {
              kind: 'video',
              src: proxyMediaUrl(src),
              poster: res.data?.thumbnail_url ? proxyMediaUrl(res.data.thumbnail_url) : undefined,
            },
          ],
        };
      }
    }
    const img = res.data?.media_url ?? res.data?.thumbnail_url;
    if (img) return { kind: 'image', items: [{ kind: 'image', src: proxyMediaUrl(img) }] };
  } catch (e) {
    if (!(e instanceof MetaGraphThrottledError)) {
      /* fall through to DB */
    }
  }
  return { kind: 'none', items: [] };
}

async function resolveFacebookMedia(account: AccountRow, postId: string): Promise<PostMediaPayload> {
  const token = account.accessToken ?? '';
  try {
    const res = await axios.get<{
      full_picture?: string;
      picture?: string;
      attachments?: {
        data?: Array<{
          type?: string;
          media?: { image?: { src?: string }; source?: string };
          subattachments?: { data?: Array<{ media?: { image?: { src?: string }; source?: string } }> };
        }>;
      };
    }>(`${facebookGraphBaseUrl}/${postId}`, {
      params: {
        fields:
          'full_picture,picture,attachments{type,media{image{src},source},subattachments{data{media{image{src},source}}}}',
        access_token: token,
      },
      timeout: 10_000,
    });
    const attachments = res.data?.attachments?.data ?? [];
    if (attachments.length > 1) {
      const items = attachments
        .flatMap((att) => {
          const src = att.media?.source ?? att.media?.image?.src;
          if (!src) return [];
          const kind = att.type === 'video_inline' || /\.mp4(\?|$)/i.test(src) ? 'video' : 'image';
          return [{ kind, src: proxyMediaUrl(src) } as PostMediaItem];
        })
        .filter(Boolean);
      if (items.length > 0) return { kind: 'carousel', items };
    }
    if (attachments[0]) {
      const att = attachments[0];
      const src = att.media?.source ?? att.media?.image?.src;
      if (src) {
        const kind = att.type === 'video_inline' || /\.mp4(\?|$)/i.test(src) ? 'video' : 'image';
        return { kind, items: [{ kind, src: proxyMediaUrl(src) }] };
      }
      const sub = att.subattachments?.data?.[0]?.media;
      const subSrc = sub?.source ?? sub?.image?.src;
      if (subSrc) {
        return { kind: 'image', items: [{ kind: 'image', src: proxyMediaUrl(subSrc) }] };
      }
    }
    const img = res.data?.full_picture ?? res.data?.picture;
    if (img) return { kind: 'image', items: [{ kind: 'image', src: proxyMediaUrl(img) }] };
  } catch {
    /* DB fallback below */
  }
  return { kind: 'none', items: [] };
}

export async function resolvePostMediaForInbox(
  account: AccountRow,
  postId: string
): Promise<PostMediaPayload> {
  const imp = await prisma.importedPost.findFirst({
    where: { platformPostId: postId, socialAccountId: account.id },
    select: { thumbnailUrl: true, mediaType: true },
  });
  if (imp?.thumbnailUrl) {
    const mt = (imp.mediaType ?? '').toLowerCase();
    const kind = mt.includes('video') ? 'video' : 'image';
    return { kind, items: [{ kind, src: proxyMediaUrl(imp.thumbnailUrl) }] };
  }

  const platform = account.platform;
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };
  const isBusinessLogin = platform === 'INSTAGRAM' && credJson.loginMethod === 'instagram_business';

  if (platform === 'THREADS') {
    return resolveThreadsMedia(account, postId);
  }
  if (platform === 'INSTAGRAM') {
    return resolveInstagramMedia(account, postId, isBusinessLogin);
  }
  if (platform === 'FACEBOOK') {
    return resolveFacebookMedia(account, postId);
  }
  if (platform === 'YOUTUBE') {
    return {
      kind: 'image',
      items: [{ kind: 'image', src: proxyMediaUrl(`https://i.ytimg.com/vi/${postId}/mqdefault.jpg`) }],
    };
  }
  if (platform === 'TWITTER') {
    const token = account.accessToken ?? '';
    try {
      const tr = await axios.get<{
        data?: { attachments?: { media_keys?: string[] } };
        includes?: {
          media?: Array<{ media_key: string; type?: string; url?: string; preview_image_url?: string }>;
        };
      }>(`https://api.twitter.com/2/tweets/${postId}`, {
        params: {
          'tweet.fields': 'attachments',
          expansions: 'attachments.media_keys',
          'media.fields': 'type,url,preview_image_url',
        },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8_000,
      });
      const keys = tr.data?.data?.attachments?.media_keys ?? [];
      const mediaList = tr.data?.includes?.media ?? [];
      const items = keys
        .map((key) => mediaList.find((m) => m.media_key === key))
        .filter(Boolean)
        .map((m) => {
          const url = m!.preview_image_url ?? m!.url;
          if (!url) return null;
          const kind = m!.type === 'video' || m!.type === 'animated_gif' ? 'video' : 'image';
          return { kind, src: proxyMediaUrl(url) } as PostMediaItem;
        })
        .filter((x): x is PostMediaItem => x != null);
      if (items.length > 1) return { kind: 'carousel', items };
      if (items.length === 1) return { kind: items[0]!.kind, items };
    } catch {
      /* none */
    }
  }

  return { kind: 'none', items: [] };
}
