'use client';

import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { PostHistoryTextThumb } from '@/components/PostContentPreviewThumb';
import {
  inboxPostThumbSrc,
  prefetchInboxPostMedia,
  readInboxPostMediaForThumb,
} from '@/lib/inbox/inbox-post-media-prefetch';

type Props = {
  accountId: string;
  platformPostId: string;
  platform: string;
  fallbackImageUrl?: string | null;
  /** When true, show the platform text-post tile instead of a generic placeholder. */
  textOnlyPost?: boolean;
  className?: string;
  size?: 'sm' | 'md';
};

export function InboxCommentThumb({
  accountId,
  platformPostId,
  platform,
  fallbackImageUrl,
  textOnlyPost = false,
  className = '',
  size = 'sm',
}: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(() =>
    inboxPostThumbSrc(accountId, platformPostId, fallbackImageUrl)
  );
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    const sync = () => {
      const cached = readInboxPostMediaForThumb(accountId, platformPostId);
      if (cached?.kind === 'video' && cached.src) {
        setVideoSrc(cached.src);
        setVideoPoster(cached.poster ?? null);
        setImgSrc(cached.poster ?? null);
        return;
      }
      setVideoSrc(null);
      setVideoPoster(null);
      setImgSrc(inboxPostThumbSrc(accountId, platformPostId, fallbackImageUrl));
    };
    sync();
    prefetchInboxPostMedia(accountId, platformPostId, platform, fallbackImageUrl);
    window.addEventListener('izop-inbox-post-media-cache', sync);
    return () => window.removeEventListener('izop-inbox-post-media-cache', sync);
  }, [accountId, platformPostId, platform, fallbackImageUrl]);

  const dim = size === 'md' ? 'w-14 h-[4.25rem]' : 'w-11 h-14';

  if (videoSrc && !imgFailed) {
    return (
      <div
        className={`${dim} shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-900 ${className}`}
      >
        <video
          src={videoSrc}
          poster={videoPoster ?? undefined}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  if (!imgSrc || imgFailed) {
    if (textOnlyPost) {
      return (
        <PostHistoryTextThumb variant="inbox" className={`${dim} ${className}`} />
      );
    }
    return (
      <div
        className={`${dim} shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 flex items-center justify-center ${className}`}
        aria-hidden
      >
        <ImageIcon size={size === 'md' ? 18 : 14} className="text-neutral-300 dark:text-neutral-600" />
      </div>
    );
  }

  return (
    <div
      className={`${dim} shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      <img
        src={imgSrc}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}
