'use client';

import { useState } from 'react';
import { isAnalyticsTextOnlyPost, normalizeAnalyticsPlatform } from '@/lib/post-history-format';
import { PlatformIcon, PLATFORM_ICON_MAP } from '@/components/SocialPlatformIcons';

function iconSizeForThumb(className: string, variant: 'default' | 'inbox'): number {
  if (variant === 'inbox') {
    if (className.includes('w-24')) return 44;
    if (className.includes('w-14') || className.includes('h-[4.25rem]')) return 34;
    return 28;
  }
  if (className.includes('w-16')) return 38;
  if (className.includes('w-12')) return 26;
  return 22;
}

type PostHistoryTextThumbProps = {
  platform?: string | null;
  className?: string;
  /** Inbox list uses a taller frame; history table uses a compact square. */
  variant?: 'default' | 'inbox';
};

/** Text-only post preview: full-color platform mark in a bordered frame (Post History + Inbox). */
export function PostHistoryTextThumb({
  platform,
  className = 'w-9 h-9',
  variant = 'default',
}: PostHistoryTextThumbProps) {
  const plat = normalizeAnalyticsPlatform(platform);
  const mapped = plat in PLATFORM_ICON_MAP ? (plat as keyof typeof PLATFORM_ICON_MAP) : null;
  const iconSize = iconSizeForThumb(className, variant);

  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 ${className}`}
      aria-hidden
    >
      {mapped ? (
        <PlatformIcon
          platform={mapped}
          size={iconSize}
          className={mapped === 'TWITTER' ? 'text-neutral-900 dark:text-neutral-100' : ''}
        />
      ) : (
        <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">Aa</span>
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
