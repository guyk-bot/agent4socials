'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PostHistoryTextThumb } from '@/components/PostContentPreviewThumb';

type PostMediaItem = {
  kind: 'image' | 'video';
  src: string;
  poster?: string;
};

type PostMediaPayload = {
  kind: 'none' | 'image' | 'video' | 'carousel';
  items: PostMediaItem[];
};

type InboxCommentPostMediaProps = {
  accountId: string;
  platformPostId: string;
  platform: string;
  fallbackImageUrl?: string | null;
  textOnlyPost?: boolean;
  className?: string;
};

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/')) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function MediaItemView({ item }: { item: PostMediaItem }) {
  if (item.kind === 'video') {
    return (
      <video
        src={item.src}
        poster={item.poster}
        controls
        playsInline
        preload="metadata"
        className="w-full h-auto object-contain max-h-[22rem] rounded-lg bg-black"
      />
    );
  }
  return (
    <img
      src={item.src}
      alt="Post"
      className="w-full h-auto object-contain max-h-[22rem] rounded-lg"
      loading="eager"
    />
  );
}

export function InboxCommentPostMedia({
  accountId,
  platformPostId,
  platform,
  fallbackImageUrl,
  textOnlyPost = false,
  className,
}: InboxCommentPostMediaProps) {
  const fallbackSrc = useMemo(() => proxyImageUrl(fallbackImageUrl), [fallbackImageUrl]);
  const [media, setMedia] = useState<PostMediaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setMedia(null);

    const url = `/api/post-media?accountId=${encodeURIComponent(accountId)}&postId=${encodeURIComponent(platformPostId)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error('post-media failed');
        return res.json() as Promise<PostMediaPayload>;
      })
      .then((data) => {
        if (cancelled) return;
        setMedia(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, platformPostId, platform]);

  const showFallback = failed || !media || media.kind === 'none' || media.items.length === 0;

  if (loading && fallbackSrc) {
    return (
      <div className={className}>
        <img src={fallbackSrc} alt="Post" className="w-full h-auto object-contain max-h-[22rem] rounded-lg opacity-80" />
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Loader2 size={12} className="animate-spin" />
          Loading media…
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 p-8 text-neutral-400 min-h-[200px] bg-neutral-50 rounded-lg ${className ?? ''}`}>
        <Loader2 size={28} className="animate-spin text-orange-400" />
        <span className="text-sm">Loading post media…</span>
      </div>
    );
  }

  if (showFallback) {
    if (fallbackSrc) {
      return (
        <div className={className}>
          <img src={fallbackSrc} alt="Post" className="w-full h-auto object-contain max-h-[22rem] rounded-lg" />
        </div>
      );
    }
    if (textOnlyPost) {
      return (
        <div className={`flex items-center justify-center p-6 min-h-[12rem] ${className ?? ''}`}>
          <PostHistoryTextThumb platform={platform} variant="inbox" className="w-24 h-28" />
        </div>
      );
    }
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 p-8 min-h-[12rem] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-400 ${className ?? ''}`}
      >
        <span className="text-sm text-center">No preview for this post</span>
      </div>
    );
  }

  if (media!.kind === 'carousel' && media!.items.length > 1) {
    return (
      <div className={`flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory ${className ?? ''}`}>
        {media!.items.map((item, idx) => (
          <div key={`${item.src}-${idx}`} className="snap-start shrink-0 w-[min(200px,70vw)]">
            <MediaItemView item={item} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <MediaItemView item={media!.items[0]!} />
    </div>
  );
}
