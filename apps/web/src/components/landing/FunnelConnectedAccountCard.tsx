'use client';

import React from 'react';
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

  return (
    <div className="rounded-xl border border-[#22c55e]/35 bg-[#f0fdf4]/80 dark:bg-[#14532d]/20 p-4 chat-hero-message-enter">
      <div className="flex items-center gap-3">
        {profilePicture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profilePicture}
            alt=""
            className="h-14 w-14 rounded-full object-cover border border-[var(--chat-hero-border)] shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-full border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#15803d]">Connected successfully</p>
          <p className="text-[17px] font-medium text-[var(--chat-hero-text)] truncate">{handle}</p>
          <p className="text-sm text-[var(--chat-hero-muted)]">{label}</p>
        </div>
      </div>
    </div>
  );
}
