'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { InstagramIcon, FacebookIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
};

const TWITTER_CHAR_LIMIT = 280;

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'INSTAGRAM': return <InstagramIcon size={20} />;
    case 'FACEBOOK': return <FacebookIcon size={20} />;
    case 'TWITTER': return <XTwitterIcon size={20} className="text-neutral-800" />;
    case 'LINKEDIN': return <LinkedinIcon size={20} />;
    default: return <ExternalLink size={20} />;
  }
}

type PlatformData = { platform: string; username: string; caption: string; media: { fileUrl: string; type: string }[] };

export default function PostOpenClient({
  data,
  baseUrl,
  pageUrl,
}: {
  data: { content: string; platforms: PlatformData[] };
  baseUrl: string;
  pageUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<Record<string, number>>({});

  const copyCaption = (platform: string, caption: string) => {
    navigator.clipboard.writeText(caption);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareUrls: Record<string, (caption: string, media: { fileUrl: string; type: string }[]) => string> = {
    TWITTER: (caption) => {
      const truncated = caption.length > TWITTER_CHAR_LIMIT ? caption.slice(0, TWITTER_CHAR_LIMIT - 3) + '...' : caption;
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(truncated)}`;
    },
    LINKEDIN: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    FACEBOOK: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Your post is ready</h1>
          <p className="text-sm text-neutral-500 mt-1">Open each platform below to edit, add sound, and publish manually.</p>
        </div>
        {data.platforms.map(({ platform, username, caption, media }) => {
          const shareUrl = shareUrls[platform]?.(caption, media);
          const idx = carouselIndex[platform] ?? 0;
          const images = media.filter((m) => m.type === 'IMAGE');
          return (
            <div key={platform} className="card space-y-4">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={platform} />
                <span className="font-medium text-neutral-900">{PLATFORM_LABELS[platform] || platform}</span>
                {username && <span className="text-neutral-500 text-sm">@{username}</span>}
              </div>
              {media.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-500">Media ({media.length} {media.length === 1 ? 'item' : 'items'})</p>
                  {images.length > 0 ? (
                    <div className="relative overflow-hidden rounded-lg bg-neutral-100">
                      <div
                        className="flex transition-transform duration-200"
                        style={{ transform: `translateX(-${idx * 100}%)` }}
                      >
                        {images.map((m, i) => (
                          <a
                            key={i}
                            href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 w-full"
                          >
                            <img src={m.fileUrl} alt="" className="w-full max-h-64 object-contain bg-neutral-200" />
                          </a>
                        ))}
                      </div>
                      {images.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCarouselIndex((p) => ({ ...p, [platform]: Math.max(0, (p[platform] ?? 0) - 1) }))}
                            className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarouselIndex((p) => ({ ...p, [platform]: Math.min(images.length - 1, (p[platform] ?? 0) + 1) }))}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                          >
                            <ChevronRight size={20} />
                          </button>
                          <div className="flex justify-center gap-1 mt-2">
                            {images.map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setCarouselIndex((p) => ({ ...p, [platform]: i }))}
                                className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-indigo-600' : 'bg-neutral-300'}`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {media.map((m, i) => (
                        <a
                          key={i}
                          href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-24 h-24 rounded-lg overflow-hidden bg-neutral-200 flex items-center justify-center"
                        >
                          {m.type === 'VIDEO' ? (
                            <span className="text-xs text-neutral-500">Video</span>
                          ) : (
                            <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">Click images to open or download. X (Twitter) web share does not support images; add them manually in X.</p>
                </div>
              )}
              <p className="text-sm text-neutral-700 whitespace-pre-wrap break-words">{caption || 'No caption'}</p>
              {platform === 'TWITTER' && caption.length > TWITTER_CHAR_LIMIT && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                  Caption is {caption.length} chars. X limit is {TWITTER_CHAR_LIMIT}. The &quot;Open in X&quot; button will use the first {TWITTER_CHAR_LIMIT} chars. Copy the full caption below if needed.
                </p>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                {shareUrl && (
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    <ExternalLink size={16} />
                    Open in {PLATFORM_LABELS[platform] || platform}
                  </a>
                )}
                {(platform === 'INSTAGRAM' || platform === 'TWITTER' || platform === 'LINKEDIN') && (
                  <button
                    type="button"
                    onClick={() => copyCaption(platform, caption)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
                  >
                    {copied === platform ? <Check size={16} /> : <Copy size={16} />}
                    {copied === platform ? 'Copied' : 'Copy caption'}
                  </button>
                )}
                {platform === 'INSTAGRAM' && (
                  <span className="text-xs text-neutral-500">Then open the Instagram app and create a new post.</span>
                )}
                {platform === 'LINKEDIN' && (
                  <span className="text-xs text-neutral-500">LinkedIn will show a preview of this page. Paste your caption in the post.</span>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-center text-sm text-neutral-500">
          <Link href="/" className="text-indigo-600 hover:underline">Back to Agent4Socials</Link>
        </p>
      </div>
    </div>
  );
}
