'use client';

import React, { useMemo } from 'react';
import { PlatformIconToggle } from '@/components/PlatformIconToggle';
import {
  InstagramIcon,
  YoutubeIcon,
  TikTokIcon,
  FacebookIcon,
  XTwitterIcon,
  LinkedinIcon,
  PinterestIcon,
} from '@/components/SocialPlatformIcons';

const PLATFORM_ORDER = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN', 'PINTEREST', 'TWITTER'] as const;

const PLATFORM_META: Record<
  (typeof PLATFORM_ORDER)[number],
  { label: string; icon: React.ReactNode }
> = {
  INSTAGRAM: { label: 'Instagram', icon: <InstagramIcon size={26} /> },
  TIKTOK: { label: 'TikTok', icon: <TikTokIcon size={26} /> },
  YOUTUBE: { label: 'YouTube', icon: <YoutubeIcon size={26} /> },
  FACEBOOK: { label: 'Facebook', icon: <FacebookIcon size={26} /> },
  LINKEDIN: { label: 'LinkedIn', icon: <LinkedinIcon size={26} /> },
  PINTEREST: { label: 'Pinterest', icon: <PinterestIcon size={26} /> },
  TWITTER: { label: 'Twitter/X', icon: <XTwitterIcon size={26} className="text-neutral-800 dark:text-neutral-200" /> },
};

export type PostHistoryPlatformFilterProps = {
  connectedPlatforms: string[];
  selectedPlatforms: string[];
  onTogglePlatform: (platform: string) => void;
};

export function PostHistoryPlatformFilter({
  connectedPlatforms,
  selectedPlatforms,
  onTogglePlatform,
}: PostHistoryPlatformFilterProps) {
  const visible = useMemo(() => {
    const connected = new Set(connectedPlatforms);
    return PLATFORM_ORDER.filter((p) => connected.has(p));
  }, [connectedPlatforms]);

  if (visible.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 sm:gap-3"
      role="group"
      aria-label="Filter by platform"
    >
      {visible.map((platform) => {
        const meta = PLATFORM_META[platform];
        return (
          <PlatformIconToggle
            key={platform}
            label={meta.label}
            icon={meta.icon}
            active={selectedPlatforms.includes(platform)}
            onClick={() => onTogglePlatform(platform)}
          />
        );
      })}
    </div>
  );
}

export function postTargetPlatforms(post: {
  targets?: Array<{ platform?: string }>;
  targetPlatforms?: string[];
}): string[] {
  const fromTargets = Array.isArray(post.targets)
    ? post.targets.map((t) => t?.platform).filter((p): p is string => Boolean(p))
    : [];
  if (fromTargets.length > 0) return [...new Set(fromTargets)];
  if (Array.isArray(post.targetPlatforms)) {
    return [...new Set(post.targetPlatforms.filter(Boolean))];
  }
  return [];
}

export function postMatchesPlatformFilter(post: Parameters<typeof postTargetPlatforms>[0], selected: string[]): boolean {
  if (selected.length === 0) return true;
  const platforms = postTargetPlatforms(post);
  return platforms.some((p) => selected.includes(p));
}
