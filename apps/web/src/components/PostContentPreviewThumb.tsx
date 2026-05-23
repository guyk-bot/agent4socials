'use client';

import { useState } from 'react';
import { isAnalyticsTextOnlyPost, normalizeAnalyticsPlatform } from '@/lib/post-history-format';

export function PostHistoryTextThumb({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 ${className}`}
      aria-hidden
    >
      <span className="text-sm font-semibold text-slate-500 dark:text-neutral-400">Aa</span>
    </div>
  );
}

type PostContentPreviewThumbProps = {
  platform?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
  className?: string;
  imgClassName?: string;
  emptyClassName?: string;
  imgExtraProps?: React.ImgHTMLAttributes<HTMLImageElement>;
};

/** Post preview cell: Aa for text-only posts, image thumbnail when available. */
export function PostContentPreviewThumb({
  platform,
  mediaType,
  thumbnailUrl,
  className = 'w-9 h-9',
  imgClassName = 'w-9 h-9 rounded object-cover shrink-0',
  emptyClassName,
  imgExtraProps,
}: PostContentPreviewThumbProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const post = { platform, mediaType, thumbnailUrl };
  const textOnly = isAnalyticsTextOnlyPost(post) || imgFailed;

  if (textOnly) {
    return <PostHistoryTextThumb className={className} />;
  }

  const thumb = (thumbnailUrl ?? '').trim();
  if (!thumb) {
    const plat = normalizeAnalyticsPlatform(platform);
    if (plat === 'TWITTER') return null;
    return (
      <div
        className={`rounded shrink-0 ${emptyClassName ?? className}`}
        style={{ background: 'rgba(124,108,255,0.12)' }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={thumb}
      alt=""
      className={imgClassName}
      onError={() => setImgFailed(true)}
      {...imgExtraProps}
    />
  );
}
