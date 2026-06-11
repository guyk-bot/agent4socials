'use client';

import { useState } from 'react';
import { isAnalyticsTextOnlyPost, normalizeAnalyticsPlatform } from '@/lib/post-history-format';

function textMarkSize(variant: 'default' | 'inbox', className: string): 'sm' | 'md' | 'lg' {
  if (variant === 'inbox') {
    if (className.includes('w-24')) return 'lg';
    if (className.includes('w-14') || className.includes('h-[4.25rem]')) return 'md';
    return 'md';
  }
  if (className.includes('w-12') || className.includes('w-16')) return 'md';
  return 'sm';
}

/** Universal text-post glyph: large capital A + small lowercase a. */
export function TextPostAaMark({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const bigCls =
    size === 'lg' ? 'text-[1.35rem]' : size === 'md' ? 'text-[1.05rem]' : 'text-sm';
  const smallCls =
    size === 'lg' ? 'text-[0.75rem]' : size === 'md' ? 'text-[0.65rem]' : 'text-[0.6rem]';

  return (
    <span
      className="inline-flex items-baseline font-semibold text-slate-500 dark:text-neutral-400 leading-none select-none"
      aria-hidden
    >
      <span className={bigCls}>A</span>
      <span className={`${smallCls} -ml-px`}>a</span>
    </span>
  );
}

type PostHistoryTextThumbProps = {
  className?: string;
  /** Inbox list uses a taller frame; history table uses a compact square. */
  variant?: 'default' | 'inbox';
};

/** Text-only post preview: universal Aa tile (Post History + Inbox, all platforms). */
export function PostHistoryTextThumb({
  className = 'w-9 h-9',
  variant = 'default',
}: PostHistoryTextThumbProps) {
  return (
    <div
      className={`rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 ${className}`}
      aria-hidden
    >
      <TextPostAaMark size={textMarkSize(variant, className)} />
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
