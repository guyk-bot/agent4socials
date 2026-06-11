'use client';

import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  inboxPostThumbSrc,
  prefetchInboxPostMedia,
} from '@/lib/inbox/inbox-post-media-prefetch';

type Props = {
  accountId: string;
  platformPostId: string;
  platform: string;
  fallbackImageUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md';
};

export function InboxCommentThumb({
  accountId,
  platformPostId,
  platform,
  fallbackImageUrl,
  className = '',
  size = 'sm',
}: Props) {
  const [src, setSrc] = useState<string | null>(() =>
    inboxPostThumbSrc(accountId, platformPostId, fallbackImageUrl)
  );
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    const sync = () => {
      setSrc(inboxPostThumbSrc(accountId, platformPostId, fallbackImageUrl));
    };
    sync();
    prefetchInboxPostMedia(accountId, platformPostId, platform, fallbackImageUrl);
    window.addEventListener('izop-inbox-post-media-cache', sync);
    return () => window.removeEventListener('izop-inbox-post-media-cache', sync);
  }, [accountId, platformPostId, platform, fallbackImageUrl]);

  const dim = size === 'md' ? 'w-14 h-[4.25rem]' : 'w-11 h-14';

  if (!src || imgFailed) {
    return (
      <div
        className={`${dim} shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center ${className}`}
        aria-hidden
      >
        <ImageIcon size={size === 'md' ? 18 : 14} className="text-neutral-300" />
      </div>
    );
  }

  return (
    <div
      className={`${dim} shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}
