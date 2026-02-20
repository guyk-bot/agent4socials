'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Copy, Check, ChevronLeft, ChevronRight, Download, Send } from 'lucide-react';
import { InstagramIcon, FacebookIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
};

const TWITTER_CHAR_LIMIT = 256;

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
  postId,
  token,
}: {
  data: { content: string; platforms: PlatformData[] };
  baseUrl: string;
  pageUrl: string;
  postId?: string;
  token?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<Record<string, number>>({});
  const [editedCaptions, setEditedCaptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.platforms.map((p) => [p.platform, p.caption]))
  );
  const captionFor = (platform: string, fallback: string) => editedCaptions[platform] ?? fallback;

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

  const copyCaptionAndOpenLinkedIn = (caption: string) => {
    navigator.clipboard.writeText(caption);
    setCopied('LINKEDIN');
    setTimeout(() => setCopied(null), 3000);
    window.open(shareUrls.LINKEDIN(caption, []), '_blank', 'noopener,noreferrer');
  };

  const handlePublishNow = async () => {
    if (!postId || !token) return;
    setPublishState('loading');
    setPublishError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, contentByPlatform: editedCaptions }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(json?.message || 'Failed to publish');
        setPublishState('error');
        return;
      }
      setPublishState('done');
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Network error');
      setPublishState('error');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Your post is ready</h1>
          <p className="text-sm text-neutral-500 mt-1">X and LinkedIn cannot open with images in the browser. Use &quot;Publish now&quot; to post as-is, or download media and post manually.</p>
        </div>
        {postId && token && (
          <div className="card space-y-3 border-2 border-indigo-200 bg-indigo-50/50">
            <p className="text-sm font-semibold text-neutral-900">Option 1: Post directly (with images)</p>
            <p className="text-xs text-neutral-600">Publish to your connected accounts with captions and media as-is. Best for X and LinkedIn (no need to open them in the browser or add images manually).</p>
            <button
              type="button"
              onClick={handlePublishNow}
              disabled={publishState === 'loading'}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {publishState === 'loading' ? (
                <>
                  <Send size={16} className="animate-pulse" />
                  Publishing…
                </>
              ) : publishState === 'done' ? (
                <>
                  <Check size={16} />
                  Published
                </>
              ) : (
                <>
                  <Send size={16} />
                  Publish now
                </>
              )}
            </button>
            {publishError && <p className="text-sm text-red-600">{publishError}</p>}
          </div>
        )}
        {data.platforms.some((p) => p.media.length > 0) && (
          <div className="card space-y-2">
            <p className="text-sm font-medium text-neutral-900">Option 2: Download media</p>
            <p className="text-xs text-neutral-500">Save each image or video to your device, then upload them in X or LinkedIn and paste the caption. Use this if you prefer to post manually.</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Map(data.platforms.flatMap((p) => p.media.map((m) => [m.fileUrl, m]))).entries()).map(([url, m], i) => (
                <a
                  key={i}
                  href={url.startsWith('http') ? url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium hover:bg-neutral-200"
                >
                  <Download size={14} />
                  {m.type === 'VIDEO' ? `Video ${i + 1}` : `Image ${i + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}
        {data.platforms.map(({ platform, username, caption, media }) => {
          const currentCaption = captionFor(platform, caption);
          const shareUrl = shareUrls[platform]?.(currentCaption, media);
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
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500">Media ({media.length} {media.length === 1 ? 'item' : 'items'})</p>
                    <span className="text-xs text-neutral-500">Use the Download button on each item to save and upload in the app</span>
                  </div>
                  {images.length > 0 ? (
                    <div className="relative overflow-hidden rounded-lg bg-neutral-100">
                      <div
                        className="flex transition-transform duration-200"
                        style={{ transform: `translateX(-${idx * 100}%)` }}
                      >
                        {images.map((m, i) => (
                          <div key={i} className="flex-shrink-0 w-full relative group">
                            <a
                              href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img src={m.fileUrl} alt="" className="w-full max-h-64 object-contain bg-neutral-200" />
                            </a>
                            <a
                              href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black/60 text-white text-xs font-medium hover:bg-black/80"
                            >
                              <Download size={14} />
                              Download
                            </a>
                          </div>
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
                        <div key={i} className="relative group">
                          <a
                            href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-24 h-24 rounded-lg overflow-hidden bg-neutral-200 flex items-center justify-center"
                          >
                            {m.type === 'VIDEO' ? (
                              <span className="text-xs text-neutral-500">Video</span>
                            ) : (
                              <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </a>
                          <a
                            href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download"
                          >
                            <Download size={20} className="text-white" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">
                    {platform === 'TWITTER'
                      ? '&quot;Open in X&quot; only pastes the caption. To include images: use &quot;Publish now&quot; at the top or download images above and add them in X.'
                      : platform === 'LINKEDIN'
                        ? '&quot;Open in LinkedIn&quot; only pastes the caption. To include images: use &quot;Publish now&quot; at the top or download images above and add them in LinkedIn.'
                        : 'Use &quot;Publish now&quot; at the top to post with images, or download media to upload manually.'}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-500">Caption (editable)</label>
                <textarea
                  value={currentCaption}
                  onChange={(e) => setEditedCaptions((prev) => ({ ...prev, [platform]: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="No caption"
                />
              </div>
              {platform === 'TWITTER' && currentCaption.length > TWITTER_CHAR_LIMIT && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                  Caption is {currentCaption.length} chars. X limit is {TWITTER_CHAR_LIMIT} (including spaces). The &quot;Open in X&quot; button will use the first {TWITTER_CHAR_LIMIT} chars.
                </p>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                {(platform === 'INSTAGRAM' || platform === 'TWITTER' || platform === 'LINKEDIN') && (
                  <button
                    type="button"
                    onClick={() => copyCaption(platform, currentCaption)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
                  >
                    {copied === platform ? <Check size={16} /> : <Copy size={16} />}
                    {copied === platform ? 'Copied' : 'Copy caption'}
                  </button>
                )}
                {shareUrl && platform !== 'LINKEDIN' && (
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
                {platform === 'LINKEDIN' && shareUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => copyCaptionAndOpenLinkedIn(currentCaption)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
                    >
                      <ExternalLink size={16} />
                      Copy caption and open LinkedIn (manual: paste + add images)
                    </button>
                    <span className="text-xs text-neutral-500 w-full block">
                      LinkedIn web share does not attach images. Prefer &quot;Publish now&quot; at the top to post with media, or download images and add them in LinkedIn.
                    </span>
                  </>
                )}
                {platform === 'INSTAGRAM' && (
                  <span className="text-xs text-neutral-500">Then open the Instagram app and create a new post.</span>
                )}
                {platform === 'TWITTER' && (
                  <span className="text-xs text-neutral-500">
                    &quot;Open in X&quot; only pastes the caption. To include images, use &quot;Publish now&quot; at the top or download images and add them in X.
                  </span>
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
