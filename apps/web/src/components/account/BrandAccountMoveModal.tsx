'use client';

import React from 'react';
import { ConfirmModal } from '@/components/ConfirmModal';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'X (Twitter)',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads',
};

export type BrandAccountMovePrompt = {
  accountId: string;
  platform: string;
  username?: string;
  fromBrandName: string;
};

type BrandAccountMoveModalProps = {
  prompt: BrandAccountMovePrompt | null;
  activeBrandName: string;
  onMove: () => void | Promise<void>;
  onKeepOnOtherBrand: () => void | Promise<void>;
};

export function BrandAccountMoveModal({
  prompt,
  activeBrandName,
  onMove,
  onKeepOnOtherBrand,
}: BrandAccountMoveModalProps) {
  if (!prompt) return null;

  const platformLabel = PLATFORM_LABELS[prompt.platform] ?? prompt.platform;
  const accountLabel = prompt.username?.trim() || platformLabel;

  return (
    <ConfirmModal
      open
      variant="info"
      title="Account connected on another brand"
      message={
        prompt.platform === 'INSTAGRAM'
          ? `${platformLabel} (${accountLabel}) is already connected under "${prompt.fromBrandName}". Move it to "${activeBrandName}"? Your Facebook Page on the other brand is not changed.`
          : `${platformLabel} (${accountLabel}) is already connected under "${prompt.fromBrandName}". Move it to "${activeBrandName}" so it shows in this brand's sidebar and analytics?`
      }
      confirmLabel="Move to this brand"
      cancelLabel="Keep on other brand"
      onConfirm={onMove}
      onClose={onKeepOnOtherBrand}
      closeOnConfirm={false}
    />
  );
}
