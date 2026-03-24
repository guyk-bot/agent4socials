'use client';

import React from 'react';

type IconProps = { size?: number; className?: string; softenOnLight?: boolean };

const SOCIAL_ICON_SRC: Record<string, string> = {
  tiktok: '/social-icons/tiktok.svg',
  instagram: '/social-icons/instagram.svg',
  facebook: '/social-icons/facebook.svg',
  youtube: '/social-icons/youtube.svg',
  linkedin: '/social-icons/linkedin.svg',
  pinterest: '/social-icons/pinterest.svg',
  x: '/social-icons/x.svg',
};

function SocialIconImg({
  name,
  size = 24,
  className = '',
  softenOnLight = false,
}: {
  name: keyof typeof SOCIAL_ICON_SRC;
  size?: number;
  className?: string;
  softenOnLight?: boolean;
}) {
  const src = SOCIAL_ICON_SRC[name];
  if (!src) return null;
  const softenWhiteEdges = softenOnLight && (name === 'instagram' || name === 'x' || name === 'linkedin');
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{
          width: size,
          height: size,
          maxWidth: size,
          maxHeight: size,
          display: 'block',
          objectFit: 'contain',
          ...(softenWhiteEdges
            ? { mixBlendMode: 'multiply', filter: 'contrast(1.05) saturate(1.03)' }
            : {}),
        }}
      />
    </span>
  );
}

export function TikTokIcon(props: IconProps) {
  return <SocialIconImg name="tiktok" {...props} />;
}

export function InstagramIcon(props: IconProps) {
  return <SocialIconImg name="instagram" {...props} />;
}

export function FacebookIcon(props: IconProps) {
  return <SocialIconImg name="facebook" {...props} />;
}

export function YoutubeIcon(props: IconProps) {
  return <SocialIconImg name="youtube" {...props} />;
}

export function LinkedinIcon(props: IconProps) {
  return <SocialIconImg name="linkedin" {...props} />;
}

export function PinterestIcon(props: IconProps) {
  return <SocialIconImg name="pinterest" {...props} />;
}

export function XTwitterIcon(props: IconProps) {
  return <SocialIconImg name="x" {...props} />;
}

export const PLATFORM_ICON_MAP = {
  INSTAGRAM: InstagramIcon,
  FACEBOOK: FacebookIcon,
  TIKTOK: TikTokIcon,
  YOUTUBE: YoutubeIcon,
  TWITTER: XTwitterIcon,
  LINKEDIN: LinkedinIcon,
  PINTEREST: PinterestIcon,
} as const;

/** Render platform icon by id; use className for X (e.g. text-neutral-800 on light bg) */
export function PlatformIcon({
  platform,
  size = 24,
  className = '',
}: { platform: keyof typeof PLATFORM_ICON_MAP; size?: number; className?: string }) {
  const Icon = PLATFORM_ICON_MAP[platform];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
