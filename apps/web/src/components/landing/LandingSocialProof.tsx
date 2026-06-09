'use client';

import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@/components/SocialPlatformIcons';

const PLATFORMS = [
  { Icon: InstagramIcon, label: 'Instagram' },
  { Icon: TikTokIcon, label: 'TikTok' },
  { Icon: YoutubeIcon, label: 'YouTube' },
  { Icon: FacebookIcon, label: 'Facebook' },
  { Icon: XTwitterIcon, label: 'X' },
  { Icon: LinkedinIcon, label: 'LinkedIn' },
  { Icon: ThreadsIcon, label: 'Threads' },
  { Icon: PinterestIcon, label: 'Pinterest' },
] as const;

export default function LandingSocialProof() {
  return (
    <section className="landing-social-proof" aria-label="Platforms supported">
      <div className="landing-container flex flex-col items-center justify-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-[#888780] whitespace-nowrap">Trusted by creators on</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {PLATFORMS.map(({ Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[#888780]" title={label}>
              <Icon size={20} className="opacity-80" />
              <span className="hidden lg:inline text-xs">{label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
