'use client';

import React from 'react';
import { draftMediaDisplayUrl } from '@/lib/ai/izop-draft-media-display';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import type { DraftAccountDisplay } from '@/lib/composer/draft-account-display';

type PreviewMedia = {
  fileUrl: string;
  type: 'IMAGE' | 'VIDEO';
};

type Props = {
  platform: string;
  account: DraftAccountDisplay;
  caption: string;
  mediaType: string;
  media: PreviewMedia | null;
};

function ProfileAvatar({
  platform,
  profilePicture,
  profileName,
  sizeClass = 'w-9 h-9',
}: {
  platform: string;
  profilePicture: string | null;
  profileName: string;
  sizeClass?: string;
}) {
  const src = avatarDisplayUrl(platform, profilePicture) ?? draftMediaDisplayUrl(profilePicture);
  return (
    <div
      className={`${sizeClass} rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-neutral-600 dark:text-neutral-300`}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        profileName.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function PreviewImage({ url, className = '' }: { url: string; className?: string }) {
  return (
    <img
      src={url}
      alt=""
      className={`block max-w-full w-auto h-auto max-h-[min(420px,70vh)] object-contain ${className}`.trim()}
    />
  );
}

function PreviewMediaBlock({
  media,
  mediaType,
  className = 'mt-3',
}: {
  media: PreviewMedia;
  mediaType: string;
  className?: string;
}) {
  const url = draftMediaDisplayUrl(media.fileUrl);
  if (!url) return null;

  const vertical =
    mediaType === 'reel' ||
    mediaType === 'story' ||
    media.type === 'VIDEO';

  return (
    <div
      className={`${className} overflow-hidden inline-block max-w-full ${
        vertical
          ? 'rounded-xl border border-neutral-200 dark:border-neutral-800 bg-black max-w-[280px]'
          : 'rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900'
      }`}
    >
      {media.type === 'VIDEO' ? (
        <video src={url} controls className={`w-full ${vertical ? 'max-h-72 object-contain' : 'max-h-72 object-contain'}`} />
      ) : (
        <PreviewImage url={url} />
      )}
    </div>
  );
}

function ThreadsPreview({ account, caption, media, mediaType }: Omit<Props, 'platform'>) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
      <div className="flex gap-3">
        <ProfileAvatar
          platform="THREADS"
          profilePicture={account.profilePicture}
          profileName={account.username}
          sizeClass="w-10 h-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] leading-tight">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {account.username}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0">·</span>
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0 text-sm">now</span>
          </div>
          <p className="mt-1.5 text-[15px] text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
            {caption}
          </p>
          {media ? <PreviewMediaBlock media={media} mediaType={mediaType} /> : null}
        </div>
      </div>
    </div>
  );
}

function InstagramPreview({ account, caption, media }: Omit<Props, 'platform' | 'mediaType'>) {
  const mediaUrl = media ? draftMediaDisplayUrl(media.fileUrl) : '';
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <ProfileAvatar
          platform="INSTAGRAM"
          profilePicture={account.profilePicture}
          profileName={account.username}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {account.username}
          </p>
        </div>
      </div>
      {media && mediaUrl ? (
        <div className="bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
          {media.type === 'VIDEO' ? (
            <video src={mediaUrl} controls className="max-w-full max-h-[min(420px,70vh)] object-contain" />
          ) : (
            <PreviewImage url={mediaUrl} />
          )}
        </div>
      ) : null}
      <div className="px-3 py-2.5">
        <p className="text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
          <span className="font-semibold mr-1.5">{account.username}</span>
          {caption}
        </p>
      </div>
    </div>
  );
}

function TwitterPreview({ account, caption, media, mediaType }: Omit<Props, 'platform'>) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
      <div className="flex gap-3">
        <ProfileAvatar
          platform="TWITTER"
          profilePicture={account.profilePicture}
          profileName={account.profileName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0 text-sm">
            <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
              {account.profileName}
            </span>
            <span className="text-neutral-500 truncate">{account.handle}</span>
            <span className="text-neutral-400 shrink-0">· now</span>
          </div>
          <p className="mt-1 text-[15px] text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
            {caption}
          </p>
          {media ? <PreviewMediaBlock media={media} mediaType={mediaType} /> : null}
        </div>
      </div>
    </div>
  );
}

function DefaultPreview({ platform, account, caption, media, mediaType }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <ProfileAvatar
          platform={platform}
          profilePicture={account.profilePicture}
          profileName={account.profileName}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {account.profileName}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{account.handle}</p>
        </div>
      </div>
      {media ? (
        <div className="px-3 pt-3">
          <PreviewMediaBlock media={media} mediaType={mediaType} />
        </div>
      ) : null}
      <div className="px-3 py-2.5">
        <p className="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed break-words">
          {caption}
        </p>
      </div>
    </div>
  );
}

export function IzopPostDraftPreview({ platform, account, caption, media, mediaType }: Props) {
  const upper = platform.toUpperCase();
  if (upper === 'THREADS') {
    return <ThreadsPreview account={account} caption={caption} media={media} mediaType={mediaType} />;
  }
  if (upper === 'INSTAGRAM') {
    return <InstagramPreview account={account} caption={caption} media={media} />;
  }
  if (upper === 'TWITTER') {
    return <TwitterPreview account={account} caption={caption} media={media} mediaType={mediaType} />;
  }
  return (
    <DefaultPreview
      platform={platform}
      account={account}
      caption={caption}
      media={media}
      mediaType={mediaType}
    />
  );
}
