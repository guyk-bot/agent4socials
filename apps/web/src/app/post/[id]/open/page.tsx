'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { InstagramIcon, FacebookIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
};

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'INSTAGRAM': return <InstagramIcon size={20} />;
    case 'FACEBOOK': return <FacebookIcon size={20} />;
    case 'TWITTER': return <XTwitterIcon size={20} className="text-neutral-800" />;
    case 'LINKEDIN': return <LinkedinIcon size={20} />;
    default: return <ExternalLink size={20} />;
  }
}

export default function PostOpenPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const t = searchParams?.get('t');
  const [data, setData] = useState<{
    content: string;
    platforms: { platform: string; username: string; caption: string; media: { fileUrl: string; type: string }[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !t) {
      setError('Invalid link');
      return;
    }
    fetch(`/api/posts/${id}/open?t=${encodeURIComponent(t)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Link expired or invalid' : 'Failed to load');
        return res.json();
      })
      .then(setData)
      .catch(() => setError('Link expired or invalid'));
  }, [id, t]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = t ? `${baseUrl}/post/${id}/open?t=${encodeURIComponent(t)}` : '';

  const shareUrls: Record<string, (caption: string, media: { fileUrl: string; type: string }[]) => string> = {
    TWITTER: (caption) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
    LINKEDIN: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    FACEBOOK: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
  };

  const copyCaption = (platform: string, caption: string) => {
    navigator.clipboard.writeText(caption);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <p className="text-neutral-600">{error}</p>
          <Link href="/" className="mt-4 inline-block text-indigo-600 font-medium">Go to Agent4Socials</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Your post is ready</h1>
          <p className="text-sm text-neutral-500 mt-1">Open each platform below to edit, add sound, and publish manually.</p>
        </div>
        {data.platforms.map(({ platform, username, caption, media }) => {
          const shareUrl = shareUrls[platform]?.(caption, media);
          return (
            <div key={platform} className="card space-y-3">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={platform} />
                <span className="font-medium text-neutral-900">{PLATFORM_LABELS[platform] || platform}</span>
                {username && <span className="text-neutral-500 text-sm">@{username}</span>}
              </div>
              {media.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {media.slice(0, 3).map((m, i) => (
                    <a
                      key={i}
                      href={m.fileUrl.startsWith('http') ? m.fileUrl : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-20 h-20 rounded-lg overflow-hidden bg-neutral-200 flex items-center justify-center"
                    >
                      {m.type === 'VIDEO' ? (
                        <span className="text-xs text-neutral-500">Video</span>
                      ) : (
                        <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </a>
                  ))}
                  {media.length > 3 && <span className="text-xs text-neutral-500 self-center">+{media.length - 3}</span>}
                </div>
              )}
              <p className="text-sm text-neutral-700 whitespace-pre-wrap break-words">{caption || 'No caption'}</p>
              <div className="flex flex-wrap gap-2">
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
                {platform === 'INSTAGRAM' && (
                  <>
                    <button
                      type="button"
                      onClick={() => copyCaption(platform, caption)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
                    >
                      {copied === platform ? <Check size={16} /> : <Copy size={16} />}
                      {copied === platform ? 'Copied' : 'Copy caption'}
                    </button>
                    <span className="text-xs text-neutral-500 self-center">Then open the Instagram app and create a new post.</span>
                  </>
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
