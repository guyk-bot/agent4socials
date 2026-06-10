'use client';

import React, { useState } from 'react';
import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { platformLabelFromId } from '@/lib/funnel-chat-flow';

type Props = {
  platformId: ChatHeroPlatformId;
  username: string;
  profilePicture?: string | null;
  icon?: React.ReactNode;
};

export default function FunnelConnectedAccountCard({
  platformId,
  username,
  profilePicture,
  icon,
}: Props) {
  const label = platformLabelFromId(platformId);
  const handle = username.startsWith('@') ? username : `@${username}`;
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const showPhoto = Boolean(profilePicture?.trim()) && !imageFailed;
  const showAvatar = showPhoto && imageReady;

  return (
    <div className="rounded-xl border border-[#22c55e]/35 bg-[#f0fdf4]/80 dark:bg-[#14532d]/20 p-4 chat-hero-message-enter">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0">
          {showPhoto ? (
            <>
              {!imageReady ? (
                <div
                  className="absolute inset-0 rounded-full bg-[var(--chat-hero-border)]/40 animate-pulse"
                  aria-hidden
                />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profilePicture!}
                alt=""
                className={`h-14 w-14 rounded-full object-cover border border-[var(--chat-hero-border)] ${
                  imageReady ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageReady(true)}
                onError={() => setImageFailed(true)}
              />
            </>
          ) : null}
          {showAvatar && icon ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm dark:border-[#14532d] dark:bg-[#14532d]"
              aria-hidden
            >
              <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
              </span>
            </span>
          ) : null}
          {!showAvatar && icon ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)]">
              {icon}
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#15803d]">Connected successfully</p>
          <p className="text-[17px] font-medium text-[var(--chat-hero-text)] truncate">{handle}</p>
          <p className="text-sm text-[var(--chat-hero-muted)]">{label}</p>
        </div>
      </div>
    </div>
  );
}
