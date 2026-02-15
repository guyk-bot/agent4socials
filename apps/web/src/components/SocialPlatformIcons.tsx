'use client';

import React, { useId } from 'react';

type IconProps = { size?: number; className?: string };

/** TikTok: black circle, white musical note (eighth note) with cyan/magenta glitch */
const TIKTOK_NOTE_PATH = 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z';

export function TikTokIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="12" fill="#000" />
      <g transform="translate(12,12) scale(0.65) translate(-12,-12)">
        <path d={TIKTOK_NOTE_PATH} fill="#00F2EA" style={{ transform: 'translate(-0.6px, 0.6px)' }} opacity={0.85} />
        <path d={TIKTOK_NOTE_PATH} fill="#FF0050" style={{ transform: 'translate(0.6px, -0.6px)' }} opacity={0.85} />
        <path d={TIKTOK_NOTE_PATH} fill="#fff" />
      </g>
    </svg>
  );
}

/** Instagram: rounded square with gradient (purple→pink→orange→yellow), white camera outline */
export function InstagramIcon({ size = 24, className = '' }: IconProps) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect width="24" height="24" rx="6" fill={`url(#ig-${id})`} />
      <path fill="#fff" fillRule="evenodd" d="M7 8a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8zm4-2.5a2.5 2.5 0 0 0-2.5 2.5v8a2.5 2.5 0 0 0 2.5 2.5h2a2.5 2.5 0 0 0 2.5-2.5v-8a2.5 2.5 0 0 0-2.5-2.5h-2z" clipRule="evenodd" />
      <circle cx="12" cy="12" r="2.75" stroke="#fff" strokeWidth="1.2" fill="none" />
      <circle cx="12" cy="12" r="1.4" fill="#fff" />
      <circle cx="16.2" cy="7.8" r="0.9" fill="#fff" />
      <defs>
        <linearGradient id={`ig-${id}`} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#833AB4" />
          <stop offset="0.4" stopColor="#E1306C" />
          <stop offset="0.7" stopColor="#FD1D1D" />
          <stop offset="0.9" stopColor="#F77737" />
          <stop offset="1" stopColor="#FCAF45" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Facebook: blue circle, white f */
export function FacebookIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path d="M16.2 15.2l.5-3.2h-3.1V9.5c0-.9.4-1.7 1.8-1.7h1.4V5.1h-2.5c-2.4 0-4 1.5-4 4.2v2.4H7.2v3.2h2.2v7.8h2.7v-7.8h2.6z" fill="#fff" />
    </svg>
  );
}

/** YouTube: red rounded square, white play button */
export function YoutubeIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect width="24" height="24" rx="5" fill="#FF0000" />
      <path d="M10 8.5v7l5.5-3.5L10 8.5z" fill="#fff" />
    </svg>
  );
}

/** LinkedIn: blue rounded square, white in */
export function LinkedinIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect width="24" height="24" rx="5" fill="#0A66C2" />
      <path d="M7.2 10.2v6.6H5.2v-6.6h2zm.2-2.2c0 .6-.5 1.1-1.2 1.1s-1.2-.5-1.2-1.1.5-1.1 1.2-1.1 1.2.5 1.2 1.1zM16.8 10.2c1.3 0 2.2.9 2.2 2.2v4.4h-2v-4.1c0-.5-.4-.9-.9-.9-.5 0-.9.4-.9.9v4.1h-2v-6.6h2v.4c.3-.5.9-.8 1.5-.8z" fill="#fff" />
    </svg>
  );
}

/** X (Twitter): white X, no background */
export function XTwitterIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export const PLATFORM_ICON_MAP = {
  INSTAGRAM: InstagramIcon,
  FACEBOOK: FacebookIcon,
  TIKTOK: TikTokIcon,
  YOUTUBE: YoutubeIcon,
  TWITTER: XTwitterIcon,
  LINKEDIN: LinkedinIcon,
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
