'use client';

import React from 'react';
import { PanelLeft } from 'lucide-react';

type Props = {
  onOpen: () => void;
  className?: string;
};

/** Shown in the main panel when the chat sidebar is collapsed (Claude-style). */
export default function AysopChatSidebarToggle({ onOpen, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rounded-lg p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors ${className}`}
      aria-label="Open sidebar"
      title="Open sidebar"
    >
      <PanelLeft size={20} />
    </button>
  );
}
