'use client';

import { useState } from 'react';
import { isAnalyticsTextOnlyPost, normalizeAnalyticsPlatform } from '@/lib/post-history-format';
import { PlatformIcon, PLATFORM_ICON_MAP } from '@/components/SocialPlatformIcons';

function iconSizeForThumbClass(className: string): number {
  if (className.includes('w-14') || className.includes('h-14')) return 24;
  if (className.includes('w-12') || className.includes('h-12')) return 22;
  if (className.includes('w-11') || className.includes('h-11')) return 20;
  return 18;
}

/** Text-only post preview: platform mark in a neutral tile (Post History + Inbox). */
export function PostHistoryTextThumb({
  platform,
  className = 'w-9 h-9',
}: {
  platform?: string | null;
  className?: string;
}) {
  const plat = normalizeAnalyticsPlatform(platform);
  const mapped = plat in PLATFORM_ICON_MAP ? (plat as keyof typeof PLATFORM_ICON_MAP) : null;
  const iconSize = iconSizeForThumbClass(className);

  return (
    <div
      className={`rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 ${className}`}
      aria-hidden
    >
      {mapped ? (
        <PlatformIcon
          platform={mapped}
          size={iconSize}
          className={mapped === 'TWITTER' ? 'text-neutral-800 dark:text-neutral-200' : ''}
        />
      ) : (
        <span className="text-sm font-semibold text-slate-500 dark:text-neutral-400">Aa</span>
      )}
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

/** Post preview cell: platform icon for text-only posts, image thumbnail when available. */
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
    return <PostHistoryTextThumb platform={platform} className={className} />;
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
